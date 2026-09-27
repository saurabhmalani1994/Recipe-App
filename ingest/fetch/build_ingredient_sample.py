"""Build ingest/fixtures/ingredient_lines_sample.txt: 3000 raw ingredient lines sampled
evenly across sources and deduplicated, for the next slice (the parser) to boot from.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

RAW_ROOT = Path("/home/user/recipe-data/raw")
OUT = Path(__file__).resolve().parent.parent / "fixtures" / "ingredient_lines_sample.txt"
TARGET_TOTAL = 3000

SOURCES = [
    "recipenlg",
    "foodcom",
    "bbcgoodfood",
    "foodwishes",
    "themealdb",
    "openrecipes",
    "github_openrecipe",
    "github_recipegen",
]


def sample_lines(source: str, n: int, rng: random.Random) -> list[str]:
    path = RAW_ROOT / source / "recipes.jsonl"
    if not path.exists():
        return []
    # reservoir sample n ingredient lines from this source's file
    reservoir: list[str] = []
    seen = 0
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            for ing in rec.get("ingredients") or []:
                ing = ing.strip()
                if not ing:
                    continue
                seen += 1
                if len(reservoir) < n:
                    reservoir.append(ing)
                else:
                    j = rng.randint(0, seen - 1)
                    if j < n:
                        reservoir[j] = ing
    return reservoir


def main() -> None:
    rng = random.Random(20260927)
    per_source = TARGET_TOTAL // len(SOURCES)
    all_lines: list[str] = []
    counts = {}
    for source in SOURCES:
        lines = sample_lines(source, per_source * 4, rng)  # oversample before dedup
        counts[source] = len(lines)
        all_lines.extend(lines)

    # dedupe, preserving first occurrence order, then shuffle and trim/pad to target
    seen_set = set()
    deduped = []
    for ln in all_lines:
        key = ln.strip().lower()
        if key and key not in seen_set:
            seen_set.add(key)
            deduped.append(ln)
    rng.shuffle(deduped)
    final = deduped[:TARGET_TOTAL]

    OUT.write_text("\n".join(final) + "\n", encoding="utf-8")
    print(f"wrote {len(final)} lines to {OUT}")
    print("per-source raw sample sizes (pre-dedup):", counts)


if __name__ == "__main__":
    main()
