"""Tests for the recipe taggers. Run: python3 -m pytest ingest/tag -q"""
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.tag.tagger import tag_recipe  # noqa: E402
from ingest.tag import diet as D  # noqa: E402
from ingest.tag import equipment as E  # noqa: E402
from ingest.tag import timing as TM  # noqa: E402
from ingest.tag.gold import score as S  # noqa: E402


def R(ingredients=(), steps=(), title='Test', source='recipenlg', **kw):
    return dict(id='t:1', source=source, title=title, ingredients=list(ingredients), steps=list(steps), **kw)


def diet(raw, preset):
    return tag_recipe(raw)['diet'][preset]


def eq(steps, source='recipenlg', ingredients=('1 cup water',)):
    return tag_recipe(R(ingredients, steps, source=source))


# ------------------------------------------------------------------ diet traps (brief S5a)

def test_chicken_stock_with_vegetable_alternative_is_adaptable():
    r = R(['2 cups chicken or vegetable broth', '1 onion', '2 carrots'], ['Simmer everything 20 minutes.'])
    v = diet(r, 'vegetarian')
    assert v['status'] == 'adaptable'
    assert v['swaps'] == [dict(v['swaps'][0], via='alternative', use='vegetable broth')]
    assert diet(r, 'no_red_meat')['status'] == 'ok'


def test_parenthesised_vegetable_alternative():
    r = R(['32 oz. chicken stock (or vegetable stock)', '1 onion'])
    assert diet(r, 'vegetarian')['status'] == 'adaptable'


def test_oyster_sauce_is_vegetarian_ok_but_not_strict():
    r = R(['2 tbsp oyster sauce', '1 tbsp Worcestershire sauce', '1 head broccoli'], ['Stir-fry.'])
    assert diet(r, 'vegetarian')['status'] == 'ok'
    assert diet(r, 'no_red_meat')['status'] == 'ok'
    assert diet(r, 'vegetarian_strict')['status'] != 'ok'


def test_lard_is_not_ok_for_no_red_meat():
    baking = R(['1 c. lard', '2 c. flour', '1 tsp baking powder'], ['Rub the lard into the flour and bake.'])
    d = diet(baking, 'no_red_meat')
    assert d['status'] == 'adaptable'
    assert d['swaps'][0]['via'] == 'substitution'
    # lard's substitutions fit baking and frying only; in a plain simmered dish there is no way out
    stew = R(['2 tbsp lard', '1 lb pinto beans'], ['Put everything in a pot of water and simmer 2 hours.'])
    assert diet(stew, 'no_red_meat')['status'] == 'no'
    assert diet(stew, 'vegetarian')['status'] == 'no'


def test_lard_as_the_alternative_is_ok():
    r = R(['1/4 cup Vegetable Shortening Or Lard', '2 cups flour'])
    assert diet(r, 'no_red_meat')['status'] == 'ok'
    r = R(['1/2 cup Lard Or Vegetable Shortening', '2 cups flour'])
    assert diet(r, 'no_red_meat')['status'] == 'adaptable'


def test_gelatin_and_marshmallows_fail_no_red_meat_only():
    r = R(['2 c. mini marshmallows', '1 c. sugar', '1 tsp vanilla'], ['Stir over medium heat.'])
    assert diet(r, 'vegetarian')['status'] == 'ok'
    assert diet(r, 'no_red_meat')['status'] == 'no'


def test_title_is_never_read_for_diet():
    r = R(['1 onion', '2 carrots', '4 cups vegetable broth'], ['Simmer.'], title='Chicken Soup')
    assert diet(r, 'vegetarian')['status'] == 'ok'
    r = R(['1 lb ground beef'], ['Brown the beef.'], title='Vegan Chili')
    assert diet(r, 'vegetarian')['status'] != 'ok'


