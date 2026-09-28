"""Tests for the corpus build (brief S9a): drops, servings, the builder's determinism and resume,
the schema's lists against their owners, the course gold bar, the matching query, and the
generated app types."""
import json
import os
import sqlite3
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import build_corpus as B  # noqa: E402
from ingest.build import curate as C  # noqa: E402
from ingest.build import gen_types as G  # noqa: E402
from ingest.build import sample as S  # noqa: E402
from ingest.build.course import COURSES, tag_course  # noqa: E402
from ingest.build.gold import score_course  # noqa: E402

MATCH_SQL = os.path.join(HERE, 'match.sql')


# ---- curate ----------------------------------------------------------------------------------

def _raw(**kw):
    r = {'id': 'alpha:1', 'source': 'alpha', 'title': 'Tomato soup',
         'ingredients': ['2 tbsp olive oil', '1 onion, chopped', '800g canned tomatoes'],
         'steps': ['Soften the onion in the oil in a pan.', 'Add the tomatoes and simmer 20 minutes.']}
    r.update(kw)
    return r


def test_names_lost_exact_openrecipes_input():
    # the exact shape that broke openrecipes (R10): the amount written twice, the name lost
    lines = ['2 cups 2 cups', '½ cups ½ cups', '1 teaspoon 1 teaspoon', '½ teaspoons ½ teaspoons']
    assert C.names_lost(lines)
    assert C.drop_reason(_raw(source='openrecipes', ingredients=lines)) == 'ingredient_names_lost'
    # the same lines from another source are not an R10 drop
    assert C.drop_reason(_raw(source='alpha', ingredients=lines)) is None
    assert not C.names_lost(['2 cups flour', '1 cup sugar', '1 cup 1 cup'])


@pytest.mark.parametrize('raw, reason', [
    ('not a dict', 'bad_json'),
    (_raw(id=''), 'no_id'),
    (_raw(title='  '), 'no_title'),
    (_raw(ingredients=['', ' ']), 'no_ingredients'),
    (_raw(steps=[]), 'no_steps'),
    (_raw(steps=['  ']), 'no_steps'),
    (_raw(), None),
])
def test_drop_reason(raw, reason):
    assert C.drop_reason(raw) == reason
    assert reason is None or reason in C.DROP_REASONS


@pytest.mark.parametrize('text, want', [
    ('Serves 4', 4), ('Serves 4-6', 4), ('4 servings', 4), ('8', 8), ('Makes 12 muffins', None),
    ('Serves 6 as a side', 6), ('four small or two large portions', None), (None, None),
    ('Makes 24 (serves 6 as a starter)', 6), ('Serves 1000', None),
])
def test_parse_servings(text, want):
    assert C.parse_servings(text) == want


def test_quality_score_bounds_and_rating():
    top = C.quality_score(1.0, True, True, True, 5.0, 1000)
    unrated = C.quality_score(1.0, True, True, True)
    poor = C.quality_score(1.0, True, True, True, 1.0, 1000)
    assert 0 <= poor < unrated < top <= 1
    assert C.quality_score(0.0, False, False, False) == 0.15


# ---- sample selection ------------------------------------------------------------------------

def test_select_resume_matches_clean(tmp_path):
    p = tmp_path / 'r.jsonl'
    p.write_text(''.join(f'{i}\n' for i in range(100)))
    full = [n for n, _ in S.select(str(p), 100, 7)]
    assert len(full) == 7 and full == sorted(full)
    for cut in range(0, 100, 9):
        assert [n for n, _ in S.select(str(p), 100, 7, start=cut)] == [n for n in full if n >= cut]
    assert [n for n, _ in S.select(str(p), 100, None)] == list(range(100))


# ---- the builder -----------------------------------------------------------------------------

