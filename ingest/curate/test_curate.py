"""Tests for the curation (brief S8): junk detectors on the exact inputs that motivated them, the
Food.com id join, the score's terms, the dedupe, the quota selection, the owner-grade scorer, and
an end-to-end scan -> rank -> build from a selection."""
import gzip
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
from ingest.build import curate as BC  # noqa: E402
from ingest.build import sample as S  # noqa: E402
from ingest.curate import dedupe as D  # noqa: E402
from ingest.curate import features as F  # noqa: E402
from ingest.curate import rank as R  # noqa: E402
from ingest.curate import scan as SC  # noqa: E402
from ingest.curate import score as Q  # noqa: E402
from ingest.curate import select as SEL  # noqa: E402
from ingest.curate.eval import draw as EV  # noqa: E402
from ingest.fetch import fetch_foodcom_ratings as FR  # noqa: E402


def _raw(**kw):
    r = {'id': 'recipenlg:1', 'source': 'recipenlg', 'title': 'Tomato soup',
         'source_url': 'http://www.cookbooks.com/Recipe-Details.aspx?id=1',
         'ingredients': ['2 tbsp olive oil', '1 onion, chopped', '800g canned tomatoes'],
         'steps': ['Soften the onion in the oil in a pan.', 'Add the tomatoes and simmer 20 minutes.']}
    r.update(kw)
    return r


# ---- junk detectors ------------------------------------------------------------------------

@pytest.mark.parametrize('step,flag', [
    ('For a photo visit http://the-best-recipes.blogspot.com/.', 'ad_or_link'),
    ('Read more at: www.foodnetwork.com/recipes/x', 'ad_or_link'),
    ('Click here for more recipes.', 'ad_or_link'),
    ('Serve with the dip (see above).', 'see_above'),
    ('Add 2 cups chicken stock (page 160).', 'see_above'),
    ('Top with the sauce (see recipe).', 'see_above'),
])
def test_hard_junk_flags(step, flag):
    assert flag in F.junk_flags(_raw(steps=['Simmer the soup 20 minutes.', step]), set())


@pytest.mark.parametrize('step', [
    'Top with the sauce (see recipe below).',
    'I used jam from ocado.com.',
    'Simmer 20 minutes, then season.',
])
def test_benign_text_is_not_junk(step):
    assert F.junk_flags(_raw(steps=['Soften the onion.', step]), set()) == []


@pytest.mark.parametrize('title,flagged', [
    ('Chicken', True), ('Sweet Potatoes', True), ('Pork Roast', True),
    ('Fruit Salad', False), ('Spanish Rice', False), ('Guacamole', False), ('Chicken Kiev', False),
])
def test_title_is_ingredient(title, flagged):
    assert F.title_is_ingredient(title) is flagged


def test_missing_core_ingredient_exact_inputs():
    # "Egg Drop Soup" whose lines never mention egg: the case the detector exists for
    lines = ['4 cups chicken stock', '1 tbsp cornstarch', '2 green onions']
    assert F.missing_core('Egg Drop Soup', lines, {'chicken_stock', 'cornstarch', 'green_onion'}) == ['egg']
    # dish words and products named after an ingredient require nothing
    assert F.missing_core('Chicken Fried Steak', ['1 lb cube steak', '1 cup flour'], {'beef_steak'}) == []
    assert F.missing_core('Caramel Apple Dip', ['8 oz cream cheese', '1 cup brown sugar'], {'cream_cheese'}) == []
    assert F.missing_core('Potato Salad', ['2 lb yukon gold potatoes', '1 cup mayonnaise'],
                          {'yukon_gold_potatoes', 'mayonnaise'}) == []
    # a 5-letter stem: "apple" meets "applesauce", "chilli" meets "chili"
    assert F.missing_core('Apple Muffins', ['1 cup applesauce', '2 cups flour'], {'applesauce'}) == []


