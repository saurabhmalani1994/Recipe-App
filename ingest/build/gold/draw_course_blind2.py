"""Draw the S10b fresh course blind set (brief S10b #2): 60 recipes from the S10 corpus
(/home/user/recipe-data/out/corpus.db, read-only), drawn *after* the new modifier rules were
frozen in course.py -- unlike course_blind.jsonl (S9a), which was drawn from the pre-build
5k sample pool, this is drawn from the corpus the rules will actually run against.

Pool: every corpus.db key, minus any id that already appears in course_gold/holdout/blind.jsonl
(those were seen while the rules were written or tuned). recipenlg ids are its raw file's own
line numbers (id "recipenlg:N" is line N), so those are read by direct line access; every other
source's small enough to scan once for the ids drawn.

Run: python3 -m ingest.build.gold.draw_course_blind2 > ingest/build/gold/course_blind2.jsonl
"""
import json
import os
import random
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402

CORPUS_DB = os.environ.get('CORPUS_DB', '/home/user/recipe-data/out/corpus.db')
SEED = 1006
N = 60


def _seen_ids():
    seen = set()
    for name in ('course_gold.jsonl', 'course_holdout.jsonl', 'course_blind.jsonl'):
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                if line.strip():
                    seen.add(json.loads(line)['id'])
    return seen


def _fetch_raw(keys):
    by_source = {}
    for k in keys:
        by_source.setdefault(k.split(':', 1)[0], set()).add(k)
    out = {}
    for src, ks in by_source.items():
        path = S.raw_path(src)
        if src == 'recipenlg':
            with open(path, encoding='utf-8', errors='replace') as fh:
                for n, line in enumerate(fh):
                    key = f'recipenlg:{n}'
                    if key in ks:
                        out[key] = json.loads(line)
                        ks.discard(key)
                        if not ks:
                            break
            continue
        remaining = set(ks)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                if not remaining:
                    break
                try:
                    raw = json.loads(line)
                except ValueError:
                    continue
                if raw.get('id') in remaining:
                    out[raw['id']] = raw
                    remaining.discard(raw['id'])
    return out


def main():
    con = sqlite3.connect(f'file:{CORPUS_DB}?mode=ro', uri=True)
    keys = [r[0] for r in con.execute('SELECT key FROM recipes')]
    con.close()
    seen = _seen_ids()
    pool = [k for k in keys if k not in seen]
    drawn = random.Random(SEED).sample(pool, N)
    raw_by_key = _fetch_raw(drawn)
    n = 300
    written = 0
    for key in drawn:
        raw = raw_by_key.get(key)
        if raw is None:
            print(f'# missing raw for {key}', file=sys.stderr)
            continue
        print(json.dumps({'n': n, 'id': key, 'course': None, 'recipe': raw}, ensure_ascii=False))
        n += 1
        written += 1
    print(f'pool {len(pool)}, drew {len(drawn)}, matched {written}', file=sys.stderr)


if __name__ == '__main__':
    main()
