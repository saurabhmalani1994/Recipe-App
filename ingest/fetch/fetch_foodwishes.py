"""Text scraper for foodwishes.blogspot.com.

Note this is NOT a schema.org/JSON-LD site (checked: no <script type="application/ld+json">
and no itemprop microdata on any post, old or new). Recipes ~2010-2019 have a plain-text
"Ingredients for N servings:" block inline in the post body; posts from Nov 2019 onward drop
the written recipe entirely and link out to allrecipes.com instead (which the brief already
flags as blocked). This fetcher extracts the inline-text era; posts with no
"Ingredients for" marker are dropped and counted, not guessed at.

Page URLs come from the blog's own paginated sitemap.xml (sitemap.xml?page=1..4), not a
search crawl. Resumable and rate-limited via sitemap_crawler.crawl.
"""
from __future__ import annotations

import html as htmlmod
import json
import re

from sitemap_crawler import crawl

SOURCE = "foodwishes"
SITEMAP_PAGES = [f"https://foodwishes.blogspot.com/sitemap.xml?page={i}" for i in range(1, 5)]
CAP = 300

_INGREDIENTS_HEADER_RE = re.compile(
    r"Ingredients\s+for\s+(.+?):", re.I
)


def _body_text(html_text: str) -> str | None:
    m = re.search(r"post-body entry-content'>(.*?)<div class='post-footer'>", html_text, re.S)
    if not m:
        m = re.search(r'post-body entry-content">(.*?)<div class="post-footer"', html_text, re.S)
    if not m:
        return None
    body = m.group(1)
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    body = re.sub(r"</div>|</p>", "\n", body, flags=re.I)
    body = re.sub(r"<[^>]+>", "", body)
    body = htmlmod.unescape(body)
    body = re.sub(r"[ \t]+", " ", body)
    return body


def _title(html_text: str) -> str:
    m = re.search(r"<title>([^<]*)</title>", html_text)
    if not m:
        return ""
    t = htmlmod.unescape(m.group(1))
    t = t.split(":", 1)[-1].strip()
    t = re.split(r"\s*-\s*", t)[0].strip()
    return t


def parse_recipe_page(html_text: str, url: str) -> dict | None:
    body = _body_text(html_text)
    if not body:
        return None
    m = _INGREDIENTS_HEADER_RE.search(body)
    if not m:
        return None
    yield_text = m.group(1).strip()
    rest = body[m.end():]

    lines = [ln.strip() for ln in rest.splitlines()]
    ingredients: list[str] = []
    steps: list[str] = []
    for ln in lines:
        if not ln:
            continue
        if ln.lower().startswith("posted by") or ln.lower().startswith("labels:"):
            break
        if ln.startswith("-") or ln.startswith("*"):
            steps.append(ln.lstrip("-* ").strip())
        else:
            ingredients.append(ln)
        if len(ingredients) + len(steps) > 60:
            break

    if not ingredients:
        return None

    title = _title(html_text)
    slug = url.rstrip("/").rsplit("/", 1)[-1].replace(".html", "")
    rec: dict = {
        "id": f"{SOURCE}:{slug}",
        "source": SOURCE,
        "source_url": url,
        "title": title or yield_text,
        "ingredients": ingredients,
        "steps": steps,
        "yield_text": yield_text,
    }
    return rec


def run(cap: int = CAP) -> dict:
    return crawl(
        SOURCE,
        SITEMAP_PAGES,
        parse_recipe_page,
        cap,
        url_filter=lambda u: u.endswith(".html") and "/search/" not in u,
    )


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
