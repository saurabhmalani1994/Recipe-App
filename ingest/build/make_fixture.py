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

     python3 -m ingest.build.make_fixture --keys-from app/src/corpus/fixture.db --refresh \
         --corpus /home/user/recipe-data/out/corpus.db
         the S10 refresh: --keep-rows for every recipe the app's tests name (APP_SRC is grepped for
         recipe keys), the unreferenced rows of foodcom (R11) and of the pre-S1c Food Wishes ids
         (their raw records no longer exist) dropped, and the freed slots filled from the curated
         corpus: cuisine-site recipes and Food Wishes video-method ones (REFRESH_PLAN).

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
    ap.add_argument('--refresh', action='store_true', help='with --keys-from and --corpus: the S10 refresh')
    ap.add_argument('--corpus', default='/home/user/recipe-data/out/corpus.db')
    ap.add_argument('--keep-all', action='store_true', help='with --refresh: migrate every old row, add nothing')
    args = ap.parse_args(argv)
    if args.keys_from and args.refresh:
        return refresh(args.keys_from, args.out, args.corpus, args.n, keep_all=args.keep_all)
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


# The recipes columns a migration takes from the rebuild. S15 took servings, servings_source,
# yield_text and the nutrition columns (servings became estimated); S10 adds only video_url, a new
# column, which a migration takes from the rebuild anyway, so nothing else is re-taken now.
MIGRATED_COLUMNS = ()


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


def rebuild_keys(keys_from, out, keys=None, allow_missing=False):
    """Rebuild exactly the recipes of `keys_from` (or the (key, source) pairs `keys`) from the raw
    files into `out`. allow_missing: a key whose raw record is gone is skipped, not a failure."""
    by_source = {}
    if keys is None:
        con = sqlite3.connect(f'file:{os.path.abspath(keys_from)}?mode=ro', uri=True)
        keys = con.execute('SELECT key, source FROM recipes ORDER BY key').fetchall()
        con.close()
    for key, source in keys:
        by_source.setdefault(source, set()).add(key)
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
        if allow_missing:
            want = found
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



# ---- the S10 refresh -------------------------------------------------------------------------

APP_SRC = os.path.join(_ROOT, 'app', 'src')
# Slots the refresh fills from the curated corpus, in this order: per cuisine site (sites.yaml),
# then Food Wishes recipes whose method is the video (no steps rows), then Food Wishes with steps,
# then recipenlg, spread over cuisines. Whatever is left of MAX after them goes to recipenlg.
REFRESH_PLAN = (('site', 2), ('foodwishes_video', 12), ('foodwishes_steps', 6))
DROP_UNREFERENCED = ('foodcom',)   # R11: the corpus no longer carries the source


def referenced_keys(src=APP_SRC):
    """Every '<source>:<id>' recipe key the app's source and tests name."""
    import re
    rx = re.compile(r"'([a-z_0-9]+:[^'\s]+)'")
    keys = set()
    for dirpath, _, files in os.walk(src):
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                with open(os.path.join(dirpath, f), encoding='utf-8') as fh:
                    keys.update(rx.findall(fh.read()))
    return keys


