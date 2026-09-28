"""Tests for the servings estimator (brief S15, ingest/build/servings.py), each with the exact text
that motivated its rule."""
import os
import re
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import build_corpus as B  # noqa: E402
from ingest.build import servings as SV  # noqa: E402
from ingest.tag.tagger import parse_items  # noqa: E402
from ingest.taxonomy import taxonomy as T  # noqa: E402

ING = T.load()


def _raw(**kw):
    r = {'id': 'alpha:1', 'source': 'alpha', 'title': 'Stew',
         'ingredients': ['1 kg beef chuck', '2 carrots', '1 onion', '500ml beef stock'],
         'steps': ['Brown the beef.', 'Add everything else and simmer 2 hours.']}
    r.update(kw)
    return r


def _est(raw, course='main', use_source=True):
    items = parse_items(raw)
    for it in items:
        it['_slug'] = it.get('slug') if it.get('slug') in ING else None
    return SV.estimate(raw, items, course, ING, use_source=use_source)


def _texts(*steps, title='X'):
    return [('title', title)] + [('step', s) for s in steps]


# ---- tiers ---------------------------------------------------------------------------------------

def test_source_head_count_wins():
    got = _est(_raw(yield_text='Serves 4', steps=['Divide between 6 plates.']))
    assert got['servings'] == 4 and got['servings_source'] == 'source'


def test_source_servings_field():
    got = _est(_raw(servings=6))
    assert got == {'servings': 6, 'servings_source': 'source', 'yield_count': None}


def test_use_source_false_hides_the_yield():
    got = _est(_raw(yield_text='Serves 4'), use_source=False)
    assert got['servings_source'] in ('energy', 'mass')


def test_text_head_count_in_steps_is_used_as_written():
    got = _est(_raw(steps=['Brown the beef.', 'Simmer 2 hours. Serves 3.']))
    assert got['servings'] == 3 and got['servings_source'] == 'text'


def test_energy_then_mass():
    got = _est(_raw())
    assert got['servings_source'] == 'energy' and 1 <= got['servings'] <= SV.MAX_SERVINGS
    # no quantities at all (foodcom lines): no kcal, so the mass fallback at TYPICAL_LINE_G a line
    got = _est(_raw(ingredients=['beef chuck', 'carrots', 'onion', 'beef stock']))
    assert got['servings_source'] == 'mass' and got['servings'] >= 1


def test_nothing_resolved_is_null():
    got = _est(_raw(ingredients=['2 zorblax', '1 quibble']))
    assert got == {'servings': None, 'servings_source': None, 'yield_count': None}


def test_deterministic():
    raw = _raw(steps=['Cut into 16 squares.'])
    assert _est(raw, 'dessert') == _est(raw, 'dessert')


# ---- head counts ---------------------------------------------------------------------------------

@pytest.mark.parametrize('step, course, want', [
    ('Serves 4.', 'main', 4),
    ('This dish feeds six.', 'main', 6),
    ('Enough for 8 people.', 'side', 8),
    ('Makes 6 servings.', 'main', 6),
    ('To serve, divide the purée between two plates.', 'side', 2),
    ('Divide between 4 warm bowls and top with the herbs.', 'main', 4),
    # mixing bowls in a cake recipe, not servings (bbcgoodfood:tunis-cake)
    ('Divide between two bowls, and colour one pink.', 'dessert', None),
    # "half the soup into two bowls" is half the recipe (bbcgoodfood:leek-broccoli-soup-...)
    ('Ladle half the soup into two bowls and serve.', 'main', None),
    # a dough split, not a portion count (bbcgoodfood:spiced-indian-crackers-mathri)
    ('Knead the rested dough for 1 min, then divide into 15 portions.', 'baking', None),
    ('Bake for 20 minutes.', 'main', None),
])
def test_head_count(step, course, want):
    assert SV.head_count(_texts(step), course) == want


# ---- counted yields ------------------------------------------------------------------------------

@pytest.mark.parametrize('step, course, want', [
    ('Makes 24 cookies.', 'dessert', (12, '24 cookies')),
    ('You should make about 2 dozen small biscuits.', 'dessert', (12, '24 biscuits')),
    ('Fill 12 muffin cases two-thirds full.', 'baking', (12, '12 muffins')),
    ('Cut into 16 squares.', 'dessert', (16, '16 squares')),
    ('Leave to cool, then cut into nine or 12 pieces.', 'breakfast', (9, '9 pieces')),
    ('Shape into 20 meatballs.', 'main', (5, '20 meatballs')),
    # a dough split into two for a pie's top and base (bbcgoodfood:bramley-blackberry-pie)
    ('Take the dough from the fridge and divide into 2 pieces.', 'dessert', None),
    ('Split the dough into two balls.', 'dessert', None),
    # "cut the chicken into 8 pieces" in a main is the chicken, not the yield
    ('Cut the chicken into 8 pieces.', 'main', None),
    # "cut each half into 2 wedges" is a step
    ('Cut each half into 4 wedges.', 'snack', None),
])
def test_count_yield(step, course, want):
    got = SV.count_yield(_texts(step), course)
    assert (got if got is None else (round(got[0], 2), got[1])) == want


