"""Build corpus.db from the raw sources: select -> drop -> parse -> tag -> cuisine -> write.

Run:
  python3 -m ingest.build.build_corpus --sample              the 5k sample (sample.SAMPLE_QUOTAS)
  python3 -m ingest.build.build_corpus --all                 every line of every source
  python3 -m ingest.build.build_corpus --sample --fresh      delete the output first
  python3 -m ingest.build.build_corpus --select /home/user/recipe-data/derived/curate/selection.tsv
                                                             the curated corpus (brief S8): exactly
                                                             the lines ingest/curate/rank.py chose,
                                                             with its quality score, to
                                                             /home/user/recipe-data/out/corpus.db
Options: --out PATH (default /home/user/recipe-data/derived/corpus_sample.db, or corpus.db with
--all), --raw DIR, --only SOURCE[,SOURCE], --stop-after N (stop after N more lines; for tests
and for bounded runs), --report PATH (write the markdown build report).

Schema: schema/corpus.sql. The output is created from it on first run, with the static tables
(taxonomy, synonyms, substitutions, season, units) loaded in sorted order.

Deterministic: sources are built in sorted order and lines in file order; recipe ids are
assigned in that order; JSON is written with sorted keys; nothing records a clock. Two builds of
the same raw lines give the same logical content (test_build.py compares dumps).

Streamed: each source is read line by line (sample.select); nothing but the current record and
the set of ids already written for that source is held in memory.

Resumable per source: every BATCH lines the recipes, the drop counts and the source's resume
point (build_sources.next_line) are committed in one transaction. A rerun skips finished sources
and resumes an unfinished one at next_line, so an interrupted build ends identical to a clean
one. build_sources.lines_total pins how many lines a source had when first opened, so a source
that is still being fetched is read to the same point on resume.

Drops (rule 11, ruling R10): every record that does not reach corpus.db is counted in
build_drops with a reason from curate.DROP_REASONS and its first example. Fields coerced to NULL
(a unit or slug outside the schema's lists) are counted in corpus_meta as coerced.<field>.
"""
import argparse
import json
import os
import signal
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import curate  # noqa: E402
from ingest.build import sample as S  # noqa: E402
from ingest.build import servings as SERV  # noqa: E402
from ingest.build import video as VIDEO  # noqa: E402
from ingest.build.course import tag_course  # noqa: E402
from ingest.cuisine import cuisines as CU  # noqa: E402
from ingest.cuisine import season as SEASON  # noqa: E402
from ingest.cuisine.classifier import classify, load_model  # noqa: E402
from ingest.nutrition import estimate as NUT  # noqa: E402
from ingest.parse import units as U  # noqa: E402
from ingest.subs import validate as SUBS  # noqa: E402
from ingest.tag.tagger import parse_items, tag_recipe  # noqa: E402
from ingest.taxonomy import taxonomy as T  # noqa: E402

SCHEMA_PATH = os.path.join(_ROOT, 'schema', 'corpus.sql')
DERIVED = '/home/user/recipe-data/derived'
CURATED_OUT = '/home/user/recipe-data/out/corpus.db'   # the curated build (brief S8), --select
BATCH = 500
PER_RECIPE_TIMEOUT_S = 5
# The presets stored in recipe_diet. The tagger also computes vegetarian_strict (R7), but no app
# reads it, so S19 stopped storing it (8.2 MB of swaps in the S10 build).
PRESETS = ('vegetarian', 'no_red_meat')
# recipe_diet.swaps is stored with short keys and via codes (S19): a DietSwap's
# {item, slug, use, use_slug, via, sub_id, quality, from_steps} is written as
# {i, s, u, x, v, b, q, f}, via 'substitution'/'alternative'/'omit' as 's'/'a'/'o', and a key
# whose value is null is left out. app/src/corpus/model.ts decodeDietSwaps reads it back.
SWAP_KEYS = {'item': 'i', 'slug': 's', 'use': 'u', 'use_slug': 'x', 'via': 'v', 'sub_id': 'b',
             'quality': 'q', 'from_steps': 'f'}
SWAP_VIA = {'substitution': 's', 'alternative': 'a', 'omit': 'o'}


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout()