def test_unresolved_item_naming_meat_offends():
    assert D.flags_from_words('minced bison') >= {'red_meat', 'explicit_meat'}
    assert D.flags_from_words('fish sauce') == set()
    assert D.flags_from_words('oyster mushrooms') == set()
    assert D.flags_from_words('hamburger buns') == set()
    assert D.flags_from_words('vegan chicken strips') == set()
    items = [{'slug': None, 'raw_name': 'wild boar shoulder', 'note': None, 'optional': False, 'line': 0},
             {'slug': 'onion', 'raw_name': 'onion', 'note': None, 'optional': False, 'line': 1}]
    out = D.tag_diet(R(['wild boar shoulder', 'onion']), items)
    assert out['vegetarian']['status'] == 'no'
    assert out['no_red_meat']['status'] == 'no'


def test_ground_beef_is_adaptable_via_substitution():
    r = R(['1 lb ground beef', '1 onion'], ['Brown the beef in a skillet.'])
    for p in ('vegetarian', 'no_red_meat'):
        d = diet(r, p)
        assert d['status'] == 'adaptable'
        assert d['swaps'][0]['quality'] >= 2


def test_bacon_is_adaptable_via_substitution():
    # S3b: bacon (via its `pork` ancestor) now has a real quality>=2 vegetarian analog, so it
    # is no longer stuck as an unresolved blocker; no_red_meat has the same rescue.
    r = R(['8 slices bacon', '1 onion'], ['Fry the bacon.'])
    for p in ('vegetarian', 'no_red_meat'):
        d = diet(r, p)
        assert d['status'] == 'adaptable'
        assert d['swaps'][0]['quality'] >= 2


def test_low_quality_substitution_is_not_a_way_out():
    # ground lamb's only vegetarian-safe substitute (plant-based ground) is quality 1: not
    # enough on its own. Lamb has no quality>=2 rescue for either preset.
    r = R(['1 lb ground lamb', '1 onion'], ['Brown the lamb.'])
    assert diet(r, 'vegetarian')['status'] == 'no'
    assert diet(r, 'no_red_meat')['status'] == 'no'


def test_optional_item_can_be_left_out_but_not_a_head_on_fish():
    # duck has no substitution in the table, so an optional one is left out; a turkey leg noted
    # only "optional to remove the skin" is not an optional turkey leg.
    r = R(['1 lb duck, cooked and shredded (optional)', '2 potatoes'], ['Boil the potatoes.'])
    d = diet(r, 'vegetarian')
    assert d['status'] == 'adaptable' and d['swaps'][0]['via'] == 'omit'
    r = R(['2 turkey legs (optional to remove the skin)', '1 lemon'], ['Roast the turkey.'])
    assert diet(r, 'vegetarian')['status'] == 'no'


def test_unreadable_alternative_is_not_a_way_out():
    # the 20k run first tagged a similar ham cut "adaptable" via the alternative "unsmoked ...";
    # lamb has no rescue substitution, so the unreadable alternative must be what is on trial.
    r = R(['5kg boneless lamb joint (bone-in or boneless depending on your preference)',
           '2 tbsp honey'], source='bbcgoodfood')
    assert diet(r, 'vegetarian')['status'] == 'no'
    assert diet(r, 'no_red_meat')['status'] == 'no'


def test_negated_alternative_is_not_a_way_out():
    r = R(['500g stewing lamb (not lamb neck)', '500g potatoes'])
    assert diet(r, 'vegetarian')['status'] == 'no'


def test_meat_added_in_steps_but_missing_from_list_offends():
    r = R(['2 c. flour', 'hot chicken broth', '1 egg'], ['Drop dumplings into hot broth.',
                                                         'Add turkey pieces, salt and pepper.'])
    assert diet(r, 'vegetarian')['status'] == 'no'
    # a marinade that names meats as a choice is not itself meat
    r = R(['1/2 cup soy sauce', '1 tsp sugar'], ['Mix all together.', 'Add beef, pork, chicken or fish.'])
    assert diet(r, 'vegetarian')['status'] == 'ok'


def test_nameless_lines_make_diet_unknown():
    r = R(['4 cups 4 cups', '1 clove 1 clove', '12 whole 12 whole'])
    d = diet(r, 'vegetarian')
    assert d['status'] == 'unknown' and d['reason']
    assert diet(R([]), 'no_red_meat')['status'] == 'unknown'


