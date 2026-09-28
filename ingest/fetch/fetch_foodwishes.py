"""Full-crawl fetcher for foodwishes.blogspot.com (Chef John / Food Wishes), via Blogger's
JSON feed instead of a page-by-page HTML crawl.

Owner ask (D18): "cant you get more from Food Wishes?" — the prior slice (S1) only reached
300/3,020 posts via a sitemap crawl, and its parser only handled the ~2010-2019 inline-text
era. This fetcher covers the whole blog (3,020 posts as of writing) with ~21 requests, using:

    https://foodwishes.blogspot.com/feeds/posts/default?alt=json&max-results=150&start-index=N

which returns each post's full body HTML in `entry.content.$t` — no per-post page fetch
needed. Every fetched entry is cached to disk (one JSON file per post, keyed by its slug)
under `<raw-data>/foodwishes/posts/`, so a later run resumes instead of re-fetching, and the
parse step can be re-run against the cache without hitting the network again.

Confirmed (S1): the blog is **not** a schema.org/JSON-LD site anywhere. Three eras, by
on-page recipe text:
  - ~2007-2009: an inline "Ingredients:" list (no yield), video-only for the method.
  - ~2010-2019: an inline "Ingredients for N servings:" block (yield captured), sometimes
    followed by a short dash-prefixed step or two.
  - Nov 2019 onward: the post itself says so ("why we're now offering complete written
    recipes [on Allrecipes]") and links out to allrecipes.com instead of including the text.
    Per the brief, Allrecipes is not fetched; these are counted separately with reason
    "recipe text only on allrecipes".
Posts with neither an ingredients marker nor an Allrecipes link (announcements, guest posts,
video-only posts with no recipe at all) are counted as "no recipe content (announcement/video
only)".
"""
from __future__ import annotations

import html as htmlmod
import json
import re
from pathlib import Path
from typing import Any

import requests

from common import RAW_DATA_ROOT, RateLimiter, SourceWriter
from foodwishes_video import video_url

SOURCE = "foodwishes"
FEED_BASE = "https://foodwishes.blogspot.com/feeds/posts/default"
PAGE_SIZE = 150
TIMEOUT = 30
PER_SECOND = 1.0
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

FOOTER_MARK = "blogger-post-footer"
ALLRECIPES_RE = re.compile(r"allrecipes\.com", re.I)
_ING_YIELD_RE = re.compile(r"Ingredients\s+for\s+(.+?):", re.I)
_ING_BARE_RE = re.compile(r"Ingredients\s*:", re.I)
_MAX_LINES = 60


def _slug(url: str) -> str:
    """`<year>/<month>/<filename>`, not just the filename: the blog reuses the same filename
    for recurring posts across years (e.g. "happy-holidays.html", "chef-john-is-on-vacation.html"
    each appear 2-7 times), so the filename alone collides and silently drops posts.
    """
    path = url.split("://", 1)[-1].split("/", 1)[-1]
    return path.rsplit(".", 1)[0] if path.endswith(".html") else path.rstrip("/")


def _entry_link(entry: dict) -> str | None:
    for link in entry.get("link", []) or []:
        if link.get("rel") == "alternate":
            return link.get("href")
    return None