@pytest.mark.parametrize('text, course, want', [
    ('Makes 16', 'dessert', ('count', 16, '16')),
    ('84 cookies', 'dessert', ('count', 42, '84 cookies')),
    ('1 loaf', 'baking', ('count', 10, '1 loaf')),
    ('3 dozen', 'dessert', ('count', 36, '36')),
    ('about 2 cups', 'sauce_condiment', ('volume', 2 * 236.6 / 60, '2 cups')),
    ('', 'main', None),
])
def test_yield_string(text, course, want):
    got = SV.yield_string(text, course)
    assert (got if got is None else (got[0], round(got[1], 3), got[2])) == \
        (want if want is None else (want[0], round(want[1], 3), want[2]))


def test_yield_string_becomes_text_and_label():
    got = _est(_raw(title='Chocolate chip cookies', yield_text='84 cookies'), 'dessert')
    assert got['servings_source'] == 'text' and got['yield_count'] == '84 cookies'


# ---- pans and portion items ----------------------------------------------------------------------

@pytest.mark.parametrize('line, course, want', [
    ('Grease a 9x13 inch baking dish.', 'main', 117 / 13.2),
    ('Grease a 13 x 9-inch pan.', 'dessert', 117 / 6.2),
    ('Brush a 20 x 20cm square baking tin with butter.', 'breakfast', (20 / 2.54) ** 2 / 13.2),
    ('Grease an 8-inch square baking pan.', 'dessert', 64 / 6.2),
    ('Line a 23cm round cake tin.', 'dessert', 3.14159 * (23 / 2.54 / 2) ** 2 / 6.2),
    ('Butter a 900g loaf tin.', 'baking', 10),
    ('Bake 20 minutes.', 'main', None),
])
def test_pan(line, course, want):
    got = SV.pan_servings(_texts(line), course)
    assert (got if got is None else round(got[0], 1)) == (want if want is None else round(want, 1))


@pytest.mark.parametrize('lines, course, want', [
    (['4 salmon fillets', '200g rice'], 'main', 4),
    (['8 skinless boneless chicken thighs'], 'main', 4),
    (['6 large wraps', '4 burger buns'], 'main', 6),
    # anchovy fillets are a seasoning (bbcgoodfood:roast-leg-lamb-garlic-watercress-butter)
    (['4 anchovy fillets in oil'], 'main', None),
    (['12 meat-free cocktail sausages'], 'main', None),
    (['4 salmon fillets'], 'dessert', None),
])
def test_portion_items(lines, course, want):
    assert SV.portion_items({'ingredients': lines}, course) == want


# ---- mass, shrink, schema ------------------------------------------------------------------------

def test_lost_unit_is_not_weighed():
    # foodcom:000109 "250 shallots" is 250 g whose unit the source lost; 250 shallots is 7.5 kg
    items = parse_items({'ingredients': ['250 shallots', '1 small potato']})
    for it in items:
        it['_slug'] = it.get('slug')
    assert SV.total_grams(items, ING) < SV.MAX_PIECE_G


def test_shrink_is_continuous_and_banded():
    p, r = SV.COURSE_PRIOR['main'], SV.ZONE['energy']
    assert SV.shrink(p, 'main', 'energy') == p
    assert SV.shrink(p * r, 'main', 'energy') == pytest.approx(p)
    assert SV.shrink(p * r * 2, 'main', 'energy') == pytest.approx(p * 2)
    assert SV.shrink(p / r / 2, 'main', 'energy') == pytest.approx(p / 2)
    assert SV.shrink(7, 'main', 'head') == 7


def test_schema_servings_source_list_is_the_estimators():
    with open(B.SCHEMA_PATH, encoding='utf-8') as fh:
        sql = fh.read()
    m = re.search(r"servings_source TEXT CHECK \(servings_source IN \(([^)]*)\)\)", sql)
    assert tuple(v.strip().strip("'") for v in m.group(1).split(',')) == SV.SOURCES
    assert set(SV.KCAL_PER_SERVING) == set(SV.GRAMS_PER_SERVING) == set(SV.COURSE_PRIOR) \
        == set(SV.PAN_SQIN_PER_SERVING)
    assert set(SV.ZONE) == set(SV.KINDS) and max(SV.ZONE.values()) <= max(SV.ZONE_GRID)