def test_generic_meat_slug_yields_to_named_animal():
    # S3b: "crab brown and white meat" now resolves straight to `crab` in the parser (and crab
    # has a real vegetarian swap via its `shellfish` ancestor, so it is no longer a fixture for
    # this fallback). Lobster still misparses to the generic `meat` slug; the named animal
    # ("lobster") must still win over the conservative, red-meat reading of unnamed "meat".
    r = R(['1 lobster brown and white meat separated', '100g watercress'])
    assert diet(r, 'no_red_meat')['status'] == 'ok'
    assert diet(r, 'vegetarian')['status'] == 'no'


# ------------------------------------------------------------------ equipment traps

def test_stovetop_bake_is_not_oven():
    t = eq(['Combine and beat until smooth.', 'Bake 1/4 cup batter for each pancake in a nonstick skillet.'])
    assert 'stovetop' in t['equipment'] and 'oven' not in t['equipment']


def test_bake_in_iron_skillet_at_temperature_is_oven():
    t = eq(['Mix all ingredients.', 'Bake in greased iron skillet on 400° to 425° until brown.'])
    assert {'oven', 'cast_iron'} <= set(t['equipment']) and 'stovetop' not in t['equipment']
    assert t['one_pot'] is True


def test_uk_grill_is_broiler():
    t = eq(['Heat the grill. Lift the chicken onto a rack over a baking tray.',
            'Brush with oil and grill for 8 mins on each side.'], source='bbcgoodfood')
    assert 'broiler' in t['equipment'] and 'grill' not in t['equipment'] and 'oven' not in t['equipment']
    t = eq(['Heat a barbecue until the coals are white hot. Cook the fish on the grill for 5 mins.'])
    assert 'grill' in t['equipment'] and 'broiler' not in t['equipment']


def test_uk_grill_then_remove_from_the_oven_is_not_oven():
    t = eq(['Preheat the grill. Put the peppers on a baking sheet and cook until blackened, about 5 mins. '
            'Remove from the oven and leave to steam.'], source='bbcgoodfood')
    assert 'oven' not in t['equipment'] and 'broiler' in t['equipment']


def test_food_processor_or_blender_tags_both_as_alternatives():
    t = eq(['Cool, then puree in a blender or food processor until smooth.'])
    assert {'blender', 'food_processor'} <= set(t['equipment'])
    assert ['blender', 'food_processor'] in t['equipment_alternatives']


def test_words_that_are_not_equipment():
    t = eq(['Cut in the butter with a pastry blender.', 'Blend in the flour.', 'Bake at 350 for 20 minutes.'])
    assert 'blender' not in t['equipment']
    t = eq(['Place soup and meat into blender. Process until it resembles cement mortar.'])
    assert 'mortar_pestle' not in t['equipment']
    t = eq(['Brown the beef in a Dutch oven over medium heat. Simmer 2 hours.'])
    assert 'oven' not in t['equipment'] and 'dutch_oven' in t['equipment']
    t = eq(['Weigh the dolma down with a pie pan and put my mortar on top of it. Simmer 25 minutes.'])
    assert 'mortar_pestle' not in t['equipment']


def test_air_fryer_bake_is_not_oven():
    t = eq(['Heat your air fryer to 170C.', 'Bake at 170C for 12-15 mins until golden.'], source='bbcgoodfood')
    assert t['equipment'] == ['air_fryer'] and t['one_pot'] is True


def test_pointer_to_another_method_is_ignored():
    t = eq(['Simmer slowly for 1 hr until thick.', 'If you want to make this in a slow cooker, visit our', '.'])
    assert 'slow_cooker' not in t['equipment']


def test_microwave_pot_is_not_stovetop():
    t = eq(['Place butter in microwave safe pot and heat on high for 30 seconds or until melted.',
            'Add cream and warm on high for approximately 1 minute.'])
    assert t['equipment'] == ['microwave'] and t['one_pot'] is True


def test_mortar_and_pestle_and_spice_grinder():
    t = eq(['Tip the spices into a spice grinder and blitz until fine. Or use a pestle and mortar.'])
    assert {'spice_grinder', 'mortar_pestle'} <= set(t['equipment'])
    assert 'food_processor' not in t['equipment']