def _write_raw(root):
    alpha = [
        _raw(id='alpha:1'),
        _raw(id='alpha:3', steps=[]),                      # no_steps
        _raw(id='alpha:1', title='Duplicate'),             # duplicate_id
        _raw(id='alpha:4', title='Chocolate chip cookies',
             ingredients=['2 cups flour', '1 cup sugar', '1 cup butter', '2 eggs', '1 cup chocolate chips'],
             steps=['Heat the oven to 180C.', 'Cream the butter and sugar, beat in the eggs, stir in the flour and '
                    'chips.', 'Bake 12 minutes on a baking sheet.']),
        _raw(id='alpha:5', title='Garlic bread',
             ingredients=['1 baguette', '50g butter', '2 garlic cloves'],
             steps=['Mix the butter and garlic, spread on the bread and bake 10 minutes in a hot oven.']),
    ]
    beta = [
        _raw(id='openrecipes:1', source='openrecipes', ingredients=['2 cups 2 cups', '1 cup 1 cup']),
        _raw(id='openrecipes:2', source='openrecipes', title='Beef stew',
             ingredients=['1 kg beef chuck', '2 carrots', '1 onion', '500ml beef stock'],
             steps=['Brown the beef in a Dutch oven.', 'Add everything else and simmer 2 hours.']),
    ]
    meal = [
        _raw(id='themealdb:1', source='themealdb', title='Chicken curry',
             ingredients=['500g chicken thighs', '1 onion', '2 tbsp curry powder', '400ml coconut milk'],
             steps=['Brown the chicken in a large pan.', 'Add the onion and curry powder, then the coconut milk; '
                    'simmer 25 minutes.'], yield_text='Serves 4', cuisine_label='Indian'),
    ]
    for src, rows, extra in (('alpha', alpha, ['{not json']), ('openrecipes', beta, []), ('themealdb', meal, [])):
        d = root / src
        d.mkdir(parents=True)
        with open(d / 'recipes.jsonl', 'w', encoding='utf-8') as fh:
            for r in rows:
                fh.write(json.dumps(r) + '\n')
            for x in extra:
                fh.write(x + '\n')


def _dump(path):
    con = sqlite3.connect(path)
    out = [line for line in con.iterdump()]
    con.close()
    return out


@pytest.fixture(scope='module')
def built(tmp_path_factory):
    root = tmp_path_factory.mktemp('raw')
    _write_raw(root)
    out = str(tmp_path_factory.mktemp('db') / 'clean.db')
    assert B.build(out, raw_root=str(root), quotas=None, fresh=True, log=lambda *_: None)
    return root, out


def test_build_counts_every_drop(built):
    _, out = built
    con = sqlite3.connect(out)
    drops = dict(((s, r), c) for s, r, c in con.execute('SELECT source, reason, count FROM build_drops'))
    assert drops == {('alpha', 'no_steps'): 1, ('alpha', 'duplicate_id'): 1, ('alpha', 'bad_json'): 1,
                     ('openrecipes', 'ingredient_names_lost'): 1}
    for src, sel, wr in con.execute('SELECT source, selected, written FROM build_sources'):
        dropped = sum(c for (s, _), c in drops.items() if s == src)
        assert sel == wr + dropped
    assert con.execute('SELECT count(*) FROM recipes').fetchone()[0] == 5


def test_build_rows(built):
    _, out = built
    con = sqlite3.connect(out)
    con.row_factory = sqlite3.Row
    r = con.execute("SELECT * FROM recipes WHERE key = 'themealdb:1'").fetchone()
    assert r['servings'] == 4 and r['cuisine'] == 'indian' and r['cuisine_source'] == 'source_label'
    assert r['course'] == 'main' and r['one_pot'] == 1
    assert con.execute("SELECT status FROM recipe_diet WHERE recipe_id = ? AND preset = 'vegetarian'",
                       (r['id'],)).fetchone()[0] in ('no', 'adaptable')
    slugs = {row[0] for row in con.execute('SELECT slug FROM recipe_slugs WHERE recipe_id = ?', (r['id'],))}
    assert 'onion' in slugs
    cookies = con.execute("SELECT * FROM recipes WHERE key = 'alpha:4'").fetchone()
    assert cookies['course'] == 'dessert'
    assert con.execute("SELECT course FROM recipes WHERE key = 'alpha:5'").fetchone()[0] == 'baking'
    # the FTS index finds by ingredient text and returns the recipe id as rowid
    hit = con.execute("SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH 'coconut'").fetchall()
    assert [h[0] for h in hit] == [r['id']]
    # per-slug recipe counts
    assert con.execute("SELECT recipe_count FROM ingredients WHERE slug = 'onion'").fetchone()[0] == 3
    assert con.execute("SELECT value FROM corpus_meta WHERE key = 'schema_version'").fetchone()[0] == '1'


def test_build_is_deterministic(built, tmp_path):
    root, out = built
    again = str(tmp_path / 'again.db')
    assert B.build(again, raw_root=str(root), quotas=None, fresh=True, log=lambda *_: None)
    assert _dump(again) == _dump(out)


def test_build_resumes_to_the_same_file(built, tmp_path):
    root, out = built
    part = str(tmp_path / 'resumed.db')
    B.BATCH, saved = 2, B.BATCH
    try:
        assert not B.build(part, raw_root=str(root), quotas=None, fresh=True, stop_after=3, log=lambda *_: None)
        assert not B.build(part, raw_root=str(root), quotas=None, stop_after=4, log=lambda *_: None)
        assert B.build(part, raw_root=str(root), quotas=None, log=lambda *_: None)
    finally:
        B.BATCH = saved
    assert _dump(part) == _dump(out)


