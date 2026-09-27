"""Tests for the substitutions table. Run: python3 -m pytest ingest/subs -q"""
import os
import re
import sys

import pytest
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate as v  # noqa: E402

ING, ENTRIES = v.load()
BY_TARGET = {}
for _e in ENTRIES:
    BY_TARGET.setdefault(_e['target'], []).append(_e)


def ing_flags(slug):
    return v.ingredient_flags(ING, slug)


def entry(**over):
    base = {'id': 'x__y', 'target': 'soy_sauce',
            'substitute': [{'slug': 'tamari', 'amount': 1, 'unit': 'x'}],
            'contexts': ['any'], 'quality': 3, 'flavor_effect': 'Close', 'cuisines': ['global']}
    base.update(over)
    return base


def errors_for(*entries):
    return v.validate_entries(ING, list(entries))


# ---------- the real data ----------

def test_real_data_has_zero_errors():
    assert v.validate(ING, ENTRIES) == []


def test_at_least_400_entries():
    assert len(ENTRIES) >= 400


def test_every_ingredient_is_used():
    assert v.unused_slugs(ING, ENTRIES) == []


# ---------- planted diet traps (brief S4 item 4; revised for D15/R7, brief S4b) ----------
# D15 (owner, verbatim): "anything that is not explicitly meat is fine for vegetarian, even
# stuff like oyster sauce of worsterchire sauce is fine, its mostly about the protein source".
# Vegetarian now excludes only `explicit_meat`. `vegetarian_strict` keeps the old, stricter rule
# (any red_meat/poultry/fish/shellfish/animal_derived flag) for a possible strict mode later, but
# it is not offered as a preset.

def test_worcestershire_is_vegetarian_ok_but_fails_strict():
    fl = ing_flags('worcestershire_sauce')
    assert v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert 'fish' in fl and 'explicit_meat' not in fl
    assert 'anchovies' in ING['worcestershire_sauce']['hidden_animal']


def test_oyster_sauce_is_vegetarian_ok_but_fails_strict():
    fl = ing_flags('oyster_sauce')
    assert v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert 'shellfish' in fl and 'explicit_meat' not in fl


def test_fish_sauce_is_vegetarian_ok_and_ok_for_no_red_meat():
    fl = ing_flags('fish_sauce')
    assert v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert v.diet_safe(fl, 'no_red_meat')


def test_parmigiano_is_vegetarian_ok():
    fl = ing_flags('parmigiano_reggiano')
    assert v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'vegetarian_strict'), 'rennet cheese still fails the strict rule'


def test_chicken_stock_is_not_vegetarian():
    fl = ing_flags('chicken_stock')
    assert 'explicit_meat' in fl
    assert not v.diet_safe(fl, 'vegetarian')
    assert v.diet_safe(fl, 'no_red_meat'), 'poultry is fine for No red meat'


def test_lard_is_not_vegetarian():
    fl = ing_flags('lard')
    assert 'explicit_meat' in fl
    assert not v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'no_red_meat')


def test_anchovy_fillet_is_not_vegetarian():
    fl = ing_flags('anchovy')
    assert 'explicit_meat' in fl
    assert not v.diet_safe(fl, 'vegetarian')


def test_beef_stock_fails_vegetarian_and_no_red_meat():
    fl = ing_flags('beef_stock')
    assert 'red_meat' in fl and 'explicit_meat' in fl
    assert not v.diet_safe(fl, 'no_red_meat')
    assert not v.diet_safe(fl, 'vegetarian')


def test_gelatin_is_vegetarian_ok_but_not_ok_for_no_red_meat():
    fl = ing_flags('gelatin')
    assert 'animal_derived' in fl and 'red_meat' in fl
    assert 'explicit_meat' not in fl
    assert v.diet_safe(fl, 'vegetarian'), 'D15: gelatin is a condiment-like trace, not the protein'
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert not v.diet_safe(fl, 'no_red_meat'), 'R8: No red meat stays strict'


