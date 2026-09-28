"""Tests for the canonical taxonomy. Run: python3 -m pytest ingest/taxonomy -q"""
import os
import sys

import pytest
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from ingest.taxonomy import taxonomy as T  # noqa: E402
from ingest.taxonomy.normalize import norm_name  # noqa: E402

ING = T.load()
INDEX = T.build_index(ING)


def test_zero_errors():
    assert T.validate(ING) == []


def test_size_in_the_brief_range():
    assert 1500 <= len(ING) <= 2500


def test_every_entry_has_the_brief_fields():
    for slug, rec in ING.items():
        for k in ('name', 'synonyms', 'category', 'aisle', 'flags', 'is_staple'):
            assert k in rec, (slug, k)
        assert rec['aisle'] in T.AISLES


@pytest.mark.parametrize('names,slug', [
    (['cilantro', 'coriander leaves', 'dhania', 'fresh coriander'], 'cilantro'),
    (['eggplant', 'aubergine', 'brinjal', 'baingan'], 'eggplant'),
    (['scallion', 'spring onion', 'green onions', 'hara pyaz'], 'green_onion'),
    (['chickpeas', 'garbanzo beans', 'chana', 'chick peas'], 'chickpeas'),
    (['zucchini', 'courgettes'], 'zucchini'),
    (['powdered sugar', "confectioners' sugar", 'icing sugar'], 'powdered_sugar'),
    (['heavy cream', 'double cream'], 'heavy_cream'),
    (['cornstarch', 'cornflour'], 'cornstarch'),
    (['all-purpose flour', 'plain flour', 'maida'], 'all_purpose_flour'),
])
def test_regional_synonyms(names, slug):
    for n in names:
        assert INDEX.get(norm_name(n)) == slug, n


def test_varieties_fall_back_to_a_parent():
    assert T.ancestors(ING, 'roma_tomato') == ['roma_tomato', 'tomatoes']
    assert T.ancestors(ING, 'cremini_mushrooms')[-1] == 'mushrooms'
    assert 'white_fish' in T.ancestors(ING, 'red_snapper')
    for slug, rec in ING.items():
        if rec.get('parent'):
            assert rec['parent'] in ING


def test_staples():
    staples = {s for s, r in ING.items() if r['is_staple']}
    assert {'water', 'salt', 'black_pepper', 'neutral_oil', 'vegetable_oil'} <= staples
    assert 'chicken_stock' not in staples


def test_explicit_meat_is_consistent():
    for slug, rec in ING.items():
        fl = set(rec['flags'])
        if 'explicit_meat' in fl:
            assert fl & {'red_meat', 'poultry', 'fish', 'shellfish'}, slug


@pytest.mark.parametrize('slug', ['chicken_stock', 'beef_stock', 'lard', 'suet', 'bacon', 'anchovy',
                                  'shrimp', 'gravy', 'stock', 'goose_fat', 'meat', 'caul_fat'])
def test_protein_sources_and_meat_stocks_are_explicit_meat(slug):
    assert 'explicit_meat' in ING[slug]['flags']


@pytest.mark.parametrize('slug', ['oyster_sauce', 'fish_sauce', 'worcestershire_sauce', 'gelatin',
                                  'shrimp_paste', 'parmigiano_reggiano', 'marshmallows',
                                  'thai_curry_paste', 'vegetable_stock', 'kimchi'])
def test_condiments_and_traces_are_not_explicit_meat(slug):
    assert 'explicit_meat' not in ING[slug]['flags']


def test_duplicate_slug_rejected():
    with pytest.raises(yaml.constructor.ConstructorError):
        yaml.load('ingredients:\n  salt: {name: salt}\n  salt: {name: salt}\n', Loader=T.UniqueKeyLoader)


def test_validator_rejects_bad_records():
    bad = {'foo': {'name': 'foo', 'synonyms': ['bar'], 'category': 'magic', 'aisle': 'moon',
                   'flags': ['vegan', 'explicit_meat'], 'is_staple': 'yes', 'parent': 'nope',
                   'density_g_per_ml': -1},
           'baz': {'name': 'bar', 'synonyms': [], 'category': 'spice', 'aisle': 'spices',
                   'flags': ['animal_derived', 'fish'], 'is_staple': False}}
    errs = '\n'.join(T.validate(bad))
    for frag in ('unknown category', 'unknown aisle', "unknown flag 'vegan'",
                 'explicit_meat needs the animal flag', 'is_staple must be', 'unknown parent',
                 'density_g_per_ml must be', 'also names', 'animal_derived needs a hidden_animal'):
        assert frag in errs, frag


