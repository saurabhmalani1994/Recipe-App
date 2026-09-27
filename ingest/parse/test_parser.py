"""Tests for the ingredient-line parser. Run: python3 -m pytest ingest/parse -q"""
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from ingest.parse.parser import parse_line  # noqa: E402
from ingest.parse import score as S  # noqa: E402
from ingest.parse import coverage as C  # noqa: E402
from ingest.taxonomy import taxonomy as T  # noqa: E402

ING = T.load()


def one(line):
    items = parse_line(line)
    assert len(items) == 1, items
    return items[0]


def flags(slug):
    return T.flags_of(ING, slug)


# ---------- D15 / R7 traps: vegetarian is about the protein source ----------

def test_chicken_stock_gives_explicit_meat():
    it = one('2 cups chicken stock')
    assert (it['qty'], it['unit'], it['slug']) == (2, 'cup', 'chicken_stock')
    assert 'explicit_meat' in flags(it['slug'])


def test_oyster_sauce_is_not_explicit_meat():
    it = one('1 tbsp oyster sauce')
    assert (it['qty'], it['unit'], it['slug']) == (1, 'tbsp', 'oyster_sauce')
    assert 'explicit_meat' not in flags(it['slug'])
    assert 'shellfish' in flags(it['slug'])


@pytest.mark.parametrize('line,slug,explicit', [
    ('1 cup low-sodium chicken broth', 'chicken_stock', True),
    ('2 beef bouillon cubes', 'beef_bouillon', True),
    ('2 tablespoons lard', 'lard', True),
    ('3 anchovy fillets, chopped', 'anchovy', True),
    ('1 can tuna, drained', 'canned_tuna', True),
    ('4 slices bacon', 'bacon', True),
    ('2 cups vegetable broth', 'vegetable_stock', False),
    ('2 tbsp fish sauce', 'fish_sauce', False),
    ('1 tsp Worcestershire sauce', 'worcestershire_sauce', False),
    ('1 envelope unflavored gelatin', 'gelatin', False),
    ('1/2 cup grated parmesan cheese', 'parmigiano_reggiano', False),
    ('1 package vegan chicken strips', 'vegetarian_meat', False),
    ('2 cups cream of mushroom soup', 'cream_of_mushroom_soup', False),
    ('1 can cream of chicken soup', 'cream_of_chicken_soup', True),
    ('1 (3 oz) package chicken-flavored ramen noodles', 'ramen_noodles', False),
    ('2 cups stock', 'stock', True),
])
def test_diet_traps(line, slug, explicit):
    it = one(line)
    assert it['slug'] == slug
    assert ('explicit_meat' in flags(slug)) is explicit


# ---------- amounts ----------

@pytest.mark.parametrize('line,qty,qty_max,unit', [
    ('1/2 teaspoon salt', 0.5, None, 'tsp'),
    ('1 1/2 cups flour', 1.5, None, 'cup'),
    ('1-1/2 cups flour', 1.5, None, 'cup'),
    ('½ tsp baking powder', 0.5, None, 'tsp'),
    ('1½ tbsp honey', 1.5, None, 'tbsp'),
    ('¼-½ tsp rose water', 0.25, 0.5, 'tsp'),
    ('2-3 cloves garlic', 2, 3, 'clove'),
    ('2 to 3 tablespoons olive oil', 2, 3, 'tbsp'),
    ('1 or 2 cloves minced garlic', 1, 2, 'clove'),
    ('140g self-raising flour', 140, None, 'g'),
    ('250ml milk', 250, None, 'ml'),
    ('1.5 kg potatoes', 1.5, 'kg' and None, 'kg'),
    ('2 Litres chicken stock', 2, None, 'l'),
    ('3 Tb Worcestershire sauce', 3, None, 'tbsp'),
    ('2 t. salt', 2, None, 'tsp'),
    ('1 c. sugar', 1, None, 'cup'),
    ('8-ounce sliced mushrooms', 8, None, 'oz'),
    ('1 12 teaspoons grated lemon rind', 1.5, None, 'tsp'),
    ('14 teaspoon salt', 0.25, None, 'tsp'),
    ('1 cup plus 2 tablespoons buttermilk', 1.125, None, 'cup'),
    ('3 eggs', 3, None, 'piece'),
    ('Four 5- to 6-ounce beef tenderloin steaks', 4, None, 'piece'),
    ('75g/2½oz hazelnuts', 75, None, 'g'),
    ('2 tbsp/30ml milk', 2, None, 'tbsp'),
    ('1 doz eggs', 12, None, 'piece'),
    ('pinch of salt', 1, None, 'pinch'),
    ('a handful of basil leaves', 1, None, 'handful'),
    ('salt to taste', None, None, None),
])
def test_amounts(line, qty, qty_max, unit):
    it = parse_line(line)[0]
    assert (it['qty'], it['qty_max'], it['unit']) == (qty, qty_max, unit), it