def test_entries_using_worcestershire_are_now_vegetarian_ok():
    uses = [e for e in ENTRIES if any(c['slug'] == 'worcestershire_sauce' for c in e['substitute'])]
    assert uses, 'expected at least one entry that uses Worcestershire as a component'
    for e in uses:
        assert v.diet_safe(v.substitute_flags(ING, e), 'vegetarian'), e['id']
        assert not v.diet_safe(v.substitute_flags(ING, e), 'vegetarian_strict'), e['id']


def test_there_is_a_vegetarian_worcestershire_alternative():
    veg = [e for e in BY_TARGET['worcestershire_sauce']
           if v.diet_safe(v.substitute_flags(ING, e), 'vegetarian')]
    assert len(veg) >= 1


@pytest.mark.parametrize('target', ['soy_sauce', 'worcestershire_sauce', 'apple_cider_vinegar'])
def test_owner_examples_have_at_least_three_entries(target):
    assert len(BY_TARGET.get(target, [])) >= 3


def test_flags_are_computed_from_components_not_claims():
    # A substitute containing fish sauce is fine for Vegetarian now (D15/R7: not the protein
    # source), but still fails the strict rule and is fine for No red meat either way.
    e = entry(substitute=[{'slug': 'soy_sauce', 'amount': 0.5, 'unit': 'x'},
                          {'slug': 'fish_sauce', 'amount': 0.5, 'unit': 'x'}])
    fl = v.substitute_flags(ING, e)
    assert v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert v.diet_safe(fl, 'no_red_meat')
    # a component that IS the protein source (anchovy fillets) makes a mix unsafe for Vegetarian
    e2 = entry(substitute=[{'slug': 'soy_sauce', 'amount': 0.5, 'unit': 'x'},
                           {'slug': 'anchovy', 'amount': 0.5, 'unit': 'x'}])
    assert not v.diet_safe(v.substitute_flags(ING, e2), 'vegetarian')
    # beef stock in a mix makes it unsafe for No red meat
    e3 = entry(substitute=[{'slug': 'beef_stock', 'amount': 1, 'unit': 'x'},
                           {'slug': 'water', 'amount': 1, 'unit': 'x'}])
    assert not v.diet_safe(v.substitute_flags(ING, e3), 'no_red_meat')


def test_hand_written_diet_claim_is_rejected():
    errs = errors_for(entry(substitute=[{'slug': 'fish_sauce', 'amount': 1, 'unit': 'x'}],
                            vegetarian=True))
    assert any("unknown field 'vegetarian'" in x for x in errs)


def test_text_claims_agree_with_computed_flags():
    """A note or flavor line that says 'vegetarian', 'dairy free' etc. must match the flags."""
    claims = {
        r'(?<!not )\bvegetarian\b': lambda fl: v.diet_safe(fl, 'vegetarian'),
        r'\bnot vegetarian\b': lambda fl: not v.diet_safe(fl, 'vegetarian'),
        r'\bdairy free\b': lambda fl: 'dairy' not in fl,
        r'\bnut free\b': lambda fl: 'nuts' not in fl,
        r'\bgluten free\b': lambda fl: 'gluten' not in fl,
        r'\balcohol free\b': lambda fl: 'alcohol' not in fl,
        r'\begg free\b': lambda fl: 'egg' not in fl,
    }
    bad = []
    for e in ENTRIES:
        text = f"{e['flavor_effect']} {e.get('note', '')}".lower()
        fl = v.substitute_flags(ING, e)
        for pat, ok in claims.items():
            if re.search(pat, text) and not ok(fl):
                bad.append((e['id'], pat))
    assert bad == []


# ---------- validator rejects bad input ----------

def test_unknown_slug_rejected():
    errs = errors_for(entry(substitute=[{'slug': 'unicorn_sauce', 'amount': 1, 'unit': 'x'}]))
    assert any("unknown slug 'unicorn_sauce'" in x for x in errs)


def test_unknown_target_rejected():
    assert any('unknown target' in x for x in errors_for(entry(target='nope')))


@pytest.mark.parametrize('field', v.ENTRY_REQUIRED)
def test_missing_field_rejected(field):
    e = entry()
    del e[field]
    assert any(f"missing field '{field}'" in x for x in errors_for(e))


