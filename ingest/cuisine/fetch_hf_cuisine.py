"""One-time ingest: fetch the public Hugging Face dataset `Eitanli/cuisine_type` (74,465
recipes, each a single free-text blob of title + ingredient lines + "Instructions:" + steps,
labelled with a `cuisine_type` string) and write it into this project's raw-data layout as a
new source, `hf_cuisine_type`, in the same {id, source, title, ingredients, cuisine_label}
shape as themealdb/bbcgoodfood (schema/raw_recipe.md), so build_dataset.py can read it exactly
like any other labelled source.

This is the only script in `ingest/cuisine/` that touches the network; everything else
(build_dataset.py, train.py, run_corpus.py, the tests) reads only local files, so a normal
test run never needs a network connection. Re-running this script is idempotent -- it
overwrites the same output file from a fresh download.

Why this dataset (brief S5b-2 #1a): searched https://huggingface.co/api/datasets?search=...
for cuisine-labelled recipe sets; the classic Kaggle "What's Cooking" (Yummly) ingredients set
has no public HF mirror found by that search (checked "whats-cooking", "yummly", "20
cuisines", "recipe-ingredients-dataset" -- no hits). `Eitanli/cuisine_type` (and its exact
duplicate `Thefoodprocessor/cuisine_type`, same 74,465 rows/schema) is the largest labelled
recipe-with-cuisine set that search turned up: single-label rows only (comma-joined
multi-cuisine rows like "American, Italian" are dropped here, counted, since they're not a
single ground truth), and rows whose `cuisine_type` value contains ":" or a digit are a known
data-pipeline defect in the source dataset (the recipe text leaked into the label column, e.g.
"FrenchText: Chicken T") and are dropped too, counted -- never guessed.

Usage:
  python3 -m ingest.cuisine.fetch_hf_cuisine
"""
import io
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

RAW_ROOT = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
OUT_DIR = os.path.join(RAW_ROOT, 'hf_cuisine_type')
OUT_PATH = os.path.join(OUT_DIR, 'recipes.jsonl')
PARQUET_URL = ('https://huggingface.co/datasets/Eitanli/cuisine_type/resolve/main/'
               'data/train-00000-of-00001-7af569c5aaab294c.parquet')
SOURCE = 'hf_cuisine_type'
# A raw cuisine_type value is only kept if it looks like a real label (letters, spaces,
# slashes, hyphens only); "FrenchText: Chicken T", "44646", etc. are the source's own data
# defect (recipe text leaked into the label column), not a cuisine name.
_CLEAN_LABEL_RE = re.compile(r"^[A-Za-z][A-Za-z /'-]*$")


def _download(url=PARQUET_URL, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': 'recipe-app-ingest/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _rows_from_parquet(data):
    """Parse the parquet bytes without requiring pandas/pyarrow at call time in prod; falls
    back to pyarrow if present (used here at ingest time only, same offline-training rule as
    train.py's sklearn use)."""
    import pyarrow.parquet as pq
    table = pq.read_table(io.BytesIO(data))
    return table.to_pylist()


def _split_recipe_blob(blob):
    """title (first line) + ingredient lines (lines up to "Instructions:"), or (None, [])
    if the blob doesn't have the expected shape."""
    if not blob or '\n' not in blob:
        return None, []
    lines = blob.split('\n')
    title = lines[0].strip()
    if not title:
        return None, []
    ingredients = []
    for line in lines[1:]:
        if line.strip() == 'Instructions:':
            break
        line = line.strip()
        if line:
            ingredients.append(line)
    else:
        # no "Instructions:" marker found -- keep whatever ingredient-looking lines we saw
        pass
    return title, ingredients


def convert(rows):
    """rows: HF parquet records ({id, recipe, cuisine_type}). Returns (out_rows, drops)."""
    out = []
    drops = {}

    def drop(reason):
        drops[reason] = drops.get(reason, 0) + 1

    for rec in rows:
        raw_label = (rec.get('cuisine_type') or '').strip()
        if ',' in raw_label:
            drop('multi-label (comma-joined), not a single ground truth')
            continue
        if not raw_label or not _CLEAN_LABEL_RE.match(raw_label):
            drop(f'garbled or empty cuisine_type {raw_label!r}')
            continue
        title, ingredients = _split_recipe_blob(rec.get('recipe'))
        if not title:
            drop('no parseable title')
            continue
        if not ingredients:
            drop('no parseable ingredient lines')
            continue
        out.append({
            'id': f'{SOURCE}:{rec["id"]}', 'source': SOURCE, 'title': title,
            'ingredients': ingredients, 'cuisine_label': raw_label,
        })
    return out, drops


def main(argv):
    print(f'downloading {PARQUET_URL} ...')
    data = _download()
    print(f'downloaded {len(data)} bytes, parsing parquet ...')
    rows = _rows_from_parquet(data)
    out_rows, drops = convert(rows)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        for row in out_rows:
            fh.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(f'{len(rows)} source rows -> {len(out_rows)} kept -> {OUT_PATH}')
    print('drops:')
    for reason, n in sorted(drops.items(), key=lambda kv: -kv[1]):
        print(f'  {reason}: {n}')
    from collections import Counter
    by_label = Counter(r['cuisine_label'] for r in out_rows)
    print(f'{len(by_label)} distinct raw cuisine_type values, top 15:')
    for label, n in by_label.most_common(15):
        print(f'  {label:20s} {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