def test_missing_core_halves_the_score():
    f = _features()
    g = dict(f, junk=['missing_core_ingredient'])
    assert Q.quality(g) == pytest.approx(Q.quality(f) * Q.MISSING_CORE_FACTOR, abs=0.001)


def test_bad_title():
    assert 'bad_title' in F.junk_flags(_raw(title='x' * 121), set())
    assert 'bad_title' in F.junk_flags(_raw(title='#1'), set())


# ---- ids, domains, ratings -------------------------------------------------------------------

def test_foodcom_id_and_domain():
    r = _raw(source_url='http://www.food.com/recipe/haluski-407129')
    assert F.foodcom_id(r) == 407129 and F.domain(r) == 'food.com'
    assert F.foodcom_id(_raw(id='foodcom:000038', source='foodcom')) == 38
    assert F.foodcom_id(_raw()) is None
    assert F.domain(_raw(source='bbcgoodfood')) == 'bbcgoodfood'


def test_ratings_aggregate_zero_is_a_review_without_stars():
    agg = FR.aggregate([(38, 5.0), (38, 0.0), (38, 4.0), (40, 0.0)])
    assert agg[38] == (3, 2, 4.5)
    assert agg[40] == (1, 0, None)


def test_features_join_rating_by_foodcom_id():
    r = _raw(source_url='http://www.food.com/recipe/haluski-407129')
    derived = B.derive(r, B.load_model())
    f = F.features(r, derived, {407129: (7, 6, 4.5)})
    assert (f['rating'], f['rating_count'], f['rating_source']) == (4.5, 6, 'foodcom_interactions')
    f = F.features(r, derived, {407129: (2, 0, None)})
    assert f['rating'] is None and f['rating_source'] is None


# ---- score -----------------------------------------------------------------------------------

def _features(**kw):
    f = {'domain': 'epicurious.com', 'resolved': 1.0, 'qty': 1.0, 'step_chars': 600, 'max_step': 300,
         'n_lines': 8, 'time_source': 'estimated', 'rating': None, 'rating_count': None, 'image': False,
         'servings': True, 'junk': []}
    f.update(kw)
    return f


def test_score_bounds_and_terms():
    lo = _features(domain='cookbooks.com', resolved=0.4, qty=0.0, step_chars=10, max_step=10, n_lines=1,
                   time_source=None, rating=1.0, rating_count=50, servings=False)
    hi = _features(domain='bbcgoodfood', time_source='source', rating=5.0, rating_count=50, image=True)
    assert 0.0 <= Q.quality(lo) < Q.quality(_features()) < Q.quality(hi, copies=30) <= 1.0
    assert Q.quality(hi, copies=30) >= 0.99


def test_rating_is_bayesian_and_unrated_is_neutral():
    assert Q.rating_term(None, None) == Q.rating_term(Q.RATING_PRIOR, 100)
    assert Q.rating_term(5.0, 1) < Q.rating_term(5.0, 20)       # more evidence, closer to 5
    assert Q.rating_term(3.0, 1) > Q.rating_term(3.0, 20)
    assert Q.rating_term(2.0, 100) == 0.0


def test_domain_prior_tiers():
    assert Q.domain_prior('bbcgoodfood') == 1.0
    assert Q.domain_prior('recipes.foodnetwork.com') == 1.0      # a subdomain of a listed site
    assert Q.domain_prior('cookbooks.com') < Q.domain_prior('food.com') < Q.domain_prior('allrecipes.com')
    assert Q.domain_prior('someblog.example') == Q.DEFAULT_PRIOR


def test_content_score_leaves_out_rating_and_popularity():
    a = _features(rating=5.0, rating_count=100)
    b = _features(rating=1.0, rating_count=100)
    assert Q.quality(a, without=('rating', 'pop')) == Q.quality(b, without=('rating', 'pop'))
    assert Q.quality(a) > Q.quality(b)


# ---- dedupe ----------------------------------------------------------------------------------

def test_norm_title_drops_filler():
    assert F.norm_title('Easy Banana Bread') == F.norm_title('The BEST banana breads recipe')