def _json(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def pack_swaps(swaps):
    """recipe_diet.swaps text for a list of DietSwap dicts, in the short form (SWAP_KEYS). Raises
    KeyError on a key or via value the short form has no code for, so a new tagger field cannot
    be dropped silently."""
    out = []
    for sw in swaps:
        d = {}
        for k, v in sw.items():
            if v is None:
                continue
            d[SWAP_KEYS[k]] = SWAP_VIA[v] if k == 'via' else v
        out.append(d)
    return _json(out)


def unpack_swaps(text):
    """The DietSwap dicts back from pack_swaps text (for tests and reports); a null comes back as
    an absent key, except slug and use, which are always present."""
    keys = {v: k for k, v in SWAP_KEYS.items()}
    via = {v: k for k, v in SWAP_VIA.items()}
    out = []
    for d in json.loads(text):
        sw = {'slug': None, 'use': None}
        for k, v in d.items():
            sw[keys[k]] = via[v] if k == 'v' else v
        out.append(sw)
    return out


_INVISIBLE = dict.fromkeys(map(ord, '\u200b\u200c\u200d\u2060\ufeff'))


def clean_title(title):
    """The title without zero-width characters (archanaskitchen titles lead with runs of U+200B)
    and outer whitespace."""
    return title.translate(_INVISIBLE).strip()


def _b(v):
    return None if v is None else int(bool(v))


# ---- schema and static tables ----------------------------------------------------------------

def schema_enums(con):
    """{(table, column): set of allowed values} from the CHECK (col IN (...)) lists, so the
    builder coerces exactly what the schema would reject."""
    import re
    out = {}
    for name, sql in con.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL"):
        for col, vals in re.findall(r'CHECK \((\w+) IN \(([^)]*)\)\)', sql):
            out[(name, col)] = {v.strip().strip("'") for v in vals.split(',')}
    return out


def create(path):
    con = sqlite3.connect(path)
    with open(SCHEMA_PATH, encoding='utf-8') as fh:
        con.executescript(fh.read())
    load_static(con)
    con.commit()
    return con


def load_static(con):
    ing = T.load()
    rows = []
    syn = []
    for slug in sorted(ing):
        r = ing[slug]
        rows.append((slug, r.get('name') or slug.replace('_', ' '), r.get('parent'), r['category'],
                     r['aisle'], _json(sorted(r.get('flags') or [])), r.get('density_g_per_ml'),
                     r.get('each_g'), int(bool(r.get('is_staple'))), r.get('usda_hint')))
        for s in sorted(set(r.get('synonyms') or [])):
            syn.append((s, slug))
    con.executemany('INSERT INTO ingredients (slug, name, parent, category, aisle, flags, density_g_per_ml, '
                    'each_g, is_staple, usda_hint) VALUES (?,?,?,?,?,?,?,?,?,?)', rows)
    con.executemany('INSERT OR IGNORE INTO ingredient_synonyms (synonym, slug) VALUES (?,?)', syn)

    ing2, entries = SUBS.load()
    subs, comps = [], []
    for e in sorted(entries, key=lambda e: e['id']):
        subs.append((e['id'], e['target'], e.get('per'), e['quality'], _json(list(e['contexts'])),
                     _json(list(e['cuisines'])), _json(sorted(SUBS.substitute_flags(ing2, e))),
                     e.get('note'), e['flavor_effect']))
        for i, c in enumerate(e['substitute']):
            comps.append((e['id'], i, c['slug'], float(c['amount']), c['unit']))
    con.executemany('INSERT INTO substitutions (id, target, per_unit, quality, contexts, cuisines, flags, note, '
                    'flavor_effect) VALUES (?,?,?,?,?,?,?,?,?)', subs)
    con.executemany('INSERT INTO substitution_components (substitution_id, position, slug, amount, unit) '
                    'VALUES (?,?,?,?,?)', comps)

    produce = SEASON.load()
    con.executemany('INSERT INTO season (slug, months, month_mask) VALUES (?,?,?)',
                    [(s, _json(sorted(m)), sum(1 << (x - 1) for x in set(m)))
                     for s, m in sorted(produce.items()) if s in ing])

    units = []
    for u in U.CANONICAL_UNITS:
        if u in U.VOLUME_ML:
            units.append((u, 'volume', U.VOLUME_ML[u]))
        elif u in U.MASS_G:
            units.append((u, 'mass', U.MASS_G[u]))
        else:
            units.append((u, 'count', None))
    con.executemany('INSERT INTO units (unit, dimension, to_base) VALUES (?,?,?)', units)
    con.execute("INSERT INTO corpus_meta (key, value) VALUES ('taxonomy_slugs', ?)", (str(len(ing)),))


# ---- one recipe ------------------------------------------------------------------------------

def derive(raw, model):
    """(items, tags, course, (cuisine, confidence, cuisine_source)) for one raw recipe; raises on a
    parser or tagger failure. Shared with the curation scan (ingest/curate/scan.py), so the scan
    ranks recipes on exactly the tags the build writes."""
    items = parse_items(raw)
    tags = tag_recipe(raw, items)
    course = tag_course(raw, items)['course']
    # R20: source label > title demonym > confident classifier > title dish marker > none
    cz = CU.resolve(CU.to_canonical(raw.get('source'), raw.get('cuisine_label')), raw.get('title'),
                    lambda: classify(raw.get('ingredients'), raw.get('title'), model))
    return items, tags, course, cz


class Writer:
    def __init__(self, con):
        self.con = con
        self.enums = schema_enums(con)
        self.ing = T.load()
        self.model = load_model()
        self.slug_nutrients = NUT.load_slug_nutrients()  # USDA per-100g, ingest/nutrition/build_mapping.py
        self.coerced = {}
        self.overrides = {}   # key -> selection row (quality, rating, rating_count), from --select
        self.nutrition_filled = 0
        self.nutrition_total = 0
        self.servings_counts = {}   # 'servings.<servings_source or null>' -> recipes, for corpus_meta

    def _enum(self, table, col, v):
        if v is None:
            return None
        if v in self.enums[(table, col)]:
            return v
        k = f'coerced.{table}.{col}'
        self.coerced[k] = self.coerced.get(k, 0) + 1
        return None

    def _slug(self, slug):
        if slug is None or slug in self.ing:
            return slug
        self.coerced['coerced.recipe_ingredients.slug'] = self.coerced.get('coerced.recipe_ingredients.slug', 0) + 1
        return None

    def derive(self, raw):
        """Everything computed for one recipe; raises on a parser or tagger failure."""
        return derive(raw, self.model)

    def write(self, raw, derived):
        """Insert one recipe; returns its id, or raises sqlite3.IntegrityError on a duplicate key."""
        items, tags, course, (cuisine, cconf, csrc) = derived
        lines = raw.get('ingredients') or []
        steps = [s for s in (raw.get('steps') or []) if isinstance(s, str) and s.strip()]
        resolved_lines = {it['line'] for it in items if it.get('slug')}
        lines_with_text = [n for n, ln in enumerate(lines) if isinstance(ln, str) and ln.strip()]
        unresolved = sum(1 for n in lines_with_text if n not in resolved_lines)
        share = (len(lines_with_text) - unresolved) / len(lines_with_text) if lines_with_text else 0.0
        core = {}
        for it in items:
            s = self._slug(it.get('slug')) if it.get('slug') else None
            it['_slug'] = s
            if s:
                is_core = not it.get('optional') and not self.ing[s].get('is_staple')
                core[s] = core.get(s, False) or is_core
        tm = tags['time']
        stated = curate.parse_servings(raw.get('yield_text'))   # the source's own head count
        # Servings (S15): the source's, else estimated from the text, energy or mass
        # (ingest/build/servings.py); scaling (D11) and the nutrition fill both use it.
        est = SERV.estimate(raw, items, course, self.ing, self.slug_nutrients)
        servings = est['servings']
        servings_source = self._enum('recipes', 'servings_source', est['servings_source'])
        yield_text = raw['yield_text'] if isinstance(raw.get('yield_text'), str) and raw['yield_text'].strip() \
            else est['yield_count']
        eq = tags['equipment']
        cuisine = self._enum('recipes', 'cuisine', cuisine)
        quality = curate.quality_score(share, raw.get('image_url'), tm.get('total_min') is not None,
                                       stated is not None, raw.get('rating'), raw.get('rating_count'))
        rating = raw.get('rating') if isinstance(raw.get('rating'), (int, float)) else None
        rating_count = raw.get('rating_count') if isinstance(raw.get('rating_count'), int) else None
        ov = self.overrides.get(raw['id'])
        if ov is not None:   # a curation selection: its score, and a joined rating when the source has none
            quality = ov['quality']
            if rating is None and ov.get('rating') is not None:
                rating, rating_count = ov['rating'], ov.get('rating_count')
        # Nutrition fill (S14): per-serving kcal/protein/fat/carbs/fiber/sugar/sodium from USDA
        # FoodData Central, or all NULL when servings is unknown or too little of the recipe's
        # core grams could be priced (ingest/nutrition/estimate.py).
        # nut_coverage (the share of core lines priced) is schema/README's "record the coverage
        # per recipe": schema/corpus.sql has no column for it, so it's exposed by
        # ingest.nutrition.estimate.fill_recipe() for a caller that wants it (coverage.py
        # reports the corpus-wide, occurrence-weighted version instead).
        nutrition, nut_coverage = NUT.fill_recipe(items, servings, self.ing, self.slug_nutrients)
        del nut_coverage
        cur = self.con.execute(
            'INSERT INTO recipes (key, source, source_url, video_url, title, servings, servings_source, yield_text, total_min, '
            'active_min, '
            'time_source, weeknight, cuisine, cuisine_confidence, cuisine_source, course, one_pot, one_pan, '
            'sheet_pan_meal, stove_and_oven, no_cook, image_url, rating, rating_count, quality, line_count, '
            'unresolved_count, core_slug_count, kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g, sodium_mg) '
            'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (raw['id'], raw.get('source'), raw.get('source_url'), raw.get('video_url') or None, clean_title(raw['title']),
             servings, servings_source,
             yield_text, tm.get('total_min'), tm.get('active_min'),
             self._enum('recipes', 'time_source', tm.get('source')), _b(tm.get('weeknight')),
             cuisine, cconf if cuisine else None, csrc if cuisine else None, course,
             _b(tags['one_pot']), _b(tags['one_pan']), _b(tags['sheet_pan_meal']),
             _b(tags['stove_and_oven']), int('no_cook' in eq), raw.get('image_url'), rating,
             rating_count, quality, len(lines), unresolved, sum(1 for v in core.values() if v),
             nutrition['kcal'], nutrition['protein_g'], nutrition['fat_g'], nutrition['carbs_g'],
             nutrition['fiber_g'], nutrition['sugar_g'], nutrition['sodium_mg']))
        rid = cur.lastrowid
        # counted only once the recipe row is in (a duplicate key raises above and is not counted)
        self.nutrition_filled += 1 if nutrition['kcal'] is not None else 0
        self.nutrition_total += 1
        k = f"servings.{servings_source or 'null'}"
        self.servings_counts[k] = self.servings_counts.get(k, 0) + 1
        ing_rows = []
        for pos, it in enumerate(items):
            pkg = it.get('pkg') or {}
            ln = it['line']
            ing_rows.append((rid, pos, ln, it.get('qty'), it.get('qty_max'),
                             self._enum('recipe_ingredients', 'unit', it.get('unit')), it['_slug'],
                             lines[ln] if ln < len(lines) else '', it.get('prep'),
                             int(bool(it.get('optional'))), it.get('note'), pkg.get('qty'),
                             self._enum('recipe_ingredients', 'pkg_unit', pkg.get('unit'))))
        self.con.executemany('INSERT INTO recipe_ingredients (recipe_id, position, line, qty, qty_max, unit, slug, '
                             'raw, prep, optional, note, pkg_qty, pkg_unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                             ing_rows)
        self.con.executemany('INSERT INTO recipe_slugs (slug, recipe_id, core) VALUES (?,?,?)',
                             [(s, rid, int(c)) for s, c in sorted(core.items())])
        self.con.executemany('INSERT INTO steps (recipe_id, position, text) VALUES (?,?,?)',
                             [(rid, i, s.strip()) for i, s in enumerate(steps)])
        kit = sorted({e for e in (self._enum('recipe_equipment', 'equipment', x) for x in eq if x != 'no_cook') if e})
        self.con.executemany('INSERT INTO recipe_equipment (recipe_id, equipment) VALUES (?,?)',
                             [(rid, e) for e in kit])
        alts = []
        for g, group in enumerate(tags['equipment_alternatives']):
            for e in sorted(set(group)):
                e = self._enum('recipe_equipment_alternatives', 'equipment', e)
                if e:
                    alts.append((rid, g, e))
        self.con.executemany('INSERT INTO recipe_equipment_alternatives (recipe_id, grp, equipment) VALUES (?,?,?)',
                             alts)
        self.con.executemany('INSERT INTO recipe_diet (recipe_id, preset, status, swaps) VALUES (?,?,?,?)',
                             [(rid, p, tags['diet'][p]['status'], pack_swaps(tags['diet'][p]['swaps']))
                              for p in PRESETS])
        self.con.execute('INSERT INTO recipes_fts (rowid, title, ingredients, cuisine) VALUES (?,?,?,?)',
                         (rid, clean_title(raw['title']), '\n'.join(ln for ln in lines if isinstance(ln, str)),
                          (cuisine or '').replace('_', ' ')))
        return rid


# ---- the build loop --------------------------------------------------------------------------

def _drop(con, source, reason, example):
    con.execute('INSERT INTO build_drops (source, reason, count, example) VALUES (?,?,1,?) '
                'ON CONFLICT (source, reason) DO UPDATE SET count = count + 1', (source, reason, str(example)))


def build_source(con, writer, source, raw_root, quota, stop_after=None, log=print, lines=None):
    """Build one source; returns the number of lines handled (stop_after bounds it). `lines`
    ({line_no: selection row}) builds exactly those lines instead of a quota's stride."""
    path = S.raw_path(source, raw_root)
    row = con.execute('SELECT lines_total, next_line, selected, written, done FROM build_sources WHERE source = ?',
                      (source,)).fetchone()
    if row is None:
        total = S.count_lines(path)
        con.execute('INSERT INTO build_sources (source, lines_total, quota, next_line, selected, written, done) '
                    'VALUES (?,?,?,0,0,0,0)', (source, total, quota))
        con.commit()
        row = (total, 0, 0, 0, 0)
    total, next_line, selected, written, done = row
    if done:
        return 0
    handled = 0
    since_commit = 0
    t0 = time.time()
    last = next_line - 1
    picked = (S.select(path, total, quota, start=next_line) if lines is None
              else S.select_lines(path, total, set(lines), start=next_line))
    for n, line in picked:
        if stop_after is not None and handled >= stop_after:
            break
        handled += 1
        selected += 1
        since_commit += 1
        last = n
        try:
            raw = json.loads(line)
        except ValueError:
            raw = None
        VIDEO.attach(raw, raw_root)   # R17: a Food Wishes record's video_url, from its cached post
        reason = curate.drop_reason(raw)
        if reason is None and lines is not None and raw['id'] != lines[n]['key']:
            reason = 'selection_mismatch'   # the raw file changed under the selection
        if reason:
            _drop(con, source, reason, (raw or {}).get('id') if isinstance(raw, dict) else f'line {n}')
        else:
            signal.alarm(PER_RECIPE_TIMEOUT_S)
            try:
                derived = writer.derive(raw)
            except Timeout:
                derived = None
                _drop(con, source, 'tag_timeout', raw['id'])
            except Exception as e:  # counted with the message, never silent
                derived = None
                _drop(con, source, 'tag_error', f"{raw['id']}: {type(e).__name__}: {e}"[:200])
            finally:
                signal.alarm(0)
            if derived is not None:
                # S19: an outermost SAVEPOINT is its own transaction and RELEASE commits it, so each
                # recipe was committed ahead of its checkpoint; a run killed mid-batch then resumed
                # at the old next_line and counted the batch again as duplicate_id. Open the batch's
                # transaction first, so the recipes, drops and resume point commit together.
                if not con.in_transaction:
                    con.execute('BEGIN')
                con.execute('SAVEPOINT rec')
                try:
                    writer.write(raw, derived)
                    con.execute('RELEASE rec')
                    written += 1
                except sqlite3.IntegrityError as e:
                    con.execute('ROLLBACK TO rec')
                    con.execute('RELEASE rec')
                    if 'recipes.key' in str(e):
                        _drop(con, source, 'duplicate_id', raw['id'])
                    else:
                        _drop(con, source, 'tag_error', f"{raw['id']}: IntegrityError: {e}"[:200])
        if since_commit >= BATCH:
            _checkpoint(con, writer, source, last + 1, selected, written, 0)
            since_commit = 0
            if selected % (BATCH * 10) == 0:
                log(f'  {source}: {selected:,} read, {written:,} written, line {n:,} ({time.time() - t0:.0f}s)')
    finished = stop_after is None or handled < stop_after
    _checkpoint(con, writer, source, last + 1, selected, written, int(finished))
    log(f'{source}: {selected} selected, {written} written, {"done" if finished else "paused"} '
        f'({time.time() - t0:.1f}s)')
    return handled


def _checkpoint(con, writer, source, next_line, selected, written, done):
    con.execute('UPDATE build_sources SET next_line = ?, selected = ?, written = ?, done = ? WHERE source = ?',
                (next_line, selected, written, done, source))
    for k, v in sorted(writer.coerced.items()):
        con.execute("INSERT INTO corpus_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET "
                    "value = CAST(CAST(value AS INTEGER) + ? AS TEXT)", (k, str(v), v))
    writer.coerced = {}
    counts = [('nutrition.filled', writer.nutrition_filled), ('nutrition.total', writer.nutrition_total)]
    counts += sorted(writer.servings_counts.items())
    for k, v in counts:
        if v:
            con.execute("INSERT INTO corpus_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET "
                        "value = CAST(CAST(value AS INTEGER) + ? AS TEXT)", (k, str(v), v))
    writer.nutrition_filled = 0
    writer.nutrition_total = 0
    writer.servings_counts = {}
    con.commit()


def finalize(con):
    """Derived aggregates; idempotent, run once every source is done."""
    con.execute('UPDATE ingredients SET recipe_count = (SELECT count(*) FROM recipe_slugs AS rs '
                'WHERE rs.slug = ingredients.slug)')
    n = con.execute('SELECT count(*) FROM recipes').fetchone()[0]
    con.execute("INSERT INTO corpus_meta (key, value) VALUES ('recipe_count', ?) ON CONFLICT (key) DO UPDATE "
                "SET value = excluded.value", (str(n),))
    con.execute("INSERT INTO recipes_fts (recipes_fts) VALUES ('optimize')")
    con.commit()
    con.execute('ANALYZE')
    con.commit()
    con.execute('VACUUM')


def load_curation_drops(con, path):
    """Add a curation run's drop counts (ingest/curate/rank.py drops.json) to build_drops, once."""
    if con.execute("SELECT 1 FROM corpus_meta WHERE key = 'curation_drops'").fetchone():
        return
    with open(path, encoding='utf-8') as fh:
        drops = json.load(fh)
    for source in sorted(drops):
        for reason, (count, example) in sorted(drops[source].items()):
            con.execute('INSERT INTO build_drops (source, reason, count, example) VALUES (?,?,?,?) '
                        'ON CONFLICT (source, reason) DO UPDATE SET count = count + excluded.count',
                        (source, reason, count, str(example)))
    con.execute("INSERT INTO corpus_meta (key, value) VALUES ('curation_drops', ?)", (os.path.basename(path),))
    con.commit()


def build(out, raw_root=S.RAW, quotas=None, only=None, fresh=False, stop_after=None, log=print, select=None):
    """Build (or resume) `out`. quotas: {source: n}, or None for every line of every source.
    select: a curation selection.tsv path; builds exactly its lines with its quality scores,
    and adds the drops.json beside it to build_drops. Returns True when every source is done
    and the file is finalized."""
    selection = None
    if select:
        selection = S.load_selection(select)
        quotas = {s: len(v) for s, v in selection.items()}
    if fresh and os.path.exists(out):
        os.remove(out)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    con = sqlite3.connect(out) if os.path.exists(out) else create(out)
    con.execute('PRAGMA journal_mode = DELETE')
    con.execute('PRAGMA synchronous = NORMAL')
    writer = Writer(con)
    if selection:
        writer.overrides = {row['key']: row for rows in selection.values() for row in rows.values()}
    signal.signal(signal.SIGALRM, _alarm)
    sources = [s for s in S.sources(raw_root) if (quotas is None or quotas.get(s))]
    if only:
        sources = [s for s in sources if s in only]
    left = stop_after
    for src in sources:
        handled = build_source(con, writer, src, raw_root, None if quotas is None else quotas[src],
                               stop_after=left, log=log, lines=selection[src] if selection else None)
        if left is not None:
            left -= handled
            if left <= 0:
                break
    pending = con.execute('SELECT count(*) FROM build_sources WHERE done = 0').fetchone()[0]
    started = {r[0] for r in con.execute('SELECT source FROM build_sources')}
    complete = pending == 0 and set(sources) <= started
    if complete:
        if select:
            drops = os.path.join(os.path.dirname(os.path.abspath(select)), 'drops.json')
            if os.path.exists(drops):
                load_curation_drops(con, drops)
        finalize(con)
    con.close()
    return complete


# ---- report ----------------------------------------------------------------------------------

def _site(key, source, url):
    """The recipe's site: recipenlg's source_url host, else the source."""
    if source != 'recipenlg':
        return source
    from urllib.parse import urlparse
    host = urlparse(url or '').netloc.lower().split(':')[0]
    for p in ('www.', 'm.', 'www2.'):
        if host.startswith(p):
            host = host[len(p):]
    return f'recipenlg:{host or "unknown"}'


def _dist(rows, n, top=None):
    rows = list(rows)
    shown = rows if top is None else rows[:top]
    out = ', '.join(f'{k} {v:,} ({v / n:.1%})' for k, v in shown)
    if top is not None and len(rows) > top:
        rest = sum(v for _, v in rows[top:])
        out += f', {len(rows) - top} more {rest:,} ({rest / n:.1%})'
    return out


def distributions(con, n):
    """S10: the corpus by source, site, cuisine, course and diet, with the fill rates."""
    q = lambda sql, *a: con.execute(sql, a).fetchall()  # noqa: E731
    L = ['## Distributions (brief S10)\n']
    L.append('By source: ' + _dist(q('SELECT source, count(*) FROM recipes GROUP BY 1 ORDER BY 2 DESC, 1'), n) + '\n')
    sites = {}
    for key, src, url in q('SELECT key, source, source_url FROM recipes'):
        s = _site(key, src, url)
        sites[s] = sites.get(s, 0) + 1
    L.append('By site (recipenlg split by host): ' +
             _dist(sorted(sites.items(), key=lambda kv: (-kv[1], kv[0])), n, top=40) + '\n')
    L.append('By cuisine: ' + _dist(q("SELECT coalesce(cuisine, '(none)'), count(*) FROM recipes GROUP BY 1 "
                                      'ORDER BY 2 DESC, 1'), n) + '\n')
    L.append('By cuisine source: ' + _dist(q("SELECT coalesce(cuisine_source, '(none)'), count(*) FROM recipes "
                                             'GROUP BY 1 ORDER BY 2 DESC'), n) + '\n')
    L.append('By course: ' + _dist(q('SELECT course, count(*) FROM recipes GROUP BY 1 ORDER BY 2 DESC, 1'), n) + '\n')
    for preset in PRESETS:
        L.append(f'Diet {preset}: ' + _dist(q('SELECT status, count(*) FROM recipe_diet WHERE preset = ? GROUP BY 1 '
                                              'ORDER BY 2 DESC', preset), n) + '\n')
    for label, sql in (
            ('servings (any)', 'servings IS NOT NULL'),
            ('servings from the source', "servings_source = 'source'"),
            ('servings estimated', "servings_source IN ('text', 'energy', 'mass')"),
            ('nutrition (kcal)', 'kcal IS NOT NULL'),
            ('total time', 'total_min IS NOT NULL'),
            ('image', 'image_url IS NOT NULL'),
            ('video_url (R17)', 'video_url IS NOT NULL'),
            ('no steps rows (video method, R17)', 'NOT EXISTS (SELECT 1 FROM steps WHERE recipe_id = recipes.id)')):
        c = q(f'SELECT count(*) FROM recipes WHERE {sql}')[0][0]
        L.append(f'Fill, {label}: {c:,} ({c / n:.1%})\n')
    L.append('Servings source: ' + _dist(q("SELECT coalesce(servings_source, '(null)'), count(*) FROM recipes "
                                           'GROUP BY 1 ORDER BY 2 DESC'), n) + '\n')
    L.append('Nutrition fill by source: ' + ', '.join(
        f'{s} {f:,}/{t:,} ({f / t:.0%})' for s, f, t in
        q('SELECT source, sum(kcal IS NOT NULL), count(*) FROM recipes GROUP BY 1 ORDER BY 3 DESC')) + '\n')
    L.append('Servings fill by source: ' + ', '.join(
        f'{s} {f:,}/{t:,} ({f / t:.0%})' for s, f, t in
        q('SELECT source, sum(servings IS NOT NULL), count(*) FROM recipes GROUP BY 1 ORDER BY 3 DESC')) + '\n')
    return L


def report(path, target=100_000):
    con = sqlite3.connect(path)
    size = os.path.getsize(path)
    L = []
    q = lambda sql, *a: con.execute(sql, a).fetchall()  # noqa: E731
    n = q('SELECT count(*) FROM recipes')[0][0]
    L.append('# corpus.db build report (generated by `python3 -m ingest.build.build_corpus --report`)\n')
    L.append(f'File: `{path}`, {size:,} bytes ({size / 1e6:.1f} MB), {n:,} recipes, schema_version '
             f"{q('SELECT value FROM corpus_meta WHERE key = ?', 'schema_version')[0][0]}.\n")
    L.append('| source | lines in file | quota | selected | written | dropped |\n|---|---:|---:|---:|---:|---:|')
    for src, total, quota, sel, wr in q('SELECT source, lines_total, quota, selected, written FROM build_sources '
                                        'ORDER BY source'):
        L.append(f'| {src} | {total:,} | {quota if quota is not None else "all"} | {sel:,} | {wr:,} | {sel - wr:,} |')
    L.append('\n## Drops, with reasons\n\n| source | reason | count | first example |\n|---|---|---:|---|')
    for src, reason, c, ex in q('SELECT source, reason, count, example FROM build_drops ORDER BY source, count DESC'):
        L.append(f'| {src} | {reason} | {c:,} | `{ex}` |')
    coerced = q("SELECT key, value FROM corpus_meta WHERE key LIKE 'coerced.%' ORDER BY key")
    L.append('\nFields coerced to NULL (outside the schema lists): ' +
             (', '.join(f'{k[8:]} {v}' for k, v in coerced) if coerced else 'none') + '.\n')
    L.append('## Tags\n')
    for col in ('course', 'cuisine_source', 'time_source', 'servings_source'):
        rows = q(f"SELECT coalesce({col}, '(null)'), count(*) FROM recipes GROUP BY 1 ORDER BY 2 DESC")
        L.append(f'{col}: ' + ', '.join(f'{k} {v} ({v / n:.1%})' for k, v in rows) + '\n')
    for col in ('one_pot', 'weeknight', 'no_cook'):
        rows = q(f"SELECT coalesce({col}, '(null)'), count(*) FROM recipes GROUP BY 1 ORDER BY 1")
        L.append(f'{col}: ' + ', '.join(f'{k} {v}' for k, v in rows) + '\n')
    rows = q("SELECT preset, status, count(*) FROM recipe_diet GROUP BY 1, 2 "
             'ORDER BY 1, 3 DESC')
    L.append('diet: ' + ', '.join(f'{p}.{s} {c}' for p, s, c in rows) + '\n')
    nn = q('SELECT count(*) FROM recipes WHERE kcal IS NOT NULL')[0][0]
    L.append(f'nutrition (S14): {nn:,}/{n:,} recipes filled ({nn / n:.1%})\n' if n else 'nutrition (S14): 0 recipes\n')
    ns = q('SELECT count(*) FROM recipes WHERE servings IS NOT NULL')[0][0]
    L.append(f'servings (S15): {ns:,}/{n:,} recipes have servings ({ns / n:.1%})\n' if n else 'servings (S15): 0 recipes\n')
    L.extend(distributions(con, n) if n else [])
    L.append('## Size\n')
    try:
        rows = q('SELECT name, sum(pgsize) FROM dbstat GROUP BY name ORDER BY 2 DESC')
        L.append('| table or index | bytes | share |\n|---|---:|---:|')
        for name, b in rows:
            L.append(f'| {name} | {b:,} | {b / size:.1%} |')
    except sqlite3.OperationalError:
        L.append('(dbstat is not compiled into this sqlite; per-table sizes unavailable)')
    static = static_bytes(con)
    per = (size - static) / n if n else 0
    L.append(f'\nStatic tables (taxonomy, synonyms, substitutions, season, units): {static:,} bytes. '
             f'Per recipe: {per:,.0f} bytes. Linear extrapolation to {target:,} recipes: '
             f'{(static + per * target) / 1e6:,.0f} MB (bar: under 300 MB on the phone).\n')
    con.close()
    return '\n'.join(L) + '\n'


STATIC_TABLES = ('ingredients', 'ingredient_synonyms', 'substitutions', 'substitution_components', 'season',
                 'units', 'corpus_meta', 'sqlite_schema', 'sqlite_master')


def static_bytes(con):
    try:
        rows = con.execute('SELECT name, tbl_name, sum(pgsize) FROM dbstat JOIN sqlite_master USING (name) '
                           'GROUP BY name').fetchall()
    except sqlite3.OperationalError:
        return 0
    return sum(b for name, tbl, b in rows if tbl in STATIC_TABLES)


def main(argv=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--sample', action='store_true')
    g.add_argument('--all', action='store_true')
    g.add_argument('--select', metavar='SELECTION_TSV', help='a curation selection (ingest/curate/rank.py)')
    ap.add_argument('--out')
    ap.add_argument('--raw', default=S.RAW)
    ap.add_argument('--only')
    ap.add_argument('--fresh', action='store_true')
    ap.add_argument('--stop-after', type=int)
    ap.add_argument('--report')
    args = ap.parse_args(argv)
    out = args.out or (CURATED_OUT if args.select else
                       os.path.join(DERIVED, 'corpus_sample.db' if args.sample else 'corpus.db'))
    t0 = time.time()
    complete = build(out, raw_root=args.raw, quotas=S.SAMPLE_QUOTAS if args.sample else None,
                     only=set(args.only.split(',')) if args.only else None, fresh=args.fresh,
                     stop_after=args.stop_after, select=args.select)
    print(f'{"complete" if complete else "paused"}: {out} ({os.path.getsize(out):,} bytes) in '
          f'{time.time() - t0:.0f}s')
    if complete and args.report:
        with open(args.report, 'w', encoding='utf-8') as fh:
            fh.write(report(out))
        print(f'wrote {args.report}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
