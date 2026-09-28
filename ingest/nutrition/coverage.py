"""Report ingest/nutrition/mapping.json's coverage, weighted by how often each slug appears in
corpus recipes (ingredients.recipe_count), so a mapped common ingredient counts far more than an
unmapped rare one.

Run:
  python3 -m ingest.nutrition.coverage /home/user/recipe-data/derived/corpus_sample.db
"""
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAPPING_PATH = os.path.join(HERE, 'mapping.json')


def weighted_coverage(db_path, mapping=None):
    """(covered_occurrences, total_occurrences, [(slug, recipe_count), ...] top unmapped)."""
    if mapping is None:
        with open(MAPPING_PATH, encoding='utf-8') as fh:
            mapping = json.load(fh)
    con = sqlite3.connect(db_path)
    rows = con.execute('SELECT slug, recipe_count FROM ingredients WHERE recipe_count > 0').fetchall()
    con.close()
    total = sum(c for _, c in rows)
    covered = sum(c for s, c in rows if s in mapping)
    top_unmapped = sorted((c, s) for s, c in rows if s not in mapping and c > 0)
    top_unmapped.reverse()
    return covered, total, top_unmapped[:25]


def main(argv=None):
    argv = argv or sys.argv[1:]
    db_path = argv[0] if argv else '/home/user/recipe-data/derived/corpus_sample.db'
    covered, total, top_unmapped = weighted_coverage(db_path)
    pct = covered / total if total else 0.0
    print(f'{covered:,}/{total:,} ingredient occurrences mapped ({pct:.1%}); target >= 90%.')
    print('Top unmapped by occurrence:')
    for c, s in top_unmapped:
        print(f'  {c:>5}  {s}')
    return 0 if pct >= 0.90 else 1


if __name__ == '__main__':
    sys.exit(main())