def test_dedupe_jaccard_threshold_and_leader():
    s5 = ('a', 'b', 'c', 'd', 'e')
    recs = [('k1', 'banana bread', s5),
            ('k2', 'banana bread', s5[:4]),                 # 4/5 = 0.8: same dish
            ('k3', 'banana bread', ('a', 'b', 'x', 'y')),   # 2/7: a different recipe
            ('k4', 'zucchini bread', s5),                   # another title never clusters
            ('k5', '', s5), ('k6', '', s5)]                 # empty titles never cluster
    base = {'k1': 0.5, 'k2': 0.9, 'k3': 0.7, 'k4': 0.1, 'k5': 0.1, 'k6': 0.1}
    cl = D.cluster(recs, base)
    assert cl['k1'][0] == cl['k2'][0] and cl['k2'][1:] == (2, True) and cl['k1'][2] is False
    assert cl['k3'][0] != cl['k1'][0] and cl['k3'][1] == 1
    assert cl['k4'][1] == 1 and cl['k5'][0] != cl['k6'][0]


def test_dedupe_is_order_independent():
    recs = [(f'k{i}', 'pie', ('a', 'b', 'c', 'd', str(i % 3))) for i in range(9)]
    base = {k: (int(k[1:]) % 4) / 10 for k, _, _ in recs}
    assert D.cluster(recs, base) == D.cluster(list(reversed(recs)), base)


# ---- selection -------------------------------------------------------------------------------

def _pool(main_every=4):
    pool = []
    for i in range(200):
        pool.append({'key': f'r{i:03d}', 'source': 'recipenlg', 'score': 1 - i / 1000,
                     'cuisine': 'american' if i < 150 else ('thai' if i < 190 else None),
                     'course': 'main' if i % main_every == 0 else 'dessert',
                     'veg': 'ok' if i % 2 else 'no', 'nrm': 'ok' if i % 3 else 'no'})
    pool.append({'key': 'e1', 'source': 'bbcgoodfood', 'score': 0.01, 'cuisine': 'british_irish',
                 'course': 'side', 'veg': 'ok', 'nrm': 'ok'})
    return pool


def test_select_editorial_floors_and_mix():
    keys, why = SEL.select(_pool(), target=60, floor=10)
    rows = {r['key']: r for r in _pool()}
    got = [rows[k] for k in keys]
    assert len(keys) == 60 and len(set(keys)) == 60
    assert why['e1'] == 'editorial'
    assert sum(1 for r in got if r['cuisine'] == 'thai') >= 10
    assert sum(1 for r in got if r['cuisine'] == 'british_irish') >= 1
    mix = SEL.mix_shares(got)
    assert mix['main'] >= 0.45 and mix['vegetarian'] >= 0.25 and mix['no_red_meat'] >= 0.5
    assert SEL.select(list(reversed(_pool())), target=60, floor=10)[0] == keys


def test_select_fills_the_target_when_a_constraint_cannot_be_met():
    # 20 mains in a 201-recipe pool cannot make 45% of 60: the target is still reached
    keys, why = SEL.select(_pool(main_every=10), target=60, floor=10)
    assert len(keys) == 60 and 'score_unguarded' in why.values()
    assert sum(1 for r in _pool(main_every=10) if r['key'] in set(keys) and r['course'] == 'main') == 20


def test_select_never_exceeds_the_hard_cap():
    with pytest.raises(AssertionError):
        SEL.select(_pool(), target=SEL.HARD_CAP + 1)


# ---- owner-grade scorer ------------------------------------------------------------------------

def test_read_grades_and_bar():
    md = '## 1. A\n\ngrade: 2\n\n## 2. B\n\ngrade: 0\n\n## 3. C\n\ngrade: 1\n\n## 4. D\n\ngrade: _\n'
    g = EV.read_grades(md)
    assert g == {1: 2, 2: 0, 3: 1}
    key = [{'n': 1, 'band': 'top'}, {'n': 2, 'band': 'bottom'}, {'n': 3, 'band': 'middle'}, {'n': 4, 'band': 'top'}]
    v = EV.score(g, key)
    assert v['verdict'] == 'PASS' and v['graded'] == 3
    assert EV.score({1: 1, 2: 1, 3: 1}, key)['verdict'] == 'FAIL'


