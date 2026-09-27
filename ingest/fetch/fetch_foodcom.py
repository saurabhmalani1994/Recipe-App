"""Fetch the Food.com recipes dataset via the AkashPS11/recipes_data_food.com mirror on
Hugging Face (MIT-licensed csv, ~34 MB, ~500k+ recipes). This is the Food.com dump with
ratings (AggregatedRating/ReviewCount), category, nutrition, times and yield -- the source
the brief specifically wants for its rating data.

Columns are R-vector-literal strings, e.g. Images: c("url1", "url2"), RecipeIngredientParts:
c("flour", "sugar"). Parsed with a small R-vector-literal reader rather than a general R
parser, since the only shapes present are NA, c("...","...") and c(1, 2).

Resumable the same way as fetch_recipenlg.py: download to a local cache with HTTP Range,
then parse with a row-count cursor in progress.json.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

import requests

from common import RAW_DATA_ROOT, SourceWriter, clean_list, clean_text

SOURCE = "foodcom"
CSV_URL = "https://huggingface.co/datasets/AkashPS11/recipes_data_food.com/resolve/main/recipes.csv"
TIMEOUT = 60

_STR_ITEM_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')
_ISO_DUR_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?")


def _iso_duration_to_min(s) -> int | None:
    if not s or not isinstance(s, str):
        return None
    m = _ISO_DUR_RE.match(s.strip())
    if not m:
        return None
    h, mi = m.groups()
    if h is None and mi is None:
        return None
    return int(h or 0) * 60 + int(mi or 0)


def parse_r_vector(s: str) -> list[str]:
    """Parse an R vector literal like c("a", "b") or c(1, 2) or NA into a list of strings."""
    if not s or s.strip() == "NA":
        return []
    items = _STR_ITEM_RE.findall(s)
    if items:
        return [it.replace('\\"', '"') for it in items]
    inner = s.strip()
    if inner.startswith("c(") and inner.endswith(")"):
        inner = inner[2:-1]
        return [p.strip() for p in inner.split(",") if p.strip() and p.strip() != "NA"]
    return []


def download(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    have = dest.stat().st_size if dest.exists() else 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with requests.get(CSV_URL, headers=headers, stream=True, timeout=TIMEOUT) as r:
        if r.status_code == 416:
            return
        r.raise_for_status()
        mode = "ab" if have and r.status_code == 206 else "wb"
        with dest.open(mode) as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)


def parse_row(row: dict) -> dict | None:
    title = clean_text(row.get("Name"))
    if not title:
        return None
    ingredients = clean_list(parse_r_vector(row.get("RecipeIngredientParts") or ""))
    quantities = parse_r_vector(row.get("RecipeIngredientQuantities") or "")
    if quantities and len(quantities) == len(ingredients):
        ingredients = clean_list(
            f"{q} {ing}".strip() for q, ing in zip(quantities, ingredients)
        )
    steps = clean_list(parse_r_vector(row.get("RecipeInstructions") or ""))

    rec: dict = {
        "id": f"{SOURCE}:{row.get('RecipeId')}",
        "source": SOURCE,
        "title": title,
        "ingredients": ingredients,
        "steps": steps,
    }
    if row.get("RecipeCategory"):
        rec["category"] = clean_text(row["RecipeCategory"])
    try:
        if row.get("AggregatedRating") and row["AggregatedRating"] not in ("NA", ""):
            rec["rating"] = float(row["AggregatedRating"])
    except ValueError:
        pass
    try:
        if row.get("ReviewCount") and row["ReviewCount"] not in ("NA", ""):
            rec["rating_count"] = int(float(row["ReviewCount"]))
    except ValueError:
        pass
    total = _iso_duration_to_min(row.get("TotalTime"))
    if total is not None:
        rec["total_time_min"] = total
    prep = _iso_duration_to_min(row.get("PrepTime"))
    if prep is not None:
        rec["prep_time_min"] = prep
    cook = _iso_duration_to_min(row.get("CookTime"))
    if cook is not None:
        rec["cook_time_min"] = cook
    servings = row.get("RecipeServings")
    yield_text = row.get("RecipeYield")
    if yield_text and yield_text != "NA":
        rec["yield_text"] = clean_text(yield_text)
    elif servings and servings != "NA":
        rec["yield_text"] = f"{clean_text(servings)} servings"
    images = parse_r_vector(row.get("Images") or "")
    if images:
        rec["image_url"] = images[0]
    keywords = parse_r_vector(row.get("Keywords") or "")
    if keywords:
        rec["tags"] = clean_list(keywords)
    return rec


def run(limit: int | None = None) -> dict:
    cache = RAW_DATA_ROOT / SOURCE / "foodcom_recipes.csv"
    download(cache)

    csv.field_size_limit(sys.maxsize)
    with SourceWriter(SOURCE) as writer:
        progress = writer.load_progress()
        start_row = progress.get("rows_parsed", 0)
        rows_parsed = start_row
        with cache.open("r", encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                if i < start_row:
                    continue
                rec = parse_row(row)
                if rec is None:
                    writer.drops.drop("no title")
                else:
                    writer.write(rec)
                rows_parsed = i + 1
                if rows_parsed % 50000 == 0:
                    writer.save_progress({"rows_parsed": rows_parsed})
                    print(f"[{SOURCE}] parsed {rows_parsed} rows, written {writer.written}")
                if limit and writer.written >= limit:
                    break
        writer.save_progress({"rows_parsed": rows_parsed})
        return writer.summary()


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    print(json.dumps(run(limit=args.limit), indent=2))
