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