def test_no_cook_and_no_steps():
    t = eq(['Mix all ingredients in a bowl and chill.'])
    assert t['equipment'] == ['no_cook'] and t['one_pot'] is False
    t = tag_recipe(R(['1 cup flour'], []))
    assert t['equipment'] == [] and t['one_pot'] is None
    assert t['undeterminable']['equipment'] == 'no steps'


# ------------------------------------------------------------------ one pot

def test_one_pot_alternative_vessel_counts_once():
    t = eq(['Heat a wok or large frying pan until very hot, then add the oil.',
            'Stir-fry the chicken for 8 minutes. Return to the wok and serve.'])
    assert t['one_pot'] is True and t['one_pan'] is True


def test_pasta_boiled_separately_is_not_one_pot():
    t = eq(['Brown the sausage in a large skillet over medium heat.',
            'Meanwhile, cook the pasta according to package directions.', 'Toss together.'])
    assert t['one_pot'] is False


def test_stove_and_oven():
    t = eq(['Heat the oil in a saucepan and fry the onion for 10 mins.',
            'Transfer to a baking dish and bake at 180C for 30 mins.'])
    assert t['stove_and_oven'] is True and t['one_pot'] is False


def test_sheet_pan_meal():
    t = tag_recipe(R(['1 lb chicken thighs', '2 bell peppers', '1 red onion', '2 tbsp olive oil'],
                     ['Heat oven to 425°F.', 'Toss everything on a sheet pan and roast for 30 minutes.']))
    assert t['one_pot'] is True and t['sheet_pan_meal'] is True
    t = tag_recipe(R(['2 cups flour', '1 tsp baking powder', '1 cup sugar'],
                     ['Heat oven to 350°F.', 'Drop onto a baking sheet and bake 10 minutes.']))
    assert t['one_pot'] is True and t['sheet_pan_meal'] is False


# ------------------------------------------------------------------ time

def test_time_from_source_fields():
    t = TM.tag_time(R(['1 egg'], ['Boil.'], total_time_min=25))
    assert (t['total_min'], t['source'], t['weeknight'], t['reason']) == (25, 'source', True, None)
    t = TM.tag_time(R(['1 egg'], ['Boil.'], prep_time_min=10, cook_time_min=30))
    assert (t['total_min'], t['active_min'], t['source'], t['weeknight']) == (40, 10, 'source', False)


def test_time_estimated_from_steps():
    r = R(['1 onion', '2 cups stock', '1 cup rice'],
          ['Fry the onion for 5 mins.', 'Add the rice and stock and simmer 15-20 minutes.',
           'Will keep in the fridge for up to 3 days.'])
    t = TM.tag_time(r)
    assert t['source'] == 'estimated'
    assert t['total_min'] == 6 + 5 + 20      # prep allowance 3+3 lines, fry 5, simmer upper 20
    assert t['active_min'] == 6 + 5
    assert t['weeknight'] is False           # 31 > 30


def test_time_overnight_and_hours():
    t = TM.tag_time(R(['1 cup beans'], ['Soak the beans overnight.', 'Simmer for 1 hr 30 mins.']))
    assert t['total_min'] == 4 + 480 + 90 and t['weeknight'] is False


def test_time_unknown_has_reason():
    t = TM.tag_time(R(['1 cup beans'], ['Simmer the beans until tender.']))
    assert t['total_min'] is None and t['weeknight'] is None and t['reason']


# ------------------------------------------------------------------ gold set bars

@pytest.fixture(scope='module')
def gold_summary():
    summary, _ = S.score(S.load_gold(), tag_recipe)
    return summary


def test_gold_set_shape():
    gold = S.load_gold()
    assert len(gold) == 150
    picks = {g['pick'] for g in gold}
    assert {'stock_alt', 'oyster', 'lard', 'stove_bake', 'uk_grill', 'fp_or_blender'} <= picks
    assert len({g['recipe']['source'] for g in gold}) >= 7


def test_gold_bars(gold_summary):
    assert S.bars(gold_summary) == []
