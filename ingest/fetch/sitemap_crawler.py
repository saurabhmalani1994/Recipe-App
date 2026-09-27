"""Shared resumable sitemap-driven crawler for the schema.org / text scrapers.

Progress (the list of URLs already attempted, and the cursor into the sitemap URL list) is
kept in the source's progress.json sidecar, so a later run picks up where this one stopped
instead of re-crawling from the start. Rate limit: at most 1 request/second, 20 s timeout per
page, per the brief.
"""
from __future__ import annotations

import re
import time
from typing import Callable

import requests

from common import RateLimiter, SourceWriter

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
TIMEOUT = 20
PER_SECOND = 1.0

_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")


def fetch_url(url: str) -> str | None:
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        if r.status_code != 200:
            return None
        return r.text
    except requests.RequestException:
        return None


def sitemap_locs(sitemap_url: str) -> list[str]:
    """Fetch one sitemap (index or urlset) and return every <loc>. Not recursive."""
    text = fetch_url(sitemap_url)
    if not text:
        return []
    return _LOC_RE.findall(text)


def crawl(
    source: str,
    sitemap_urls: list[str],
    parse_page: Callable[[str, str], dict | None],
    cap: int,
    url_filter: Callable[[str], bool] | None = None,
) -> dict:
    """Crawl page URLs discovered from `sitemap_urls`, up to `cap` written records.

    parse_page(html, url) -> raw_recipe dict, or None if the page has no usable recipe.
    """
    limiter = RateLimiter(PER_SECOND)
    with SourceWriter(source) as writer:
        progress = writer.load_progress()
        page_urls: list[str] = progress.get("page_urls") or []
        tried: set[str] = set(progress.get("tried_urls") or [])

        if not page_urls:
            for sm in sitemap_urls:
                limiter.wait()
                locs = sitemap_locs(sm)
                page_urls.extend(locs)
            if url_filter:
                page_urls = [u for u in page_urls if url_filter(u)]
            writer.save_progress({"page_urls": page_urls, "tried_urls": list(tried)})
            print(f"[{source}] discovered {len(page_urls)} candidate page URLs")

        for url in page_urls:
            if writer.written >= cap:
                break
            if url in tried:
                continue
            limiter.wait()
            html_text = fetch_url(url)
            tried.add(url)
            if not html_text:
                writer.drops.drop("page fetch failed (non-200 or timeout)")
                writer.save_progress({"page_urls": page_urls, "tried_urls": list(tried)})
                continue
            try:
                rec = parse_page(html_text, url)
            except Exception as e:
                writer.drops.drop(f"parse error: {type(e).__name__}")
                rec = None
            if rec is None:
                writer.drops.drop("no recipe data parsed from page")
            else:
                writer.write(rec)
            writer.save_progress({"page_urls": page_urls, "tried_urls": list(tried)})

        return writer.summary()