def _posts_cache_dir(out_root: Path = RAW_DATA_ROOT) -> Path:
    d = out_root / SOURCE / "posts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _content_text(content_html: str) -> str:
    """Turn a feed entry's raw post-body HTML into newline-per-line plain text.

    Every post carries a trailing `blogger-post-footer` div (the reddit-share widget); this
    truncates there first so nothing past the recipe body (share buttons, tracking pixels)
    leaks into the parsed lines.
    """
    idx = content_html.find(FOOTER_MARK)
    if idx != -1:
        div_start = content_html.rfind("<div", 0, idx)
        content_html = content_html[: div_start if div_start != -1 else idx]
    # ~127 posts (Word-pasted, mostly 2012-2018) carry a leftover Word/Office <style> block
    # (font-face declarations etc., sometimes wrapped in an HTML comment) ahead of or amid
    # the post body. Its content is not renderable text and must be dropped as a unit, not
    # just tag-stripped, or CSS/comment lines leak into the parsed ingredients/steps.
    content_html = re.sub(r"<style[^>]*>.*?</style>", " ", content_html, flags=re.I | re.S)
    content_html = re.sub(r"<!--.*?-->", " ", content_html, flags=re.S)
    # Some eras (2012-2013 Word-pasted posts especially) carry literal newlines inside a
    # single paragraph's text node, mid-ingredient, from the original word-wrap width. A
    # browser collapses those to a space when rendering; treating them as line breaks here
    # would wrongly split one ingredient/step into two. Collapse raw whitespace first, then
    # reintroduce line breaks only at real block boundaries (<br>, </div>, </p>).
    content_html = re.sub(r"[\r\n\t]+", " ", content_html)
    body = re.sub(r"<br\s*/?>", "\n", content_html, flags=re.I)
    body = re.sub(r"</div>|</p>", "\n", body, flags=re.I)
    body = re.sub(r"<[^>]+>", "", body)
    body = htmlmod.unescape(body)
    body = re.sub(r"[ \t]+", " ", body)
    return body


def parse_post(
    content_html: str, url: str, title: str
) -> tuple[dict | None, str | None]:
    """Classify and parse one post's feed entry. Returns (record, None) on success, or
    (None, drop_reason) for a post correctly recognized as not having usable inline recipe
    text (announcement/video-only, or Allrecipes-only), or a parse failure.
    """
    body = _content_text(content_html)
    has_allrecipes_link = bool(ALLRECIPES_RE.search(content_html))

    yield_text = ""
    rest: str | None = None
    m = _ING_YIELD_RE.search(body)
    if m:
        yield_text = m.group(1).strip()
        rest = body[m.end():]
    else:
        m2 = _ING_BARE_RE.search(body)
        if m2:
            rest = body[m2.end():]

    if rest is None:
        if has_allrecipes_link:
            return None, "recipe text only on allrecipes"
        return None, "no recipe content (announcement/video only)"

    lines = [ln.strip() for ln in rest.splitlines()]
    ingredients: list[str] = []
    steps: list[str] = []
    for ln in lines:
        if not ln:
            continue
        low = ln.lower()
        if low.startswith("posted by") or low.startswith("labels:"):
            break
        # Older posts (2010-2013) sometimes link out to a copy of the same recipe on the
        # blog's own site after the ingredient list; that anchor text is not an ingredient.
        if low.rstrip(".") == "view the complete recipe":
            break
        if ln.startswith("-") or ln.startswith("*"):
            step = ln.lstrip("-* ").strip()
            # A handful of posts carry a dangling, HTML-entity-escaped comment closer
            # ("--&gt;") as literal on-page text, left over from a malformed Word/Office
            # paste; after the leading dashes are stripped this has no real content left.
            if not any(c.isalnum() for c in step):
                continue
            steps.append(step)
        elif any(c.isalnum() for c in ln):
            ingredients.append(ln)
        if len(ingredients) + len(steps) > _MAX_LINES:
            break

    if not ingredients:
        return None, "ingredients marker found but no ingredient lines parsed"

    slug = _slug(url)
    rec: dict = {
        "id": f"{SOURCE}:{slug}",
        "source": SOURCE,
        "source_url": url,
        "title": htmlmod.unescape(title).strip() or yield_text,
        "ingredients": ingredients,
        "steps": steps,
        "yield_text": yield_text,
    }
    # R17 (brief S10): the embedded video, the method for the posts with no written steps.
    video = video_url(content_html)
    if video:
        rec["video_url"] = video
    return rec, None


def _fetch_feed_page(start_index: int, limiter: RateLimiter) -> dict | None:
    limiter.wait()
    url = f"{FEED_BASE}?alt=json&max-results={PAGE_SIZE}&start-index={start_index}"
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if r.status_code != 200:
            return None
        return r.json()
    except (requests.RequestException, ValueError):
        return None


