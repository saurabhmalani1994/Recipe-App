"""Generic, resumable sitemap + schema.org/Recipe JSON-LD fetcher for the cuisine-specialist
sites in `sites.yaml` (slice S17, D19, R16).

Unlike the single-source fetchers (`fetch_bbcgoodfood.py`, `fetch_foodwishes.py`), this one
fetcher drives every site in the registry: each site only needs an entry in `sites.yaml`
(cuisine label, base URL, sitemap URL(s), a URL filter), not its own Python file. It shares
`sitemap_crawler`'s HTTP primitives (`fetch_url`, rate limiting via `common.RateLimiter`) but
runs its own crawl loop per site because it needs three things `sitemap_crawler.crawl` does
not do: (1) expand a `<sitemapindex>` one level to find the real post-sitemap children
(most of these WordPress sites use one), (2) fall back to a homepage-link crawl when a site's
sitemap is unreachable or returns an empty body (seen live on indianhealthyrecipes.com: its
Yoast sitemap index correctly lists `post-sitemap.xml`, but that file itself comes back as a
200 with a 0-byte body from a stale CDN cache -- see ingest/sources_cuisine.md), and
(3) apply R16 (drop anything that reads as Israeli cuisine) per record, counted.

Politeness, per the brief: 1 request/second per site (a fresh `RateLimiter` per site, so
running several sites back to back does not compound into faster-than-1rps against any one
of them), a 20s timeout, and robots.txt is checked before every fetch (not just the root --
a site that allows `/` but disallows one path is still respected on that path).

Output: raw_recipe JSONL at .../raw/<site id>/recipes.jsonl (schema/raw_recipe.md), same
sidecar/resume convention as every other fetcher (`common.SourceWriter`).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests
import yaml

from common import RateLimiter, SourceWriter, clean_list, clean_text

SITES_YAML = Path(__file__).resolve().parent / "sites.yaml"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
TIMEOUT = 20
PER_SECOND = 1.0
DEFAULT_CAP = 300

_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")
_LD_JSON_RE = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
_DURATION_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?")
_ISRAEL_RE = re.compile(r"\bisrael(i)?\b", re.I)


# --------------------------------------------------------------------------- site registry

def load_sites(path: Path = SITES_YAML) -> list[dict]:
    data = yaml.safe_load(path.read_text())
    return data["sites"]


def find_site(sites: list[dict], site_id: str) -> dict | None:
    for s in sites:
        if s["id"] == site_id:
            return s
    return None


# --------------------------------------------------------------------------- HTTP + robots

def fetch(url: str, timeout: int = TIMEOUT) -> requests.Response | None:
    try:
        return requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    except requests.RequestException:
        return None


class RobotsCache:
    """One RobotFileParser per host, fetched lazily. A missing/unreachable robots.txt is
    treated as allow-all (the same convention `sitemap_crawler`'s sites use implicitly)."""

    def __init__(self):
        self._parsers: dict[str, robotparser.RobotFileParser | None] = {}

    def _parser_for(self, url: str) -> robotparser.RobotFileParser | None:
        host = urlparse(url).netloc
        if host not in self._parsers:
            rp = robotparser.RobotFileParser()
            r = fetch(f"https://{host}/robots.txt")
            if r is not None and r.status_code == 200 and r.text.strip():
                rp.parse(r.text.splitlines())
                self._parsers[host] = rp
            else:
                self._parsers[host] = None
        return self._parsers[host]

    def allowed(self, url: str) -> bool:
        rp = self._parser_for(url)
        if rp is None:
            return True
        return rp.can_fetch(USER_AGENT, url)


# --------------------------------------------------------------------------- URL discovery

def sitemap_locs(url: str) -> list[str] | None:
    r = fetch(url)
    if r is None or r.status_code != 200 or not r.text.strip():
        return None
    return _LOC_RE.findall(r.text)


def discover_page_urls(site: dict, limiter: RateLimiter) -> tuple[list[str], str]:
    """Returns (page_urls, method) where method is 'sitemap' or 'homepage_fallback', for the
    progress sidecar and the run summary (rule 17: say which kind of check produced a fact)."""
    url_filter = re.compile(site["url_filter"])
    collected: list[str] = []
    for sm in site["sitemap_urls"]:
        limiter.wait()
        locs = sitemap_locs(sm)
        if not locs:
            continue
        if all(l.endswith(".xml") for l in locs):
            # A <sitemapindex>: expand one level.
            for child in locs:
                limiter.wait()
                child_locs = sitemap_locs(child)
                if child_locs:
                    collected.extend(child_locs)
        else:
            collected.extend(locs)
    filtered = [u for u in collected if url_filter.search(u)]
    if filtered:
        return filtered, "sitemap"

    # Fallback: crawl the homepage for internal links that look like content pages, then
    # keep those matching url_filter, then those that at least look post-like if none match.
    limiter.wait()
    r = fetch(site["base_url"])
    if r is None or r.status_code != 200:
        return [], "homepage_fallback"
    hrefs = re.findall(r'href="([^"]+)"', r.text)
    base_host = urlparse(site["base_url"]).netloc
    exclude_re = re.compile(
        r"/(wp-content|wp-json|category|tag|author|page|feed|comments|"
        r"privacy|about|contact|shop|cdn-cgi)/", re.I
    )
    candidates = []
    for h in hrefs:
        full = urljoin(site["base_url"], h)
        if urlparse(full).netloc != base_host or full in candidates:
            continue
        if exclude_re.search(full):
            continue
        if re.search(r"\.(png|jpg|jpeg|gif|webp|svg|css|js|ico)(\?|$)", full, re.I):
            continue
        candidates.append(full)
    matched = [u for u in candidates if url_filter.search(u)]
    return (matched or candidates), "homepage_fallback"


# --------------------------------------------------------------------------- JSON-LD parsing

def _iso_duration_to_min(s: str | None) -> int | None:
    if not s:
        return None
    m = _DURATION_RE.match(s.strip())
    if not m:
        return None
    h, mi = m.groups()
    if h is None and mi is None:
        return None
    return int(h or 0) * 60 + int(mi or 0)


def find_recipe_ld(html_text: str) -> dict | None:
    """Generic schema.org/Recipe finder: handles a bare Recipe object, a list of top-level
    objects, and the `@graph` shape (WPRM/Yoast and similar plugins wrap the Recipe inside
    `@graph` alongside WebPage/BreadcrumbList/Organization nodes)."""
    for block in _LD_JSON_RE.findall(html_text):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            # A handful of sites (seen on persianpot.com) emit LD-JSON with raw control
            # characters inside string values, which is invalid JSON; skip rather than guess.
            continue
        candidates = data if isinstance(data, list) else [data]
        for d in candidates:
            if not isinstance(d, dict):
                continue
            t = d.get("@type")
            if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                return d
            if "@graph" in d:
                for g in d["@graph"]:
                    if isinstance(g, dict) and g.get("@type") == "Recipe":
                        return g
    return None


def _instructions_to_steps(instr) -> list[str]:
    if instr is None:
        return []
    if isinstance(instr, str):
        return clean_list([instr])
    out = []
    for item in instr:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict):
            if item.get("@type") == "HowToSection" and "itemListElement" in item:
                for sub in item["itemListElement"]:
                    if isinstance(sub, dict):
                        out.append(sub.get("text") or sub.get("name") or "")
            else:
                out.append(item.get("text") or item.get("name") or "")
    return clean_list(out)


