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


def _find_recipe_ld(html_text: str) -> dict | None:
    for block in _LD_JSON_RE.findall(html_text):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for d in candidates:
            if isinstance(d, dict) and d.get("@type") in ("Recipe", ["Recipe"]):
                return d
            # @graph style documents
            if isinstance(d, dict) and "@graph" in d:
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
    category = ld.get("recipeCategory")
    if category:
        rec["category"] = clean_text(category if isinstance(category, str) else category[0])
    cuisine = ld.get("recipeCuisine")
    if cuisine:
        rec["cuisine_label"] = clean_text(cuisine if isinstance(cuisine, str) else cuisine[0])
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
        rec["yield_text"] = clean_text(yield_text if isinstance(yield_text, str) else yield_text[0])
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
        rec["tags"] = clean_list(tags)
    return rec


def _is_recipe_sitemap(loc: str) -> bool:
    return loc.endswith(".xml") and "-recipe.xml" in loc


def run(cap: int = CAP) -> dict:
    # Stage 1: find the recipe-only child sitemaps from the root index.
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
    )


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
