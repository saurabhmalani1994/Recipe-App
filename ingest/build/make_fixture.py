"""Build app/src/corpus/fixture.db: at most 300 recipes, a size-balanced slice of the sample build.

Run: python3 -m ingest.build.make_fixture [--sample-db PATH] [--n 300]

Selection: the sources that wrote recipes to the sample build share the n slots equally (a
source with fewer recipes than its share gives the rest to the others), and within a source the
recipes are sorted by (line_count, key) and taken at evenly spaced ranks, so the slice spans
short and long recipes from every source instead of mirroring recipenlg's weight. The chosen
raw records are re-read from the raw files (the same lines the sample build selected) into a
temporary raw directory and built with the normal builder, so the fixture is a real corpus.db.
"""
import argparse
import json
import os
import sqlite3
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402
from ingest.build.build_corpus import DERIVED, build  # noqa: E402

OUT = os.path.join(_ROOT, 'app', 'src', 'corpus', 'fixture.db')
MAX = 300


def choose(con, n=MAX):
    by_source = {}
    for key, source, lines in con.execute('SELECT key, source, line_count FROM recipes ORDER BY source, line_count, key'):
        by_source.setdefault(source, []).append(key)
    share = {}
    left = n
    for src in sorted(by_source, key=lambda s: (len(by_source[s]), s)):
        k = len([s for s in by_source if s not in share])
        share[src] = min(len(by_source[src]), left // k)
        left -= share[src]
    chosen = set()
    for src, keys in by_source.items():
        k = share[src]
        if k >= len(keys):
            chosen.update(keys)
        elif k > 0:
            chosen.update(keys[(i * len(keys)) // k] for i in range(k))
    return chosen, share


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--sample-db', default=os.path.join(DERIVED, 'corpus_sample.db'))
    ap.add_argument('--n', type=int, default=MAX)
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args(argv)
    con = sqlite3.connect(f'file:{args.sample_db}?mode=ro', uri=True)
    chosen, share = choose(con, args.n)
    plan = con.execute('SELECT source, lines_total, quota FROM build_sources ORDER BY source').fetchall()
    con.close()
    with tempfile.TemporaryDirectory() as tmp:
        found = 0
        for source, total, quota in plan:
            if not share.get(source):
                continue
            os.makedirs(os.path.join(tmp, source))
            with open(os.path.join(tmp, source, 'recipes.jsonl'), 'w', encoding='utf-8') as out:
                for _, line in S.select(S.raw_path(source), total, quota):
                    try:
                        rid = json.loads(line).get('id')
                    except ValueError:
                        continue
                    if rid in chosen:
                        out.write(line if line.endswith('\n') else line + '\n')
                        found += 1
        if found != len(chosen):
            print(f'FAIL: found {found} of {len(chosen)} chosen raw records', file=sys.stderr)
            return 1
        build(args.out, raw_root=tmp, quotas=None, fresh=True, log=lambda *_: None)
    con = sqlite3.connect(args.out)
    n = con.execute('SELECT count(*) FROM recipes').fetchone()[0]
    per = dict(con.execute('SELECT source, count(*) FROM recipes GROUP BY source ORDER BY source').fetchall())
    con.close()
    print(f'wrote {args.out}: {n} recipes, {os.path.getsize(args.out):,} bytes; per source {per}')
    return 0 if n <= MAX else 1


if __name__ == '__main__':
    sys.exit(main())