def test_can_with_size():
    it = one('1 (14 oz) can chickpeas, drained')
    assert (it['qty'], it['unit'], it['slug']) == (1, 'can', 'chickpeas')
    assert it['pkg'] == {'qty': 14, 'unit': 'oz'}
    assert it['prep'] == 'drained'


def test_can_with_size_after_unit_and_multiplier():
    it = one('2 x 400g cans plum tomatoes')
    assert (it['qty'], it['unit'], it['slug'], it['pkg']) == (2, 'can', 'canned_tomatoes', {'qty': 400, 'unit': 'g'})
    it = one('1 can (28-oz) crushed tomatoes')
    assert (it['qty'], it['unit'], it['pkg']) == (1, 'can', {'qty': 28, 'unit': 'oz'})


# ---------- names, notes, flags ----------

def test_salt_and_pepper_to_taste_gives_two_optional_items():
    items = parse_line('salt and pepper to taste')
    assert [i['slug'] for i in items] == ['salt', 'black_pepper']
    assert all(i['optional'] and i['qty'] is None for i in items)


def test_two_ingredients_with_their_own_amounts():
    items = parse_line('1 egg plus 2 egg whites')
    assert [(i['slug'], i['qty']) for i in items] == [('egg', 1), ('egg_white', 2)]


def test_each_shares_the_amount():
    items = parse_line('1/4 tsp each salt and pepper')
    assert [(i['slug'], i['qty'], i['unit']) for i in items] == [('salt', 0.25, 'tsp'), ('black_pepper', 0.25, 'tsp')]


def test_and_inside_a_name_does_not_split():
    assert one('1 cup half and half')['slug'] == 'half_and_half'
    assert one('1 box macaroni and cheese')['slug'] == 'boxed_mac_and_cheese'


def test_for_garnish_is_optional_only_without_an_amount():
    assert one('fresh parsley, for garnish')['optional'] is True
    it = one('1/4 cup olive oil, plus more to taste')
    assert it['optional'] is False and 'plus more to taste' in it['note']


def test_divided_and_optional_go_to_note_and_flag():
    it = one('1-3/4 cups sugar, divided')
    assert (it['slug'], it['qty'], it['optional']) == ('sugar', 1.75, False)
    assert 'divided' in it['note']
    assert one('2 tbsp white sugar, optional')['optional'] is True


def test_parentheticals_become_notes():
    it = one('4 slices bacon (or 1/3 pound pancetta), roughly chopped')
    assert (it['slug'], it['qty'], it['unit']) == ('bacon', 4, 'slice')
    assert 'or 1/3 pound pancetta' in it['note']
    assert it['prep'] == 'roughly chopped'


def test_prep_before_the_name():
    it = one('1 cup finely chopped onion')
    assert it['slug'] == 'onion' and it['prep'] == 'finely, chopped'