def test_bands_are_disjoint():
    b = EV.bands(1000)
    assert b['top'] == (0, 50) and b['bottom'] == (950, 1000) and b['middle'] == (475, 525)


# ---- end to end: scan -> rank -> build from the selection ----------------------------------------

def _write_raw(root):
    rows = {
        'recipenlg': [
            _raw(id='recipenlg:0', title='Banana bread', source_url='http://www.food.com/recipe/banana-bread-12',
                 ingredients=['3 bananas', '2 cups flour', '1 cup sugar', '1 egg', '1 tsp baking soda'],
                 steps=['Heat the oven to 350F.', 'Mash the bananas, mix in the rest and bake 60 minutes.']),
            _raw(id='recipenlg:1', title='Easy Banana Bread',
                 ingredients=['3 ripe bananas', '2 cups flour', '1 cup sugar', '1 egg', '1 tsp baking soda'],
                 steps=['Mix everything and bake 1 hour at 350F in a loaf pan.']),
            _raw(id='recipenlg:2', title='Chicken',
                 ingredients=['1 chicken', 'salt'], steps=['Roast the chicken 90 minutes in a hot oven.']),
            _raw(id='recipenlg:3', title='Beef stew', steps=[]),
            _raw(id='recipenlg:4', title='Garlic bread', source_url='http://www.epicurious.com/recipes/food/x',
                 ingredients=['1 baguette', '50g butter', '2 garlic cloves'],
                 steps=['Mix the butter and garlic (see recipe on page 12), spread and bake 10 minutes.']),
            _raw(id='recipenlg:5', title='Pad thai', source_url='http://www.epicurious.com/recipes/food/y',
                 ingredients=['200g rice noodles', '2 tbsp fish sauce', '1 tbsp tamarind paste', '2 eggs',
                              '100g bean sprouts', '50g peanuts'],
                 steps=['Soak the noodles.', 'Stir-fry the noodles with the sauce, eggs and sprouts 5 minutes; '
                        'top with peanuts.']),
        ],
        'themealdb': [
            _raw(id='themealdb:1', source='themealdb', title='Chicken curry', source_url=None,
                 ingredients=['500g chicken thighs', '1 onion', '2 tbsp curry powder', '400ml coconut milk'],
                 steps=['Brown the chicken in a large pan.', 'Add the onion and curry powder, then the coconut '
                        'milk; simmer 25 minutes.'], cuisine_label='Indian'),
        ],
    }
    for src, rs in rows.items():
        d = root / src
        d.mkdir(parents=True)
        with open(d / 'recipes.jsonl', 'w', encoding='utf-8') as fh:
            for r in rs:
                fh.write(json.dumps(r) + '\n')
            if src == 'recipenlg':
                fh.write('{not json\n')
    ratings = root / 'ratings.tsv'
    FR.write_tsv({12: (4, 4, 4.75)}, str(ratings))
    return str(ratings)


@pytest.fixture(scope='module')
def e2e(tmp_path_factory):
    root = tmp_path_factory.mktemp('raw')
    ratings = _write_raw(root)
    scan_dir = str(tmp_path_factory.mktemp('scan'))
    assert SC.run(scan_dir, str(root), ratings, workers=1, budget=300, shard=4, log=lambda *a, **k: None) == 0
    out = str(tmp_path_factory.mktemp('cur'))
    st = R.run(scan_dir, out, target=3, report=None)
    db = str(tmp_path_factory.mktemp('db') / 'corpus.db')
    assert B.build(db, raw_root=str(root), select=os.path.join(out, 'selection.tsv'), fresh=True,
                   log=lambda *a: None)
    return root, scan_dir, out, st, db


