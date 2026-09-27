"""Fetch the (defunct-project) openrecipes.org dump, mirrored on S3, still reachable with a
plain GET, no auth: https://s3.amazonaws.com/openrecipes/20170107-061401-recipeitems.json.gz

~173k recipes scraped from many recipe sites' schema.org markup circa 2013-2017, one JSON
object per line (mongoexport style). Caveat, confirmed by inspection: this dump has no
instructions/steps field at all, only name/ingredients/url/source/times/yield/image. Records
are written with `steps: []`; still useful for ingredient-line variety and as a multi-site
cross-check, but flagged as ingredients-only in sources.md.

Resumable: the .json.gz is downloaded to a local cache with HTTP Range first; parsing then
tracks a row-count cursor in progress.json.
"""
from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

import requests

from common import RAW_DATA_ROOT, SourceWriter, clean_list, clean_text

SOURCE = "openrecipes"
DUMP_URL = "https://s3.amazonaws.com/openrecipes/20170107-061401-recipeitems.json.gz"
TIMEOUT = 60

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


def download(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    have = dest.stat().st_size if dest.exists() else 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with requests.get(DUMP_URL, headers=headers, stream=True, timeout=TIMEOUT) as r:
        if r.status_code == 416:
            return
        r.raise_for_status()
        mode = "ab" if have and r.status_code == 206 else "wb"
        with dest.open(mode) as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)


def parse_line(raw: dict, idx: int) -> dict | None:
    title = clean_text(raw.get("name"))
    if not title:
        return None
    ingredients_raw = raw.get("ingredients") or ""
    ingredients = clean_list(
        [ln for ln in str(ingredients_raw).replace("\r\n", "\n").split("\n") if ln.strip()]
    )
    oid = None
    if isinstance(raw.get("_id"), dict):
        oid = raw["_id"].get("$oid")
    rec: dict = {
        "id": f"{SOURCE}:{oid or idx}",
        "source": SOURCE,
        "title": title,
        "ingredients": ingredients,
        "steps": [],  # confirmed: this dump has no instructions field
    }
    if raw.get("url"):
        rec["source_url"] = raw["url"]
    if raw.get("recipeYield"):
        rec["yield_text"] = clean_text(str(raw["recipeYield"]))
    if raw.get("image"):
        rec["image_url"] = raw["image"]
    total = _iso_duration_to_min(raw.get("totalTime"))
    if total is not None:
        rec["total_time_min"] = total
    prep = _iso_duration_to_min(raw.get("prepTime"))
    if prep is not None:
        rec["prep_time_min"] = prep
    cook = _iso_duration_to_min(raw.get("cookTime"))
    if cook is not None:
        rec["cook_time_min"] = cook
    if raw.get("source"):
        rec["tags"] = [clean_text(str(raw["source"]))]
    return rec


def run(limit: int | None = None) -> dict:
    cache = RAW_DATA_ROOT / SOURCE / "openrecipes.json.gz"
    download(cache)

    with SourceWriter(SOURCE) as writer:
        progress = writer.load_progress()
        start_row = progress.get("rows_parsed", 0)
        rows_parsed = start_row
        with gzip.open(cache, "rt", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i < start_row:
                    continue
                line = line.strip()
                rows_parsed = i + 1
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError:
                    writer.drops.drop("json decode error")
                    continue
                rec = parse_line(raw, i)
                if rec is None:
                    writer.drops.drop("no title")
                else:
                    writer.write(rec)
                if rows_parsed % 25000 == 0:
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