def test_or_alternative_takes_the_first():
    assert one('2 cups chicken or vegetable broth')['slug'] == 'chicken_stock'
    assert one('2 tablespoons vegetable or olive oil')['slug'] == 'vegetable_oil'
    assert one('1 tsp sriracha, or other hot sauce to taste')['slug'] == 'sriracha'


def test_juice_of_a_fruit():
    it = one('Juice of 1 Lime')
    assert (it['slug'], it['qty'], it['unit']) == ('lime_juice', 1, 'piece')
    assert one('lemons, rind of')['slug'] == 'lemon_zest'


def test_postfix_units():
    it = one('4 garlic cloves, minced')
    assert (it['slug'], it['qty'], it['unit']) == ('garlic', 4, 'clove')
    assert one('3 whole cloves')['slug'] == 'cloves'
    assert one('2 celery stalks, sliced')['unit'] == 'stalk'


def test_regional_synonyms():
    assert one('1 bunch dhania')['slug'] == 'cilantro'
    assert one('2 aubergines')['slug'] == 'eggplant'
    assert one('3 spring onions, sliced')['slug'] == 'green_onion'
    assert one('1 can garbanzo beans')['slug'] == 'chickpeas'
    assert one('200g plain flour')['slug'] == 'all_purpose_flour'
    assert one('2 tbsp cornflour')['slug'] == 'cornstarch'
    assert one('Bunch Coriander')['slug'] == 'cilantro'
    assert one('1 tsp ground coriander')['slug'] == 'coriander'


def test_cjk_lines():
    it = one('30克 生姜')
    assert (it['qty'], it['unit'], it['slug']) == (30, 'g', 'ginger')
    it = one('4-5片 姜片')
    assert (it['qty'], it['qty_max'], it['unit'], it['slug']) == (4, 5, 'slice', 'ginger')


def test_headers_and_blanks_give_no_items():
    for line in ('For the glaze:', 'Cupcakes:', 'For the dumplings', '', '  ', '”', 'To make the Sauce'):
        assert parse_line(line) == [], line


def test_instructions_resolve_to_nothing_but_still_give_an_item():
    items = parse_line('carefully unwrap, and poke to test, and then rewrap')
    assert len(items) == 1 and items[0]['slug'] is None


def test_deterministic():
    line = '2 (11 ounce) cans refrigerated breadstick dough, dough'
    assert parse_line(line) == parse_line(line)


def test_output_fields():
    it = one('1 tbsp oyster sauce')
    assert set(it) == {'qty', 'qty_max', 'unit', 'slug', 'raw_name', 'prep', 'optional', 'note', 'pkg'}


# ---------- gold set and coverage bookkeeping ----------

def test_gold_set_size_and_labels():
    gold = S.load_gold()
    assert len(gold) >= 300
    for rec in gold:
        for it in rec['items']:
            assert it['slug'] is None or it['slug'] in ING, (rec['n'], it['slug'])


def test_gold_bar():
    res = S.score(S.load_gold())
    for field, bar in S.BAR.items():
        assert res['acc'][field] >= bar, (field, res['acc'][field])


def test_coverage_counts_every_line():
    lines = ['2 cups chicken stock', 'For the glaze:', '', 'carefully unwrap', 'salt and pepper']
    st, unresolved, _, reasons, drops = C.run(lines)
    assert st['lines'] == 5
    assert st['dropped'] == sum(drops.values()) == 2
    assert st['items'] == 4 and st['resolved'] == 3
    assert sum(unresolved.values()) == sum(reasons.values()) == 1


@pytest.mark.parametrize('name,expect', [
    ('', 'no name left'),
    ('filling', 'sub-recipe'),
    ('4 cups', 'amount repeated'),
    ('Bake 45 minutes at 350 F', 'instruction'),
    ('耗油x', 'non-English'),
    ('ackee-like unknownfruit', 'not in the taxonomy'),
])
def test_every_unresolved_item_gets_a_reason(name, expect):
    assert expect in C.reason(name, name)