def test_duplicate_id_rejected():
    errs = errors_for(entry(), entry())
    assert any('duplicate id' in x for x in errs)


@pytest.mark.parametrize('q', [0, 4, -1, 2.5, '3', True])
def test_quality_outside_1_to_3_rejected(q):
    assert any('quality' in x for x in errors_for(entry(quality=q)))


def test_empty_contexts_rejected():
    assert any('contexts' in x for x in errors_for(entry(contexts=[])))


def test_unknown_context_rejected():
    # the exact slip made while authoring v1
    assert any("unknown context 'curry'" in x for x in errors_for(entry(contexts=['curry'])))


def test_empty_substitute_rejected():
    assert any('substitute' in x for x in errors_for(entry(substitute=[])))


def test_non_positive_amount_rejected():
    e = entry(substitute=[{'slug': 'tamari', 'amount': 0, 'unit': 'x'}])
    assert any('amount' in x for x in errors_for(e))


def test_absolute_unit_without_per_rejected():
    e = entry(substitute=[{'slug': 'tamari', 'amount': 1, 'unit': 'tbsp'}])
    assert any('needs a per field' in x for x in errors_for(e))


def test_substitute_equal_to_target_rejected():
    e = entry(substitute=[{'slug': 'soy_sauce', 'amount': 1, 'unit': 'x'}])
    assert any('target itself' in x for x in errors_for(e))


def test_unknown_cuisine_rejected():
    assert any('cuisine' in x for x in errors_for(entry(cuisines=['martian'])))


def test_duplicate_yaml_key_rejected():
    with pytest.raises(yaml.constructor.ConstructorError):
        yaml.load('ingredients:\n  salt: {category: salt, flags: []}\n'
                  '  salt: {category: salt, flags: [fish]}\n', Loader=v.UniqueKeyLoader)


def test_ingredient_unknown_flag_and_category_rejected():
    bad = {'foo': {'category': 'magic', 'flags': ['vegan']}}
    errs = v.validate_ingredients(bad)
    assert any('unknown category' in x for x in errs)
    assert any("unknown flag 'vegan'" in x for x in errs)


def test_animal_derived_needs_hidden_note():
    errs = v.validate_ingredients({'foo': {'category': 'sauce_condiment',
                                           'flags': ['animal_derived']}})
    assert any('hidden_animal' in x for x in errs)


# ---------- coverage ----------

@pytest.mark.parametrize('target', [
    'soy_sauce', 'worcestershire_sauce', 'fish_sauce', 'oyster_sauce', 'hoisin_sauce',
    'gochujang', 'white_miso', 'apple_cider_vinegar', 'rice_vinegar', 'sherry_vinegar',
    'tamarind_paste', 'amchur', 'garam_masala', 'chinese_five_spice', 'zaatar', 'ras_el_hanout',
    'buttermilk', 'heavy_cream', 'egg', 'cornstarch', 'baking_powder', 'brown_sugar', 'butter',
    'basil', 'cumin', 'garlic', 'jalapeno', 'dry_white_wine', 'chicken_stock', 'ground_beef',
])
def test_named_targets_present(target):
    assert target in BY_TARGET


def test_every_cuisine_is_covered():
    seen = {c for e in ENTRIES for c in e['cuisines']}
    for c in v.CUISINES:
        assert c in seen, c


def test_every_context_is_used():
    seen = {c for e in ENTRIES for c in e['contexts']}
    assert set(v.CONTEXTS) <= seen


def test_coverage_md_is_current():
    with open(v.COVERAGE_PATH, encoding='utf-8') as fh:
        assert fh.read() == v.coverage_markdown(ING, ENTRIES), \
            'COVERAGE.md is stale: run python3 validate.py --coverage'


def test_report_flags_targets_without_vegetarian_option():
    rep = v.target_report(ING, ENTRIES)
    assert rep['worcestershire_sauce']['vegetarian'] is True
    assert rep['guanciale']['vegetarian'] is False
    assert rep['beef_stock']['no_red_meat'] is True