def _first(value):
    if isinstance(value, list):
        value = value[0] if value else None
    if value is not None and not isinstance(value, str):
        value = str(value)
    return value


def israeli_exclusion_reason(rec: dict) -> str | None:
    """R16: per D19, drop anything that presents as Israeli cuisine. Checked on the title,
    cuisine_label and tags -- the fields a source uses to say what a dish or site is."""
    haystack = " ".join(
        [rec.get("title", ""), rec.get("cuisine_label", "")] + rec.get("tags", [])
    )
    if _ISRAEL_RE.search(haystack):
        return "R16: reads as Israeli cuisine (title/cuisine_label/tags)"
    return None


def parse_recipe_page(html_text: str, url: str, site: dict) -> dict | None:
    ld = find_recipe_ld(html_text)
    if ld is None:
        return None
    title = clean_text(ld.get("name"))
    ingredients = clean_list(ld.get("recipeIngredient") or ld.get("ingredients") or [])
    steps = _instructions_to_steps(ld.get("recipeInstructions"))
    if not title or (not ingredients and not steps):
        return None

    slug = urlparse(url).path.strip("/").replace("/", "_") or title.lower().replace(" ", "-")
    rec: dict = {
        "id": f"{site['id']}:{slug}",
        "source": site["id"],
        "source_url": url,
        "title": title,
        "ingredients": ingredients,
        "steps": steps,
        "cuisine_label": site["cuisine_label"],
    }
    category = ld.get("recipeCategory")
    if category:
        rec["category"] = clean_text(_first(category))
    source_cuisine = ld.get("recipeCuisine")
    if source_cuisine:
        # The source's own recipeCuisine is kept as a tag, since sites.yaml's cuisine_label
        # (what this site as a whole was picked for) is the field ingest/cuisine expects.
        rec.setdefault("tags", [])
        rec["tags"].append(clean_text(_first(source_cuisine)))
    rating = ld.get("aggregateRating") or {}
    if isinstance(rating, dict) and rating.get("ratingValue") is not None:
        try:
            rec["rating"] = float(rating["ratingValue"])
        except (TypeError, ValueError):
            pass
        if rating.get("ratingCount") is not None:
            try:
                rec["rating_count"] = int(rating["ratingCount"])
            except (TypeError, ValueError):
                pass
    total = _iso_duration_to_min(ld.get("totalTime"))
    if total is not None:
        rec["total_time_min"] = total
    prep = _iso_duration_to_min(ld.get("prepTime"))
    if prep is not None:
        rec["prep_time_min"] = prep
    cook = _iso_duration_to_min(ld.get("cookTime"))
    if cook is not None:
        rec["cook_time_min"] = cook
    yield_text = ld.get("recipeYield")
    if yield_text:
        rec["yield_text"] = clean_text(_first(yield_text))
    image = ld.get("image")
    if image:
        if isinstance(image, list):
            first = image[0]
            rec["image_url"] = first.get("url") if isinstance(first, dict) else first
        elif isinstance(image, dict):
            rec["image_url"] = image.get("url")
        else:
            rec["image_url"] = image
    keywords = ld.get("keywords")
    if keywords:
        tags = keywords.split(",") if isinstance(keywords, str) else keywords
        rec.setdefault("tags", [])
        rec["tags"].extend(clean_list(tags))
    return rec