def test_match_query_filters(built):
    _, out = built
    con = sqlite3.connect(out)
    with open(MATCH_SQL, encoding='utf-8') as fh:
        sql = fh.read()
    base = {'have': json.dumps(['onion', 'canned_tomatoes', 'olive_oil', 'chicken_thigh', 'coconut_milk',
                                'curry_powder', 'beef_chuck', 'carrot', 'beef_stock']),
            'diet': None, 'kitchen': None, 'one_pot': None, 'cuisine': None, 'max_min': None,
            'max_missing': None, 'limit': 50}
    titles = lambda p: [r[2] for r in con.execute(sql, dict(base, **p))]  # noqa: E731
    everything = titles({})
    assert 'Tomato soup' in everything and 'Chicken curry' in everything and 'Beef stew' in everything
    veg = titles({'diet': 'vegetarian'})
    assert 'Tomato soup' in veg and 'Chicken curry' not in veg and 'Beef stew' not in veg
    assert 'Beef stew' not in titles({'diet': 'no_red_meat'})
    assert titles({'cuisine': 'indian'}) == ['Chicken curry']
    # a kitchen with no stovetop rules out the stovetop recipes
    assert 'Tomato soup' not in titles({'kitchen': json.dumps(['oven'])})
    assert 'Tomato soup' in titles({'kitchen': json.dumps(['oven', 'stovetop', 'dutch_oven'])})
    for r in con.execute(sql, dict(base, one_pot=1)):
        assert con.execute('SELECT one_pot, course FROM recipes WHERE id = ?', (r[0],)).fetchone() == (1, 'main')
    # ordered by missing, fewest first
    missing = [r[7] for r in con.execute(sql, base)]
    assert missing == sorted(missing)


# ---- schema lists against their owners -------------------------------------------------------

def _schema_enums():
    with open(B.SCHEMA_PATH, encoding='utf-8') as fh:
        _, _, enums = G.parse(fh.read())
    return enums


def test_schema_lists_match_their_owners():
    from ingest.cuisine.cuisines import canonical_labels
    from ingest.parse.units import CANONICAL_UNITS
    from ingest.subs.validate import CONTEXTS
    from ingest.tag.equipment import VOCAB
    from ingest.taxonomy.taxonomy import AISLES, CATEGORIES, FLAGS
    e = _schema_enums()
    assert e['Cuisine'] == canonical_labels()
    assert e['Equipment'] == [v for v in VOCAB if v != 'no_cook']
    assert e['Unit'] == list(CANONICAL_UNITS)
    assert e['IngredientCategory'] == list(CATEGORIES)
    assert e['Aisle'] == list(AISLES)
    assert e['IngredientFlag'] == list(FLAGS)
    assert e['SubContext'] == list(CONTEXTS)
    assert e['Course'] == list(COURSES)


def test_generated_types_are_current():
    with open(G.OUT_PATH, encoding='utf-8') as fh:
        assert fh.read() == G.generate(), 'run python3 ingest/build/gen_types.py'


def test_fixture_db_matches_schema():
    path = os.path.join(_ROOT, 'app', 'src', 'corpus', 'fixture.db')
    con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    assert con.execute("SELECT value FROM corpus_meta WHERE key = 'schema_version'").fetchone()[0] == '1'
    n = con.execute('SELECT count(*) FROM recipes').fetchone()[0]
    assert 0 < n <= 300
    fresh = sqlite3.connect(':memory:')
    with open(B.SCHEMA_PATH, encoding='utf-8') as fh:
        fresh.executescript(fh.read())
    q = "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_stat%' ORDER BY name"
    assert con.execute(q).fetchall() == fresh.execute(q).fetchall()


# ---- course ----------------------------------------------------------------------------------

def test_course_gold_bar():
    rows = score_course.load(score_course.GOLD)
    hits, misses, _ = score_course.score(rows)
    assert len(rows) == 100
    assert hits / len(rows) >= score_course.BAR, misses


@pytest.mark.parametrize('title, want', [
    ('Jerk Sauce (For Any Meat)', 'sauce_condiment'),
    ('Mint Chocolate Chip Ice Cream Sandwiches', 'dessert'),
    ('Chicken Noodle Soup', 'main'),
    ('Greek Salad Dressing', 'sauce_condiment'),
    ('Zucchini Bread', 'baking'),
])
def test_course_head_phrase(title, want):
    raw = _raw(title=title, ingredients=['1 cup water'])
    assert tag_course(raw)['course'] == want
