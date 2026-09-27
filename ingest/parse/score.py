"""Score the parser against the hand-labelled gold set.

Usage:
  python3 ingest/parse/score.py            per-field summary; exit 1 if a bar is missed
  python3 ingest/parse/score.py --misses   also list every missed field

gold.jsonl holds one line per record: {"n": line number in
ingest/fixtures/ingredient_lines_sample.txt, "line": the raw text, "items": [{slug, qty, qty_max,
unit, optional}]}. Headers and blank lines have items = []. Labels follow the conventions in
parser.py's docstring; raw_name, prep and note are free text and are not scored.

Scoring credits exact matches only, per field. Gold item i is compared with parsed item i; a
missing parsed item scores zero on every field. Numbers are compared after rounding to 3 decimals
(so 1/3 labelled 0.333 matches 0.3333). A line whose gold has no items scores its "items" field
by whether the parser also returned none.

The bar, written before the first run: slug >= 95%, qty >= 97%, unit >= 97%.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from ingest.parse.parser import parse_line  # noqa: E402

GOLD_PATH = os.path.join(HERE, 'gold.jsonl')
FIELDS = ('slug', 'qty', 'qty_max', 'unit', 'optional')
BAR = {'slug': 0.95, 'qty': 0.97, 'unit': 0.97}


def load_gold(path=GOLD_PATH):
    with open(path, encoding='utf-8') as fh:
        return [json.loads(x) for x in fh if x.strip()]


def _eq(field, a, b):
    if field in ('qty', 'qty_max'):
        if a is None or b is None:
            return a is None and b is None
        return round(float(a), 3) == round(float(b), 3)
    return a == b


def score(gold):
    hits = {f: 0 for f in FIELDS}
    total = 0
    count_hits = 0
    misses = []
    for rec in gold:
        got = parse_line(rec['line'])
        if len(got) == len(rec['items']):
            count_hits += 1
        else:
            misses.append((rec['n'], 'items', len(rec['items']), len(got), rec['line']))
        for i, g in enumerate(rec['items']):
            total += 1
            p = got[i] if i < len(got) else {}
            for f in FIELDS:
                if _eq(f, g[f], p.get(f)):
                    hits[f] += 1
                else:
                    misses.append((rec['n'], f, g[f], p.get(f), rec['line']))
    acc = {f: hits[f] / total if total else 0.0 for f in FIELDS}
    return {'lines': len(gold), 'items': total, 'item_count_exact': count_hits / len(gold),
            'hits': hits, 'acc': acc, 'misses': misses}


def main(argv):
    res = score(load_gold())
    parts = [f'{f} {res["hits"][f]}/{res["items"]} = {100 * res["acc"][f]:.1f}%' for f in FIELDS]
    print(f'gold: {res["lines"]} lines, {res["items"]} items; ' + '; '.join(parts) +
          f'; item count exact {100 * res["item_count_exact"]:.1f}%')
    failed = [f for f, b in BAR.items() if res['acc'][f] < b]
    print('bar (slug>=95, qty>=97, unit>=97): ' + ('PASSED' if not failed else 'MISSED ' + ', '.join(failed)))
    if '--misses' in argv:
        for n, f, want, got, line in res['misses']:
            print(f'{n}\t{f}\twant={want!r}\tgot={got!r}\t{line}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
