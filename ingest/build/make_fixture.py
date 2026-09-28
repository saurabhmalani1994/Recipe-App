"""Build app/src/corpus/fixture.db: at most 300 recipes, a size-balanced slice of the sample build.

Run: python3 -m ingest.build.make_fixture [--sample-db PATH] [--n 300]
     python3 -m ingest.build.make_fixture --keys-from app/src/corpus/fixture.db
         rebuild the same recipes (by key) with the current builder and schema, so a schema bump
         does not change which recipes the app's tests see (brief S15)
     python3 -m ingest.build.make_fixture --keys-from app/src/corpus/fixture.db --keep-rows
         migrate instead: a file created from the current schema holding every row of the old
         fixture as it was, with only the MIGRATED_COLUMNS of `recipes` taken from a rebuild of
         the same keys. A plain rebuild re-tags every recipe with today's taggers (cuisine,
         diet, course), and the app's tests pin some of those tags; --keep-rows changes only
         what the schema bump is about.

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
from ingest.build.build_corpus import DERIVED, SCHEMA_PATH, build  # noqa: E402

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
    ap.add_argument('--keys-from', help='a corpus.db whose recipe keys to rebuild (e.g. the current fixture)')
    ap.add_argument('--keep-rows', action='store_true', help='with --keys-from: migrate, keeping every old row')
    args = ap.parse_args(argv)
    if args.keys_from and args.keep_rows:
        return migrate_keep_rows(args.keys_from, args.out)
    if args.keys_from:
        return rebuild_keys(args.keys_from, args.out)
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


def _line_id(line):
    """The record id of a raw line, read from its head without parsing the whole line."""
    i = line.find('"id": "')
    if i < 0 or i > 20:
        try:
            return json.loads(line).get('id')
        except ValueError:
            return None
    j = line.find('"', i + 7)
    return line[i + 7:j]


# The recipes columns S15 added or changed the meaning of: servings is now estimated where the
# source gives none, and the nutrition fill (S14) is per estimated serving.
MIGRATED_COLUMNS = ('servings', 'servings_source', 'yield_text', 'kcal', 'protein_g', 'fat_g', 'carbs_g',
                    'fiber_g', 'sugar_g', 'sodium_mg')


def migrate_keep_rows(old, out):
    """Write `out` from the current schema: every row of `old`, with MIGRATED_COLUMNS of each recipe
    from a rebuild of the same keys. Columns the old file lacks take the rebuild's value."""
    old = os.path.abspath(old)
    with tempfile.TemporaryDirectory() as tmp:
        rebuilt = os.path.join(tmp, 'rebuilt.db')
        if rebuild_keys(old, rebuilt) != 0:
            return 1
        new = os.path.join(tmp, 'new.db')
        con = sqlite3.connect(new)
        with open(SCHEMA_PATH, encoding='utf-8') as fh:
            con.executescript(fh.read())
        con.execute('ATTACH ? AS old', (f'file:{old}?mode=ro',))
        con.execute('ATTACH ? AS re', (rebuilt,))
        tables = [r[0] for r in con.execute("SELECT name FROM main.sqlite_master WHERE type = 'table' AND "
                                            "name NOT LIKE 'sqlite_%' AND name != 'recipes_fts' ORDER BY name")]
        for t in tables:
            cols = [r[1] for r in con.execute(f'PRAGMA main.table_info({t})')]
            old_cols = {r[1] for r in con.execute(f'PRAGMA old.table_info({t})')}
            con.execute(f'DELETE FROM main.{t}')
            if t == 'recipes':
                sel = ', '.join(f're.recipes.{c}' if c in MIGRATED_COLUMNS or c not in old_cols else f'old.recipes.{c}'
                                for c in cols)
                con.execute(f'INSERT INTO main.recipes ({", ".join(cols)}) SELECT {sel} FROM old.recipes '
                            'JOIN re.recipes ON re.recipes.key = old.recipes.key')
            else:
                keep = [c for c in cols if c in old_cols]
                con.execute(f'INSERT INTO main.{t} ({", ".join(keep)}) SELECT {", ".join(keep)} FROM old.{t}')
        con.execute("UPDATE main.corpus_meta SET value = (SELECT value FROM re.corpus_meta WHERE key = "
                    "'schema_version') WHERE key = 'schema_version'")
        con.execute("INSERT OR REPLACE INTO main.corpus_meta (key, value) SELECT key, value FROM re.corpus_meta "
                    "WHERE key LIKE 'servings.%' OR key LIKE 'nutrition.%'")
        n_old = con.execute('SELECT count(*) FROM old.recipes').fetchone()[0]
        n = con.execute('SELECT count(*) FROM main.recipes').fetchone()[0]
        con.commit()
        con.execute('DETACH old')
        con.execute('DETACH re')
        con.execute('ANALYZE')
        con.commit()
        con.execute('VACUUM')
        con.close()
        if n != n_old:
            print(f'FAIL: {n} of {n_old} recipes migrated', file=sys.stderr)
            return 1
        with open(new, 'rb') as src, open(out, 'wb') as dst:
            dst.write(src.read())
    print(f'migrated {out}: {n} recipes kept, {len(MIGRATED_COLUMNS)} recipes columns from the rebuild')
    return 0


def rebuild_keys(keys_from, out):
    """Rebuild exactly the recipes of `keys_from` from the raw files into `out`."""
    con = sqlite3.connect(f'file:{os.path.abspath(keys_from)}?mode=ro', uri=True)
    by_source = {}
    for key, source in con.execute('SELECT key, source FROM recipes ORDER BY key'):
        by_source.setdefault(source, set()).add(key)
    con.close()
    with tempfile.TemporaryDirectory() as tmp:
        found = 0
        for source, keys in sorted(by_source.items()):
            os.makedirs(os.path.join(tmp, source))
            with open(S.raw_path(source), encoding='utf-8') as fh, \
                    open(os.path.join(tmp, source, 'recipes.jsonl'), 'w', encoding='utf-8') as dst:
                for line in fh:
                    if _line_id(line) in keys:
                        dst.write(line if line.endswith('\n') else line + '\n')
                        found += 1
        want = sum(len(v) for v in by_source.values())
        if found != want:
            print(f'FAIL: found {found} of {want} raw records', file=sys.stderr)
            return 1
        tmp_out = os.path.join(tmp, 'fixture.db')
        build(tmp_out, raw_root=tmp, quotas=None, fresh=True, log=lambda *_: None)
        with open(tmp_out, 'rb') as src, open(out, 'wb') as dst:
            dst.write(src.read())
    con = sqlite3.connect(out)
    n = con.execute('SELECT count(*) FROM recipes').fetchone()[0]
    con.close()
    print(f'wrote {out}: {n} recipes (of {want} keys), {os.path.getsize(out):,} bytes')
    return 0 if n == want else 1


if __name__ == '__main__':
    sys.exit(main())