def test_normalization_is_shared_and_forgiving():
    assert norm_name('Tomatoes') == norm_name('tomato')
    assert norm_name('Crème Fraîche') == norm_name('creme fraiche')
    assert norm_name('Confectioners’ Sugar') == norm_name('confectioners sugar')
    assert norm_name('jalepenos') == norm_name('jalapeno')
    assert norm_name('garlic pwdr') == norm_name('garlic powder')


# --- purchase fields (S7c: the shoppable grocery list) ---------------------------------------

def _base(**extra):
    rec = {'name': 'x', 'synonyms': [], 'category': 'fruit', 'aisle': 'produce', 'flags': [],
           'is_staple': False}
    rec.update(extra)
    return rec


def _purchase_errors(ings):
    return [e for e in T.validate(ings, full=False)
            if 'shop_unit' in e or 'buy_as' in e or 'yield' in e]


@pytest.mark.parametrize('slug,shop,yld,buy_as', [
    ('lemon_juice', 'piece', {'qty': 45, 'unit': 'ml'}, 'lemon'),
    ('garlic', 'head', {'qty': 10, 'unit': 'clove'}, None),
    ('egg_yolk', 'pack', {'qty': 12, 'unit': 'piece'}, 'egg'),
    ('cilantro', 'bunch', {'qty': 1, 'unit': 'cup'}, None),
    ('soy_sauce', 'bottle', {'qty': 250, 'unit': 'ml'}, None),
    ('carrot', 'piece', None, None),
])
def test_brief_purchase_examples(slug, shop, yld, buy_as):
    rec = ING[slug]
    assert rec['shop_unit'] == shop
    assert rec.get('yield') == yld
    assert rec.get('buy_as') == buy_as


def test_purchase_fields_cover_the_frequent_slugs():
    with_shop = [s for s, r in ING.items() if r.get('shop_unit')]
    assert len(with_shop) >= 290
    for s in with_shop:
        assert ING[s]['shop_unit'] in T.SHOP_UNITS


def test_buy_as_targets_share_the_shop_unit():
    for slug, rec in ING.items():
        if 'buy_as' in rec:
            assert ING[rec['buy_as']]['shop_unit'] == rec['shop_unit'], slug


@pytest.mark.parametrize('rec,expect', [
    (_base(shop_unit='crate'), "unknown shop_unit 'crate'"),
    (_base(shop_unit='bunch'), "shop_unit 'bunch' needs a yield"),
    (_base(shop_unit='g', **{'yield': {'qty': 1, 'unit': 'g'}}), 'a g shop_unit takes no yield'),
    (_base(**{'yield': {'qty': 1, 'unit': 'g'}}), 'buy_as/yield need a shop_unit'),
    (_base(shop_unit='piece', **{'yield': {'qty': 0, 'unit': 'ml'}}),
     'yield qty must be a positive number'),
    (_base(shop_unit='piece', **{'yield': {'qty': 1, 'unit': 'furlong'}}),
     "unknown yield unit 'furlong'"),
    (_base(shop_unit='piece', **{'yield': 45}), 'yield must be {qty, unit}'),
    (_base(shop_unit='piece', buy_as='nope', **{'yield': {'qty': 1, 'unit': 'ml'}}),
     "unknown buy_as 'nope'"),
    (_base(shop_unit='piece', buy_as='lemon'), 'buy_as needs a yield'),
    (_base(shop_unit='bunch', buy_as='lemon', **{'yield': {'qty': 1, 'unit': 'ml'}}),
     "differs from buy_as 'lemon'"),
])
def test_purchase_field_errors(rec, expect):
    ings = {'lemon': _base(shop_unit='piece'), 'thing': rec}
    errors = _purchase_errors(ings)
    assert any(expect in e for e in errors), errors


def test_buy_as_is_one_hop():
    ings = {
        'citrus': _base(shop_unit='piece'),
        'lemon': _base(shop_unit='piece', buy_as='citrus',
                       **{'yield': {'qty': 1, 'unit': 'piece'}}),
        'lemon_juice': _base(shop_unit='piece', buy_as='lemon',
                             **{'yield': {'qty': 45, 'unit': 'ml'}}),
    }
    assert any('is itself bought as something else' in e for e in _purchase_errors(ings))


def test_a_valid_purchase_record_has_no_errors():
    ings = {
        'lemon': _base(shop_unit='piece'),
        'lemon_juice': _base(shop_unit='piece', buy_as='lemon',
                             **{'yield': {'qty': 45, 'unit': 'ml'}}),
        'garlic': _base(shop_unit='head', **{'yield': {'qty': 10, 'unit': 'clove'}}),
        'beef': _base(shop_unit='g'),
    }
    assert _purchase_errors(ings) == []