def test_e2e_scan_counts_every_line(e2e):
    root, scan_dir, out, st, db = e2e
    metas = list(SC.iter_meta(scan_dir))
    assert sum(m['lines'] for m in metas) == 8
    assert sum(m['written'] for m in metas) == 6
    drops = {k: v[0] for m in metas for k, v in m['drops'].items()}
    assert drops == {'bad_json': 1, 'no_steps': 1}
    rec = {r['key']: r for r in SC.iter_records(scan_dir)}
    assert rec['recipenlg:0']['rating_source'] == 'foodcom_interactions'
    assert 'title_is_ingredient' in rec['recipenlg:2']['junk']
    assert 'see_above' in rec['recipenlg:4']['junk']


def test_e2e_selection_and_drops_account_for_every_line(e2e):
    root, scan_dir, out, st, db = e2e
    sel = S.load_selection(os.path.join(out, 'selection.tsv'))
    keys = {row['key'] for rows in sel.values() for row in rows.values()}
    assert 'themealdb:1' in keys                                   # editorial, always kept
    assert len(keys) == 3
    drops = json.load(open(os.path.join(out, 'drops.json')))
    flat = {(s, r): c for s, d in drops.items() for r, (c, _) in d.items()}
    assert flat[('recipenlg', 'curate_duplicate')] == 1             # the two banana breads
    assert flat[('recipenlg', 'curate_junk_title_is_ingredient')] == 1
    assert flat[('recipenlg', 'curate_junk_see_above')] == 1
    assert sum(flat.values()) + len(keys) == 8
    assert all(r in BC.DROP_REASONS for _, r in flat)
    with gzip.open(os.path.join(out, 'pool.tsv.gz'), 'rt') as fh:
        assert sum(1 for _ in fh) - 1 == st['pool'] == 3


def test_e2e_build_stores_selection_quality_rating_and_drops(e2e):
    root, scan_dir, out, st, db = e2e
    sel = S.load_selection(os.path.join(out, 'selection.tsv'))
    want = {row['key']: row for rows in sel.values() for row in rows.values()}
    con = sqlite3.connect(db)
    got = {k: (q, r, n) for k, q, r, n in con.execute('SELECT key, quality, rating, rating_count FROM recipes')}
    assert set(got) == set(want)
    for k, (q, r, n) in got.items():
        assert q == want[k]['quality']
    if 'recipenlg:0' in got:
        assert got['recipenlg:0'][1:] == (4.75, 4)
    total = con.execute('SELECT sum(count) FROM build_drops').fetchone()[0]
    assert total + len(got) == 8
    # a rerun of a finished build does not add the curation drops twice
    assert B.build(db, raw_root=str(root), select=os.path.join(out, 'selection.tsv'), log=lambda *a: None)
    assert con.execute('SELECT sum(count) FROM build_drops').fetchone()[0] == total
    con.close()


def test_select_lines_streams_only_the_chosen(tmp_path):
    p = tmp_path / 'r.jsonl'
    p.write_text(''.join(f'{i}\n' for i in range(10)))
    assert [n for n, _ in S.select_lines(str(p), 10, {1, 4, 7})] == [1, 4, 7]
    assert [n for n, _ in S.select_lines(str(p), 10, {1, 4, 7}, start=2)] == [4, 7]
    assert [n for n, _ in S.select_lines(str(p), 5, {1, 4, 7})] == [1, 4]


def test_scan_offsets_match_line_starts(tmp_path):
    p = tmp_path / 'r.jsonl'
    lines = [f'line {i} ' + 'x' * i + '\n' for i in range(11)]
    p.write_text(''.join(lines))
    m = SC.count_with_offsets(str(p), shard=4)
    assert m['lines'] == 11 and len(m['offsets']) == 3
    with open(p, 'rb') as fh:
        for i, off in enumerate(m['offsets']):
            fh.seek(off)
            assert fh.readline().decode() == lines[i * 4]
