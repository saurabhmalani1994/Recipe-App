"""schema.org/Recipe JSON-LD scraper for bbcgoodfood.com.

Page URLs come from the site's own recipe sitemaps (https://www.bbcgoodfood.com/sitemap.xml
-> the *-recipe.xml children), not a search crawl. Each recipe page embeds a
<script type="application/ld+json"> Recipe block that is complete (ingredients, instructions,
times, yield) even when the article body itself is paywalled, so that is all this fetcher
reads. Resumable and rate-limited via sitemap_crawler.crawl.
"""
from __future__ import annotations

import json
import re

from common import clean_list, clean_text
from sitemap_crawler import crawl

SOURCE = "bbcgoodfood"
ROOT_SITEMAP = "https://www.bbcgoodfood.com/sitemap.xml"
CAP = 300

_LD_JSON_RE = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S
)
_DURATION_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?")


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


def _has_recipe_type(t) -> bool:
    """@type is usually the string "Recipe" but can be a list of types."""
    if t == "Recipe":
        return True
    if isinstance(t, list):
        return "Recipe" in t
    return False


def _find_recipe_ld(html_text: str) -> dict | None:
    for block in _LD_JSON_RE.findall(html_text):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for d in candidates:
            if isinstance(d, dict) and _has_recipe_type(d.get("@type")):
                return d
            # @graph style documents
            if isinstance(d, dict) and "@graph" in d:
                for g in d["@graph"]:
                    if isinstance(g, dict) and _has_recipe_type(g.get("@type")):
                        return g
    return None


def _first_str(value) -> str | None:
    """Best-effort conversion of a schema.org field into a display string.

    Live pages vary this shape per field: a bare number (recipeYield is often a plain
    int, not "Serves N"), a plain string, a list of either, or an object with a
    name/text/value. Returns the first usable string, or None.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (str, int, float)):
        return str(value)
    if isinstance(value, list):
        for item in value:
            s = _first_str(item)
            if s:
                return s
        return None
    if isinstance(value, dict):
        for key in ("name", "text", "value", "url"):
            if value.get(key) is not None:
                s = _first_str(value[key])
                if s:
                    return s
        return None
    return None


def _instructions_to_steps(instr) -> list[str]:
    if instr is None:
        return []
    if isinstance(instr, str):
        return clean_list([instr])
    if isinstance(instr, dict):
        instr = [instr]
    out = []
    for item in instr:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict):
            if item.get("@type") == "HowToSection" and "itemListElement" in item:
                for sub in item["itemListElement"]:
                    if isinstance(sub, dict):
                        out.append(sub.get("text") or sub.get("name") or "")
                    elif isinstance(sub, str):
                        out.append(sub)
            else:
                out.append(item.get("text") or item.get("name") or "")
    return clean_list(out)


def parse_recipe_page(html_text: str, url: str) -> dict | None:
    ld = _find_recipe_ld(html_text)
    if ld is None:
        return None
    title = clean_text(ld.get("name"))
    ingredients = clean_list(ld.get("recipeIngredient") or [])
    steps = _instructions_to_steps(ld.get("recipeInstructions"))
    if not title or (not ingredients and not steps):
        return None

    slug = url.rstrip("/").rsplit("/", 1)[-1]
    rec: dict = {
        "id": f"{SOURCE}:{slug}",
        "source": SOURCE,
        "source_url": url,
        "title": title,
        "ingredients": ingredients,
        "steps": steps,
    }
    category = _first_str(ld.get("recipeCategory"))
    if category:
        rec["category"] = clean_text(category)
    cuisine = _first_str(ld.get("recipeCuisine"))
    if cuisine:
        rec["cuisine_label"] = clean_text(cuisine)
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
    yield_text = _first_str(ld.get("recipeYield"))
    if yield_text:
        rec["yield_text"] = clean_text(yield_text)
    image_url = _first_str(ld.get("image"))
    if image_url:
        rec["image_url"] = image_url
    keywords = ld.get("keywords")
    if keywords:
        tags = keywords.split(",") if isinstance(keywords, str) else keywords
        rec["tags"] = clean_list(tags)
    return rec


def _is_recipe_sitemap(loc: str) -> bool:
    return loc.endswith(".xml") and "-recipe.xml" in loc


def run(cap: int = CAP, retry_failed: bool = False) -> dict:
    # Stage 1: find the recipe-only child sitemaps from the root index. Skipped
    # entirely on a --retry-failed run: it only re-visits URLs already discovered
    # and recorded in progress.json, so it never needs the sitemaps again.
    child_sitemaps: list[str] = []
    if not retry_failed:
        from sitemap_crawler import sitemap_locs

        child_sitemaps = [u for u in sitemap_locs(ROOT_SITEMAP) if _is_recipe_sitemap(u)]
        if not child_sitemaps:
            child_sitemaps = [ROOT_SITEMAP]

    return crawl(
        SOURCE,
        child_sitemaps,
        parse_recipe_page,
        cap,
        url_filter=lambda u: "/recipes/" in u,
        retry_failed=retry_failed,
    )


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=CAP)
    ap.add_argument(
        "--retry-failed",
        action="store_true",
        help="Only re-visit URLs previously dropped for a parse-related reason "
        "(parse error / no recipe data), capped at --cap attempts this run.",
    )
    args = ap.parse_args()
    print(json.dumps(run(cap=args.cap, retry_failed=args.retry_failed), indent=2))
