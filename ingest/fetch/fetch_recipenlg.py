"""Fetch RecipeNLG (Bien et al. 2020) via the innovate-data/RecipeNLG mirror on Hugging Face.

The original RecipeNLG site gates the download behind a manual registration form, so we use
a full CSV mirror published on the Hugging Face Hub instead: reachable with a plain GET,
no auth. ~2.2 GB, ~2.23M recipes.

Resumable: the CSV is downloaded to a local cache file first, with HTTP Range so a rerun
continues an interrupted download instead of restarting it. Parsing then streams the CSV and
SourceWriter skips ids already written to recipes.jsonl.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import requests

from common import RAW_DATA_ROOT, SourceWriter, clean_list, clean_text

SOURCE = "recipenlg"
CSV_URL = "https://huggingface.co/datasets/innovate-data/RecipeNLG/resolve/main/RecipeNLG_dataset.csv"
TIMEOUT = 60


def download(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    have = dest.stat().st_size if dest.exists() else 0
    headers = {"Range": f"bytes={have}-"} if have else {}
    with requests.get(CSV_URL, headers=headers, stream=True, timeout=TIMEOUT) as r:
        if r.status_code == 416:
            print(f"[{SOURCE}] download already complete at {have} bytes")
            return
        r.raise_for_status()
        mode = "ab" if have and r.status_code == 206 else "wb"
        if mode == "wb":
            have = 0
        total_hint = r.headers.get("Content-Range", "").split("/")[-1]
        with dest.open(mode) as f:
            downloaded = have
            for chunk in r.iter_content(chunk_size=1 << 20):
                if not chunk:
                    continue
                f.write(chunk)
                downloaded += len(chunk)
                if downloaded % (50 << 20) < (1 << 20):
                    print(f"[{SOURCE}] downloaded {downloaded/1e6:.0f} MB (of {total_hint or '?'})")
    print(f"[{SOURCE}] download complete: {dest} ({dest.stat().st_size/1e6:.0f} MB)")


def parse_row(row: dict) -> dict | None:
    """Turn one CSV row (dict form) into a raw_recipe record, or None to drop it."""
    idx = row.get("") or row.get("Unnamed: 0")
    title = clean_text(row.get("title"))
    if not title:
        return None
    try:
        ingredients = json.loads(row["ingredients"]) if row.get("ingredients") else []
    except (json.JSONDecodeError, KeyError, TypeError):
        ingredients = []
    try:
        directions = json.loads(row["directions"]) if row.get("directions") else []
    except (json.JSONDecodeError, KeyError, TypeError):
        directions = []
    try:
        ner = json.loads(row["NER"]) if row.get("NER") else []
    except (json.JSONDecodeError, KeyError, TypeError):
        ner = []
    link = (row.get("link") or "").strip()
    rec = {
        "id": f"{SOURCE}:{idx}",
        "source": SOURCE,
        "title": title,
        "ingredients": clean_list(ingredients),
        "steps": clean_list(directions),
    }
    if link:
        rec["source_url"] = link if link.startswith("http") else f"http://{link}"
    if ner:
        rec["tags"] = clean_list(ner)
    return rec


def run(limit: int | None = None) -> dict:
    cache = RAW_DATA_ROOT / SOURCE / "RecipeNLG_dataset.csv"
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
                if rows_parsed % 100000 == 0:
                    writer.save_progress({"rows_parsed": rows_parsed})
                    print(f"[{SOURCE}] parsed {rows_parsed} rows, written {writer.written}")
                if limit and writer.written >= limit:
                    break
        writer.save_progress({"rows_parsed": rows_parsed})
        return writer.summary()


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="stop after writing this many records")
    args = ap.parse_args()
    print(json.dumps(run(limit=args.limit), indent=2))
