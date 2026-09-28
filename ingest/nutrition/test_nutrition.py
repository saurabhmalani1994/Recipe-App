"""Tests for the nutrition slice (S14). Run: python3 -m pytest ingest/nutrition -q"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from ingest.nutrition import build_mapping as BM  # noqa: E402
from ingest.nutrition import coverage as COV  # noqa: E402
from ingest.nutrition import estimate as E  # noqa: E402
from ingest.nutrition import gold as G  # noqa: E402


# ---- gram conversion --------------------------------------------------------------------------

def test_mass_unit_is_direct():
    assert E.item_grams({'qty': 2, 'unit': 'kg'}, {}) == 2000
    assert E.item_grams({'qty': 3, 'unit': 'oz'}, {}) == 3 * 28.3495


def test_volume_needs_density():
    assert E.item_grams({'qty': 1, 'unit': 'cup'}, {}) is None  # no density, no category fallback
    got = E.item_grams({'qty': 1, 'unit': 'cup'}, {'density_g_per_ml': 0.5})
    assert abs(got - 118.294) < 0.01


def test_volume_falls_back_to_category_density():
    # a spice with no density_g_per_ml still converts, via the category fallback
    got = E.item_grams({'qty': 1, 'unit': 'tsp'}, {'category': 'spice'})
    assert got is not None and 1.5 < got < 3.5


def test_count_unit_uses_each_g():
    assert E.item_grams({'qty': 3, 'unit': 'piece'}, {'each_g': 50}) == 150
    assert E.item_grams({'qty': 2, 'unit': 'clove'}, {}) is not None  # unit fallback table
    assert E.item_grams({'qty': 2, 'unit': 'piece'}, {}) is None  # no each_g, no fallback for piece


def test_pkg_size_wins_over_each_g():
    it = {'qty': 1, 'unit': 'can', 'pkg': {'qty': 14, 'unit': 'oz'}}
    assert abs(E.item_grams(it, {}) - 14 * 28.3495) < 0.01


def test_missing_qty_is_unconvertible():
    assert E.item_grams({'qty': None, 'unit': 'g'}, {'each_g': 50}) is None


# ---- fill_recipe --------------------------------------------------------------------------------

ING = {
    'flour': {'category': 'grain', 'density_g_per_ml': 0.53, 'is_staple': False},
    'egg': {'category': 'egg', 'each_g': 50, 'is_staple': False},
    'salt': {'category': 'salt', 'density_g_per_ml': 1.2, 'is_staple': True},
    'mystery': {'category': 'vegetable', 'is_staple': False},  # never in slug_nutrients
}
NUTR = {
    'flour': {'kcal': 364.0, 'protein_g': 10.0, 'fat_g': 1.0, 'carbs_g': 76.0, 'fiber_g': 2.7,
             'sugar_g': 0.3, 'sodium_mg': 2.0},
    'egg': {'kcal': 143.0, 'protein_g': 12.6, 'fat_g': 9.5, 'carbs_g': 0.7, 'fiber_g': 0.0,
           'sugar_g': 0.4, 'sodium_mg': 142.0},
    'salt': {'kcal': 0.0, 'protein_g': 0.0, 'fat_g': 0.0, 'carbs_g': 0.0, 'fiber_g': 0.0,
            'sugar_g': 0.0, 'sodium_mg': 38758.0},
}


def _items(*rows):
    return [dict({'line': i, 'optional': False}, **r) for i, r in enumerate(rows)]


def test_fully_covered_recipe_fills():
    items = _items({'_slug': 'flour', 'qty': 200, 'unit': 'g'}, {'_slug': 'egg', 'qty': 2, 'unit': 'piece'})
    values, coverage = E.fill_recipe(items, servings=2, ing=ING, slug_nutrients=NUTR)
    assert coverage == 1.0
    assert values['kcal'] is not None and values['kcal'] > 0
    assert all(v is not None for v in values.values())


def test_no_servings_means_null_even_if_covered():
    items = _items({'_slug': 'flour', 'qty': 200, 'unit': 'g'})
    values, coverage = E.fill_recipe(items, servings=None, ing=ING, slug_nutrients=NUTR)
    assert values == {c: None for c in E.NUTRIENT_COLUMNS}
    assert coverage == 1.0  # still reported, just not enough on its own


def test_low_coverage_recipe_is_null_not_zero():
    # 2 core lines, only one priced (mystery has no USDA nutrients) -> 50% < 80% bar
    items = _items({'_slug': 'flour', 'qty': 200, 'unit': 'g'}, {'_slug': 'mystery', 'qty': 100, 'unit': 'g'})
    values, coverage = E.fill_recipe(items, servings=2, ing=ING, slug_nutrients=NUTR)
    assert coverage == 0.5
    assert values == {c: None for c in E.NUTRIENT_COLUMNS}


def test_staple_lines_dont_count_toward_the_coverage_denominator():
    # salt is a staple: it must not force the denominator up, and its sodium still adds in
    items = _items({'_slug': 'flour', 'qty': 200, 'unit': 'g'}, {'_slug': 'salt', 'qty': 1, 'unit': 'tsp'})
    values, coverage = E.fill_recipe(items, servings=2, ing=ING, slug_nutrients=NUTR)
    assert coverage == 1.0
    assert values['sodium_mg'] > 100  # the staple's sodium is still summed, just not gate-checked


def test_optional_lines_dont_count_toward_the_coverage_denominator():
    items = _items({'_slug': 'mystery', 'qty': 100, 'unit': 'g', 'optional': True},
                   {'_slug': 'flour', 'qty': 200, 'unit': 'g'})
    values, coverage = E.fill_recipe(items, servings=2, ing=ING, slug_nutrients=NUTR)
    assert coverage == 1.0
    assert values['kcal'] is not None


def test_no_core_lines_at_all_is_not_a_false_full_coverage_null():
    # every line is a staple: nothing to judge coverage against, but grams were still priced
    items = _items({'_slug': 'salt', 'qty': 1, 'unit': 'tsp'})
    values, coverage = E.fill_recipe(items, servings=4, ing=ING, slug_nutrients=NUTR)
    assert coverage == 1.0
    assert values['sodium_mg'] is not None


def test_no_items_at_all_is_null():
    values, coverage = E.fill_recipe([], servings=4, ing=ING, slug_nutrients=NUTR)
    assert coverage is None
    assert values == {c: None for c in E.NUTRIENT_COLUMNS}


# ---- build_mapping.score ------------------------------------------------------------------------

def test_score_requires_full_recall_for_a_short_query():
    # one shared word out of two is not enough for a 2-word query
    q = BM._tokset('water chestnut')
    d = BM._tokset('Cherries, sour, canned, water pack, drained')
    assert BM.score(q, d, 'sr_legacy_food') == 0.0


def test_score_accepts_a_fully_matched_short_query():
    q = BM._tokset('cayenne')
    d = BM._tokset('Spices, pepper, red or cayenne')
    assert BM.score(q, d, 'sr_legacy_food') > 0.5


def test_score_rejects_a_meat_description_for_a_plant_slug():
    q = BM._tokset('curry leaves')
    d = BM._tokset("Pork, fresh, variety meats and by-products, leaf fat, raw")
    assert BM.score(q, d, 'sr_legacy_food', category='herb') == 0.0


def test_score_allows_a_meat_description_when_the_query_names_meat():
    q = BM._tokset('chicken broth')
    d = BM._tokset('Soup, chicken broth or bouillon, dry')
    assert BM.score(q, d, 'sr_legacy_food', category='stock') > 0.0


# ---- the shipped mapping artifacts ---------------------------------------------------------------

def test_mapping_and_nutrients_files_agree():
    mapping = _load_json(BM.MAPPING_PATH)
    nutrients = _load_json(BM.NUTRIENTS_PATH)
    assert set(mapping) == set(nutrients)
    assert len(mapping) > 900  # ~1080 at the time of writing; a regression would be obvious


def test_common_staples_are_mapped_with_kcal():
    nutrients = _load_json(BM.NUTRIENTS_PATH)
    for slug in ('salt', 'sugar', 'olive_oil', 'egg', 'all_purpose_flour', 'chicken_breast', 'butter'):
        assert slug in nutrients, slug
        assert 'kcal' in nutrients[slug], slug


def _load_json(path):
    import json
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


# ---- the gold check (deliverable 4) -------------------------------------------------------------

def test_gold_bar():
    rows, ok = G.check(log=lambda *a, **k: None)
    passed = sum(r['ok'] for r in rows)
    assert len(rows) == 15
    assert ok, f'{passed}/15 within +/-25%, need {G.BAR}'


# ---- coverage.py ----------------------------------------------------------------------------------

def test_weighted_coverage(tmp_path):
    import sqlite3
    db = tmp_path / 'mini.db'
    con = sqlite3.connect(db)
    con.execute('CREATE TABLE ingredients (slug TEXT, recipe_count INTEGER)')
    con.executemany('INSERT INTO ingredients VALUES (?,?)',
                    [('flour', 100), ('mystery_unmapped_slug', 20)])
    con.commit()
    con.close()
    covered, total, top_unmapped = COV.weighted_coverage(str(db), mapping={'flour': {}})
    assert covered == 100 and total == 120
    assert top_unmapped == [(20, 'mystery_unmapped_slug')]