def _spread(rows, k):
    """k of `rows` (already in a stable order) at evenly spaced ranks."""
    if k >= len(rows):
        return list(rows)
    return [rows[(i * len(rows)) // k] for i in range(k)]


def plan_refresh(old, corpus, n=MAX, ref=None):
    """(keys to drop from the old fixture, [(key, source)] to add from `corpus`)."""
    from ingest.cuisine.cuisines import site_ids
    ref = referenced_keys() if ref is None else ref
    oc = sqlite3.connect(f'file:{os.path.abspath(old)}?mode=ro', uri=True)
    old_rows = oc.execute('SELECT key, source FROM recipes ORDER BY key').fetchall()
    oc.close()
    raw_ids = {}
    drop = set()
    for key, source in old_rows:
        if key in ref:
            continue
        if source in DROP_UNREFERENCED:
            drop.add(key)
            continue
        if source not in raw_ids:
            ids = set()
            with open(S.raw_path(source), encoding='utf-8') as fh:
                for line in fh:
                    ids.add(_line_id(line))
            raw_ids[source] = ids
        if key not in raw_ids[source]:
            drop.add(key)   # its raw record is gone (the pre-S1c Food Wishes ids)
    have = {k for k, _ in old_rows} - drop
    cc = sqlite3.connect(f'file:{os.path.abspath(corpus)}?mode=ro', uri=True)
    q = lambda sql, *a: cc.execute(sql, a).fetchall()  # noqa: E731
    add = []
    for kind, k in REFRESH_PLAN:
        if kind == 'site':
            for site in sorted(site_ids()):
                rows = q('SELECT key, source FROM recipes WHERE source = ? ORDER BY line_count, key', site)
                add += _spread([r for r in rows if r[0] not in have], k)
        elif kind == 'foodwishes_video':
            add += _spread(q("SELECT key, source FROM recipes WHERE source = 'foodwishes' AND video_url IS NOT NULL "
                             'AND NOT EXISTS (SELECT 1 FROM steps WHERE recipe_id = recipes.id) ORDER BY key'), k)
        elif kind == 'foodwishes_steps':
            add += _spread(q("SELECT key, source FROM recipes WHERE source = 'foodwishes' AND "
                             'EXISTS (SELECT 1 FROM steps WHERE recipe_id = recipes.id) ORDER BY key'), k)
    left = n - len(have) - len(add)
    if left > 0:
        taken = {k for k, _ in add} | have
        by_cuisine = {}
        for key, source, cuisine in q("SELECT key, source, coalesce(cuisine, '') FROM recipes "
                                      "WHERE source = 'recipenlg' ORDER BY quality DESC, key"):
            if key not in taken:
                by_cuisine.setdefault(cuisine, []).append((key, source))
        cuisines = sorted(by_cuisine)
        i = 0
        while left > 0 and any(by_cuisine.values()):
            c = cuisines[i % len(cuisines)]
            if by_cuisine[c]:
                add.append(by_cuisine[c].pop(0))
                left -= 1
            i += 1
    cc.close()
    return drop, add


def refresh(old, out, corpus, n=MAX, log=print, keep_all=False):
    """The S10 refresh: keep-rows for the old fixture minus `drop`, plus the planned additions,
    rebuilt from raw with today's builder. The FTS index is rebuilt for every row. keep_all: drop
    and add nothing, only migrate every old row to the current schema (the app's tests pin counts
    over the whole fixture, so any change of rows moves them; see orch/reports/S10.md)."""
    old = os.path.abspath(old)
    drop, add = (set(), []) if keep_all else plan_refresh(old, corpus, n)
    with tempfile.TemporaryDirectory() as tmp:
        oc = sqlite3.connect(f'file:{old}?mode=ro', uri=True)
        kept = [(k, s) for k, s in oc.execute('SELECT key, source FROM recipes ORDER BY key') if k not in drop]
        oc.close()
        rebuilt = os.path.join(tmp, 'rebuilt.db')
        if rebuild_keys(None, rebuilt, keys=kept + add, allow_missing=True) != 0:
            return 1
        new = os.path.join(tmp, 'new.db')
        con = sqlite3.connect(new)
        with open(SCHEMA_PATH, encoding='utf-8') as fh:
            con.executescript(fh.read())
        con.execute('ATTACH ? AS old', (f'file:{old}?mode=ro',))
        con.execute('ATTACH ? AS re', (rebuilt,))
        con.execute('CREATE TEMP TABLE dropped AS SELECT id FROM old.recipes WHERE key IN '
                    '(SELECT value FROM json_each(?))', (json.dumps(sorted(drop)),))
        static = ('ingredients', 'ingredient_synonyms', 'substitutions', 'substitution_components', 'season',
                  'units')
        tables = [r[0] for r in con.execute("SELECT name FROM main.sqlite_master WHERE type = 'table' AND "
                                            "name NOT LIKE 'sqlite_%' AND name NOT LIKE 'recipes_fts%' ORDER BY name")]
        for t in tables:
            cols = [r[1] for r in con.execute(f'PRAGMA main.table_info({t})')]
            old_cols = {r[1] for r in con.execute(f'PRAGMA old.table_info({t})')}
            con.execute(f'DELETE FROM main.{t}')
            if t in static and not keep_all:   # today's tables, so the added recipes' slugs resolve
                con.execute(f'INSERT INTO main.{t} SELECT * FROM re.{t}')
            elif t == 'recipes':
                sel = ', '.join(f're.recipes.{c}' if c in MIGRATED_COLUMNS or c not in old_cols else f'old.recipes.{c}'
                                for c in cols)
                con.execute(f'INSERT INTO main.recipes ({", ".join(cols)}) SELECT {sel} FROM old.recipes '
                            'LEFT JOIN re.recipes ON re.recipes.key = old.recipes.key '
                            'WHERE old.recipes.id NOT IN (SELECT id FROM temp.dropped)')
            elif 'recipe_id' in cols:
                keep = [c for c in cols if c in old_cols]
                con.execute(f'INSERT INTO main.{t} ({", ".join(keep)}) SELECT {", ".join(keep)} FROM old.{t} '
                            'WHERE recipe_id NOT IN (SELECT id FROM temp.dropped)')
            else:
                keep = [c for c in cols if c in old_cols]
                con.execute(f'INSERT INTO main.{t} ({", ".join(keep)}) SELECT {", ".join(keep)} FROM old.{t}')
        # the additions, with ids after the old ones
        base = con.execute('SELECT max(id) FROM old.recipes').fetchone()[0]
        con.execute('CREATE TEMP TABLE idmap AS SELECT id AS rid, ? + row_number() OVER (ORDER BY key) AS nid '
                    'FROM re.recipes WHERE key IN (SELECT value FROM json_each(?))', (base, json.dumps([k for k, _ in add])))
        cols = [r[1] for r in con.execute('PRAGMA main.table_info(recipes)')]
        con.execute(f'INSERT INTO main.recipes ({", ".join(cols)}) SELECT temp.idmap.nid, '
                    f'{", ".join("re.recipes." + c for c in cols[1:])} FROM re.recipes JOIN temp.idmap '
                    'ON temp.idmap.rid = re.recipes.id')
        for t in tables:
            cols = [r[1] for r in con.execute(f'PRAGMA main.table_info({t})')]
            if t == 'recipes' or 'recipe_id' not in cols:
                continue
            rest = [c for c in cols if c != 'recipe_id']
            con.execute(f'INSERT INTO main.{t} (recipe_id, {", ".join(rest)}) SELECT temp.idmap.nid, '
                        f'{", ".join("re." + t + "." + c for c in rest)} FROM re.{t} JOIN temp.idmap '
                        f'ON temp.idmap.rid = re.{t}.recipe_id')
        # FTS for every row: title, the ingredient lines, the cuisine (as build_corpus writes it)
        con.execute("INSERT INTO main.recipes_fts (rowid, title, ingredients, cuisine) SELECT r.id, r.title, "
                    "coalesce((SELECT group_concat(raw, char(10)) FROM (SELECT DISTINCT line, raw FROM "
                    "main.recipe_ingredients WHERE recipe_id = r.id ORDER BY line)), ''), "
                    "replace(coalesce(r.cuisine, ''), '_', ' ') FROM main.recipes AS r ORDER BY r.id")
        con.execute('UPDATE main.ingredients SET recipe_count = (SELECT count(*) FROM main.recipe_slugs AS rs '
                    'WHERE rs.slug = ingredients.slug)')
        n_rec = con.execute('SELECT count(*) FROM main.recipes').fetchone()[0]
        con.execute("DELETE FROM main.corpus_meta WHERE key LIKE 'servings.%' OR key LIKE 'nutrition.%' OR "
                    "key = 'recipe_count'")
        con.execute("INSERT OR REPLACE INTO main.corpus_meta (key, value) SELECT key, value FROM re.corpus_meta "
                    "WHERE key = 'schema_version'")
        con.execute("INSERT INTO main.corpus_meta (key, value) SELECT 'servings.' || coalesce(servings_source, "
                    "'null'), CAST(count(*) AS TEXT) FROM main.recipes GROUP BY 1")
        con.execute("INSERT INTO main.corpus_meta (key, value) VALUES ('nutrition.filled', (SELECT CAST(count(*) "
                    "AS TEXT) FROM main.recipes WHERE kcal IS NOT NULL)), ('nutrition.total', ?), "
                    "('recipe_count', ?)", (str(n_rec), str(n_rec)))
        missing_old = con.execute('SELECT count(*) FROM main.recipes WHERE id <= ? AND key NOT IN '
                                  '(SELECT key FROM re.recipes)', (base,)).fetchone()[0]
        con.commit()
        con.execute('DETACH old')
        con.execute('DETACH re')
        con.execute("INSERT INTO recipes_fts (recipes_fts) VALUES ('optimize')")
        con.execute('ANALYZE')
        con.commit()
        con.execute('VACUUM')
        con.close()
        with open(new, 'rb') as src, open(out, 'wb') as dst:
            dst.write(src.read())
    per = dict(sqlite3.connect(out).execute('SELECT source, count(*) FROM recipes GROUP BY 1').fetchall())
    log(f'refreshed {out}: {n_rec} recipes ({len(kept)} kept, {missing_old} of them with no raw record left, '
        f'{len(drop)} dropped, {len(add)} added); per source {per}')
    return 0 if n_rec <= n else 1


if __name__ == '__main__':
    sys.exit(main())
