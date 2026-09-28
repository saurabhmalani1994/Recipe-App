"""The gold check (S14 deliverable 4): 15 well-known recipes with a published kcal/serving,
each hand-built as parsed ingredient items (bypassing the line parser, which is out of this
slice's scope -- ingest/nutrition/gold.jsonl). Bar, set before the first run: kcal/serving
within +/-25% on at least 12 of the 15.

Run:
  python3 -m ingest.nutrition.gold
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GOLD_PATH = os.path.join(HERE, 'gold.jsonl')
TOLERANCE = 0.25
BAR = 12

try:
    from . import estimate as E
    from ..taxonomy import taxonomy as T
except ImportError:  # run as a script
    sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
    from ingest.nutrition import estimate as E  # noqa: E402
    from ingest.taxonomy import taxonomy as T  # noqa: E402


def load_gold(path=GOLD_PATH):
    with open(path, encoding='utf-8') as fh:
        return [json.loads(line) for line in fh if line.strip()]


def check(path=GOLD_PATH, log=print):
    ing = T.load()
    slug_nutrients = E.load_slug_nutrients()
    rows = []
    for rec in load_gold(path):
        items = [dict(it, optional=it.get('optional', False)) for it in rec['items']]
        values, coverage = E.fill_recipe(items, rec['servings'], ing, slug_nutrients)
        published = rec['published_kcal']
        got = values['kcal']
        if got is None:
            ok, pct_off = False, None
        else:
            pct_off = (got - published) / published
            ok = abs(pct_off) <= TOLERANCE
        rows.append({'title': rec['title'], 'published_kcal': published, 'got_kcal': got,
                     'pct_off': pct_off, 'coverage': coverage, 'ok': ok})
        status = 'PASS' if ok else 'FAIL'
        detail = f'({pct_off:+.0%})' if pct_off is not None else f'(coverage {coverage})'
        got_str = f'{got:.0f}' if got is not None else 'NULL'
        log(f"{status}  {rec['title']:<32} published {published:>5}  got {got_str:>7}  {detail}")
    passed = sum(r['ok'] for r in rows)
    log(f'\n{passed}/{len(rows)} within +/-{TOLERANCE:.0%}; bar is {BAR}/{len(rows)}.')
    return rows, passed >= BAR


def main(argv=None):
    _, ok = check()
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
