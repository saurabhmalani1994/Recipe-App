#!/usr/bin/env python3
"""Writes `app/src/parse/tables.gen.json` (the parser's word tables) and
`app/src/parse/testdata/python_parse.json`: the Python parser's output
(`ingest/parse/parser.py`) on every line of `ingest/parse/gold.jsonl` and
`ingest/fixtures/ingredient_lines_sample.txt`.

The TypeScript port (`app/src/parse/`) is held to this snapshot by `parity.test.ts` (S13 #2,
ORCHESTRATION rule 12). Re-run after the Python parser, normaliser, units or taxonomy change,
and run `python3 scripts/gen_slugs.py` too so the app's synonym index matches.

Usage: python3 scripts/gen_parse_snapshot.py   (paths are relative to this file)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, ROOT)
from ingest.parse.parser import parse_line  # noqa: E402

GOLD = os.path.join(ROOT, 'ingest', 'parse', 'gold.jsonl')
SAMPLE = os.path.join(ROOT, 'ingest', 'fixtures', 'ingredient_lines_sample.txt')
OUT = os.path.join(HERE, '..', 'src', 'parse', 'testdata', 'python_parse.json')
TABLES = os.path.join(HERE, '..', 'src', 'parse', 'tables.gen.json')
# Hand-picked lines for what differs between Python and JavaScript (ties in round(), Unicode
# digits and word boundaries, CJK, huge numbers); not in ingest/, so they live with the test.
EDGE = os.path.join(HERE, '..', 'src', 'parse', 'testdata', 'edge_lines.txt')


def gold_lines():
    with open(GOLD, encoding='utf-8') as fh:
        return [json.loads(row)['line'] for row in fh.read().split('\n') if row.strip()]


def sample_lines(path=SAMPLE):
    # One line per '\n'; a trailing newline does not make an extra line. parity.test.ts splits
    # the same way and checks the lines match before comparing anything.
    with open(path, encoding='utf-8', newline='') as fh:
        text = fh.read()
    lines = text.split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    return lines


def write_tables():
    """The parser's word tables, exported verbatim so the port cannot drift from them. The
    regexes and the control flow are ported by hand in parser.ts."""
    from ingest.parse import parser as P
    from ingest.parse import units as U
    from ingest.taxonomy import normalize as N
    tables = {
        'normalize': {
            'KEEP': sorted(N._KEEP),
            'IRREGULAR': N._IRREGULAR,
            'SPELLING': N.SPELLING,
        },
        'units': {
            'UNIT_ALIASES': U.UNIT_ALIASES,
            'CASE_SENSITIVE': U.CASE_SENSITIVE,
            'FRONT_ONLY': sorted(U.FRONT_ONLY),
            'POSTFIX': U.POSTFIX,
            'IMPLICIT_ONE': sorted(U.IMPLICIT_ONE),
            'CONTAINERS': sorted(U.CONTAINERS),
            'VOLUME_ML': U.VOLUME_ML,
            'MASS_G': U.MASS_G,
        },
        'parser': {
            'FRACTIONS': P.FRACTIONS,
            'NUMBER_WORDS': P.NUMBER_WORDS,
            'LOST_SLASH': P.LOST_SLASH,
            'SIZE_WORDS': list(P.SIZE_WORDS),
            'PREP_WORDS': sorted(P.PREP_WORDS),
            'STOP_SECOND_PART': sorted(P.STOP_SECOND_PART),
            'SPAN_STOP': sorted(P.SPAN_STOP),
            'CANNED_FORM': P.CANNED_FORM,
            'MEATLESS_WORDS': sorted(P.MEATLESS_WORDS),
        },
    }
    with open(TABLES, 'w', encoding='utf-8') as fh:
        json.dump(tables, fh, ensure_ascii=False, indent=1)
        fh.write('\n')


def main() -> int:
    write_tables()
    out = {}
    for name, lines in (('gold', gold_lines()), ('sample', sample_lines()),
                        ('edge', sample_lines(EDGE))):
        out[name] = [{'line': line, 'items': parse_line(line)} for line in lines]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        # One record per line keeps a diff of the snapshot readable.
        fh.write('{\n')
        names = list(out)
        for gi, name in enumerate(names):
            fh.write(f'"{name}": [\n')
            rows = out[name]
            for i, rec in enumerate(rows):
                fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True))
                fh.write(',\n' if i < len(rows) - 1 else '\n')
            fh.write(']' + (',\n' if gi < len(names) - 1 else '\n'))
        fh.write('}\n')
    n_items = sum(len(r['items']) for rows in out.values() for r in rows)
    print(f'gen_parse_snapshot: gold {len(out["gold"])} lines, sample {len(out["sample"])} lines, '
          f'edge {len(out["edge"])} lines, '
          f'{n_items} items -> {os.path.relpath(OUT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