# --------------------------------------------------------------------------- crawl loop

def crawl_site(site: dict, cap: int, retry_failed: bool = False) -> dict:
    limiter = RateLimiter(PER_SECOND)
    robots = RobotsCache()
    with SourceWriter(site["id"]) as writer:
        progress = writer.load_progress()
        page_urls: list[str] = progress.get("page_urls") or []
        tried: set[str] = set(progress.get("tried_urls") or [])
        failed: set[str] = set(progress.get("failed_urls") or [])
        discovery_method = progress.get("discovery_method")

        if retry_failed:
            tried -= failed
            failed = set()

        if not page_urls:
            page_urls, discovery_method = discover_page_urls(site, limiter)
            writer.save_progress(
                {
                    "page_urls": page_urls,
                    "tried_urls": list(tried),
                    "failed_urls": list(failed),
                    "discovery_method": discovery_method,
                }
            )
            print(f"[{site['id']}] discovered {len(page_urls)} candidate URLs via {discovery_method}")

        for url in page_urls:
            if writer.written >= cap:
                break
            if url in tried:
                continue
            if not robots.allowed(url):
                writer.drops.drop("robots.txt disallows")
                tried.add(url)
                continue
            limiter.wait()
            r = fetch(url)
            tried.add(url)
            if r is None or r.status_code != 200 or not r.text:
                writer.drops.drop("page fetch failed (non-200, timeout or empty body)")
                failed.add(url)
                writer.save_progress(
                    {
                        "page_urls": page_urls,
                        "tried_urls": list(tried),
                        "failed_urls": list(failed),
                        "discovery_method": discovery_method,
                    }
                )
                continue
            parse_failed = False
            try:
                rec = parse_recipe_page(r.text, url, site)
            except Exception as e:
                writer.drops.drop(f"parse error: {type(e).__name__}")
                rec = None
                parse_failed = True
            if rec is None:
                if not parse_failed:
                    writer.drops.drop("no schema.org Recipe JSON-LD parsed from page")
            else:
                reason = israeli_exclusion_reason(rec)
                if reason:
                    writer.drops.drop(reason)
                else:
                    writer.write(rec)
            writer.save_progress(
                {
                    "page_urls": page_urls,
                    "tried_urls": list(tried),
                    "failed_urls": list(failed),
                    "discovery_method": discovery_method,
                }
            )

        summary = writer.summary()
        summary["cuisine_label"] = site["cuisine_label"]
        summary["discovery_method"] = discovery_method
        return summary


# --------------------------------------------------------------------------- CLI

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--site", action="append", default=None,
        help="Site id from sites.yaml to run (repeatable). Default: all sites.",
    )
    ap.add_argument("--cap", type=int, default=DEFAULT_CAP, help="Max records written per site.")
    ap.add_argument(
        "--retry-failed", action="store_true",
        help="Re-attempt this site's previously-failed page fetches instead of skipping them.",
    )
    ap.add_argument("--sites-file", type=Path, default=SITES_YAML)
    args = ap.parse_args(argv)

    all_sites = load_sites(args.sites_file)
    if args.site:
        chosen = []
        for sid in args.site:
            s = find_site(all_sites, sid)
            if s is None:
                print(f"unknown site id: {sid}", file=sys.stderr)
                return 2
            chosen.append(s)
    else:
        chosen = all_sites

    results = {}
    for site in chosen:
        results[site["id"]] = crawl_site(site, cap=args.cap, retry_failed=args.retry_failed)

    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