def fetch_all(writer: SourceWriter, limiter: RateLimiter) -> dict:
    """Page through the Blogger JSON feed, caching every post's raw entry to
    `<raw-data>/foodwishes/posts/<slug>.json`. Resumable via progress.json's
    `next_start_index` + `total_results`; a page that fails to fetch stops this run (the next
    run retries the same start-index) rather than silently skipping ahead.
    """
    progress = writer.load_progress()
    start_index = progress.get("next_start_index", 1)
    total_results = progress.get("total_results")
    pages_fetched = progress.get("pages_fetched", 0)
    cache_dir = _posts_cache_dir()
    fetch_failed = False

    while total_results is None or start_index <= total_results:
        data = _fetch_feed_page(start_index, limiter)
        if data is None:
            writer.drops.drop("feed page fetch failed (non-200 or timeout)")
            fetch_failed = True
            break
        feed = data.get("feed", {})
        if total_results is None:
            try:
                total_results = int(feed["openSearch$totalResults"]["$t"])
            except (KeyError, ValueError, TypeError):
                total_results = 0
        entries = feed.get("entry", [])
        if not entries:
            break
        for entry in entries:
            link = _entry_link(entry)
            if not link:
                writer.drops.drop("feed entry missing alternate link")
                continue
            path = cache_dir / f"{_slug(link).replace('/', '_')}.json"
            if not path.exists():
                path.write_text(json.dumps(entry, ensure_ascii=False), encoding="utf-8")
        pages_fetched += 1
        start_index += PAGE_SIZE
        print(f"[{SOURCE}] fetched page at start-index={start_index - PAGE_SIZE} "
              f"({pages_fetched} pages, {total_results} posts total)")
        writer.save_progress(
            {
                "next_start_index": start_index,
                "total_results": total_results,
                "pages_fetched": pages_fetched,
            }
        )

    return {
        "total_results": total_results or 0,
        "pages_fetched": pages_fetched,
        "next_start_index": start_index,
        "fetch_failed": fetch_failed,
    }


def parse_all(writer: SourceWriter) -> dict:
    """Classify+parse every cached post. Returns per-year written/drop counts and up to 5
    sample recipes spread across the run (used for the report, not for correctness).
    """
    per_year: dict[str, dict[str, Any]] = {}
    samples: list[dict] = []

    for path in sorted(_posts_cache_dir().glob("*.json")):
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            writer.drops.drop("post cache file unreadable")
            continue
        link = _entry_link(entry)
        if not link:
            writer.drops.drop("cached post missing alternate link")
            continue
        published = (entry.get("published") or {}).get("$t", "")
        year = published[:4] if published[:4].isdigit() else "unknown"
        title = (entry.get("title") or {}).get("$t", "")
        content_html = (entry.get("content") or {}).get("$t", "")

        yb = per_year.setdefault(year, {"written": 0, "drops": {}})
        rec, reason = parse_post(content_html, link, title)
        if rec is None:
            writer.drops.drop(reason)
            yb["drops"][reason] = yb["drops"].get(reason, 0) + 1
            continue
        if writer.write(rec):
            yb["written"] += 1
            if len(samples) < 5:
                samples.append(rec)
        else:
            yb["drops"]["dropped by writer (duplicate/invalid)"] = (
                yb["drops"].get("dropped by writer (duplicate/invalid)", 0) + 1
            )

    return {"per_year": per_year, "samples": samples}


def run() -> dict:
    limiter = RateLimiter(PER_SECOND)
    with SourceWriter(SOURCE) as writer:
        fetch_summary = fetch_all(writer, limiter)
        parse_summary = parse_all(writer)
        summary = writer.summary()
        summary["fetch"] = fetch_summary
        summary["per_year"] = parse_summary["per_year"]
        summary["samples"] = parse_summary["samples"]
        return summary


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
