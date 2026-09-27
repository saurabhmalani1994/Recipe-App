"""Build the labelled training set from raw recipes whose source cuisine label maps to the
canonical list (cuisines.yaml). Writes ingest/cuisine/dataset.jsonl: one row per labelled
recipe, {id, source, label, title, tokens}.

Only themealdb (area) and bbcgoodfood (cuisine_label) carry a real cuisine field in this
corpus (checked against openrecipes and recipenlg: openrecipes has none, recipenlg's `tags`
are ingredient words, not cuisine tags -- see the report). Every recipe read is counted: kept,
label unmapped, or no ingredients/title to build features from (rule 11).

Usage:
  python3 -m ingest.cuisine.build_dataset
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine import cuisines as C  # noqa: E402
from ingest.cuisine.features import tokens  # noqa: E402

RAW_ROOT = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
OUT_PATH = os.path.join(HERE, 'dataset.jsonl')
# Sources whose raw jsonl carries a real, source-native cuisine field, per schema/raw_recipe.md.
LABELLED_SOURCES = ('themealdb', 'bbcgoodfood')


def build(out_path=OUT_PATH, raw_root=RAW_ROOT, sources=LABELLED_SOURCES):
    rows = []
    drops = {}

    def drop(reason):
        drops[reason] = drops.get(reason, 0) + 1

    for source in sources:
        path = os.path.join(raw_root, source, 'recipes.jsonl')
        if not os.path.exists(path):
            drop(f'{source}: file missing')
            continue
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    drop(f'{source}: bad json')
                    continue
                raw_label = rec.get('cuisine_label')
                canon = C.to_canonical(source, raw_label)
                if canon is None:
                    drop(f'{source}: unmapped label {raw_label!r}' if raw_label
                         else f'{source}: no cuisine_label')
                    continue
                toks = tokens(rec.get('ingredients'), rec.get('title'))
                if not toks:
                    drop(f'{source}: no usable tokens')
                    continue
                rows.append({
                    'id': rec['id'], 'source': source, 'label': canon,
                    'title': rec.get('title', ''), 'tokens': toks,
                })
    with open(out_path, 'w', encoding='utf-8') as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + '\n')
    return rows, drops


def main(argv):
    rows, drops = build()
    from collections import Counter
    by_label = Counter(r['label'] for r in rows)
    print(f'kept {len(rows)} labelled recipes -> {OUT_PATH}')
    for label, n in by_label.most_common():
        print(f'  {label:22s} {n}')
    print('drops:')
    for reason, n in sorted(drops.items(), key=lambda kv: -kv[1]):
        print(f'  {reason}: {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
