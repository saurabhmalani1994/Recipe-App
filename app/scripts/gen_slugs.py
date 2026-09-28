#!/usr/bin/env python3
"""Generates `app/src/corpus/slugs.json` from `ingest/taxonomy/ingredients.yaml`.

`app` does not depend on `ingest`'s corpus.db (out of scope for this slice, per
docs/DECISIONS.md D4), but the kitchen-list typeahead needs a slug + name + synonyms + aisle
list to search against. This script reads the taxonomy YAML (read-only; `ingest` still owns
the file) and writes a small JSON export the app bundles.

Usage: python3 scripts/gen_slugs.py   (run from app/, or anywhere — paths are relative to
this file)
"""
import json
import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
TAXONOMY_PATH = os.path.join(HERE, '..', '..', 'ingest', 'taxonomy', 'ingredients.yaml')
OUT_PATH = os.path.join(HERE, '..', 'src', 'corpus', 'slugs.json')


def main() -> int:
    with open(TAXONOMY_PATH, encoding='utf-8') as fh:
        data = yaml.safe_load(fh)
    ingredients = (data or {}).get('ingredients') or {}

    out = []
    for slug, rec in sorted(ingredients.items()):
        item = {
            'slug': slug,
            'name': rec.get('name', slug.replace('_', ' ')),
            'synonyms': list(rec.get('synonyms') or []),
            'aisle': rec.get('aisle', 'other'),
        }
        # Purchase fields (S7c), only when the taxonomy has them: what the grocery list rounds
        # up to ("1 head", "1 bunch", "2 lemons").
        if rec.get('shop_unit'):
            item['shopUnit'] = rec['shop_unit']
        if rec.get('yield'):
            item['yield'] = {'qty': rec['yield']['qty'], 'unit': rec['yield']['unit']}
        if rec.get('buy_as'):
            item['buyAs'] = rec['buy_as']
        # The parser's meatless rule (S13: "veggie burger" is not beef) needs this one flag.
        if 'explicit_meat' in (rec.get('flags') or []):
            item['explicitMeat'] = True
        out.append(item)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    print(f'gen_slugs: wrote {len(out)} slugs to {os.path.relpath(OUT_PATH)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
