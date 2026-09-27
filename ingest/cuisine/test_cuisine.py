"""Tests for the cuisine classifier and seasonality. Run: python3 -m pytest ingest/cuisine -q"""
import json
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))

from ingest.cuisine import cuisines as C  # noqa: E402
from ingest.cuisine import lexicon as L  # noqa: E402
from ingest.cuisine import season as S  # noqa: E402
from ingest.cuisine.build_dataset import cap_classes  # noqa: E402
from ingest.cuisine.classifier import classify, load_model, UNKNOWN  # noqa: E402
from ingest.cuisine.features import tokens, ingredient_slugs, title_words  # noqa: E402

CANON = set(C.canonical_labels())


# ---------- cuisines.yaml ----------

def test_cuisines_yaml_validates():
    assert C.validate(C.load()) == []


def test_around_25_canonical_labels():
    assert 20 <= len(CANON) <= 30


def test_label_map_targets_are_canonical():
    for source in ('themealdb', 'bbcgoodfood', 'hf_cuisine_type'):
        mapping = C.label_map(source)
        assert mapping, f'{source} should have a non-empty map'
        for raw, canon in mapping.items():
            assert canon in CANON, f'{source}[{raw!r}] -> {canon!r} not canonical'


def test_unmapped_label_is_none_not_a_guess():
    assert C.to_canonical('bbcgoodfood', 'Jewish') is None
    assert C.to_canonical('bbcgoodfood', 'Nonexistent Cuisine') is None
    assert C.to_canonical('themealdb', None) is None


# ---------- features ----------

def test_ingredient_slugs_dedup_and_skip_unresolved():
    slugs = ingredient_slugs(['1 lb chicken thigh', '1 lb chicken thigh', 'for the glaze:'])
    assert slugs.count('chicken_thigh') == 1


def test_title_words_filters_stopwords_and_short_words():
    words = title_words('The Best Easy Chicken Tikka Masala')
    assert 'the' not in words and 'easy' not in words and 'best' not in words
    assert 'chicken' in words and 'tikka' in words and 'masala' in words


def test_tokens_namespaces_slugs_and_words():
    toks = tokens(['1 lb chicken thigh'], 'Chicken Curry')
    assert any(t.startswith('slug:') for t in toks)
    assert any(t.startswith('word:') for t in toks)


# ---------- lexicon (silver labels, brief S5b-2 #1b/#2) ----------

def test_lexicon_matches_dish_names_and_demonyms():
    assert L.find_label('Authentic Pad Thai with Shrimp') == ('thai', 'pad thai')
    assert L.find_label('Grandma\'s Chicken Tikka Masala') == ('indian', 'tikka masala')
    assert L.find_label('Plain Roast Chicken') == (None, None)


def test_lexicon_excludes_generic_ingredient_words():
    """The exact false positives S5b's report called out: an ingredient adjective must not
    be read as a cuisine marker."""
    for title in ('Italian Sausage and Peppers', 'French Fries', 'American Cheese Dip',
                  'Swiss Chard Saute', 'Spanish Onion Soup'):
        assert L.find_label(title) == (None, None), title


def test_marker_words_strip_from_title_tokens_no_leakage():
    label, marker = L.find_label('Best Ever Pad Thai Noodles')
    assert label == 'thai'
    toks = tokens(['1 lb rice noodles'], 'Best Ever Pad Thai Noodles',
                  exclude_words=L.marker_words(marker))
    assert 'word:pad' not in toks and 'word:thai' not in toks
    assert 'word:noodles' in toks  # the rest of the title still contributes


# ---------- build_dataset (silver capping, brief S5b-2 #1b) ----------

def _row(id_, label, silver):
    return {'id': id_, 'label': label, 'silver': silver}


def test_cap_classes_caps_silver_at_5x_smallest_and_returns_surplus():
    gold = [_row(f'g{i}', 'tiny', False) for i in range(2)]  # total 2 -- the cap's anchor
    silver = ([_row(f's{i}', 'small', True) for i in range(20)] +  # total 20
              [_row(f'b{i}', 'big', True) for i in range(50)])     # total 50
    kept, surplus, n_gold_trimmed = cap_classes(gold, silver, multiple=5)
    # smallest nonzero class total is 'tiny' at 2 -> cap = 10
    assert sum(1 for r in kept if r['label'] == 'tiny') == 2
    assert sum(1 for r in kept if r['label'] == 'small') == 10
    assert sum(1 for r in kept if r['label'] == 'big') == 10
    assert len(surplus) == (20 - 10) + (50 - 10)
    assert n_gold_trimmed == 0


def test_cap_classes_trims_gold_when_silver_alone_cant_reach_cap():
    gold = ([_row(f'g{i}', 'huge', False) for i in range(100)] +
            [_row('t0', 'tiny', False)])
    kept, surplus, n_gold_trimmed = cap_classes(gold, [], multiple=5)
    # smallest nonzero is 'tiny' at 1 -> cap = 5, so 'huge' (all gold, no silver) must be
    # trimmed to 5 even though gold rows are normally kept whole.
    assert sum(1 for r in kept if r['label'] == 'huge') == 5
    assert n_gold_trimmed == 95
    assert surplus == []


# ---------- classifier ----------

@pytest.fixture(scope='module')
def model():
    return load_model()


def test_model_file_under_20mb():
    size = os.path.getsize(os.path.join(HERE, 'model.json'))
    assert size < 20 * 1024 * 1024


def test_classify_returns_canonical_label_or_unknown(model):
    result = classify(['1 lb chicken thigh', '2 tbsp garam masala', '1 cup yogurt'],
                       'Chicken Tikka Masala', model)
    assert result['label'] in CANON or result['label'] == UNKNOWN
    assert 0.0 <= result['confidence'] <= 1.0


def test_classify_empty_recipe_is_unknown(model):
    assert classify([], '', model)['label'] == UNKNOWN


def test_classify_is_deterministic(model):
    lines = ['200g spaghetti', '2 eggs', '100g pancetta', '50g parmesan']
    a = classify(lines, 'Spaghetti Carbonara', model)
    b = classify(lines, 'Spaghetti Carbonara', model)
    assert a == b


def test_eval_meets_or_reports_the_bar():
    """The bar is >=80% accuracy among scored, <=30% unknown (brief S5b-2). With ~19,138
    labelled recipes (up from S5b's 823 -- more sources, silver labels, class capping; see
    orch/reports/S5b-2.md) the held-out split clears both halves of the bar. This asserts the
    numbers are computed and sane either way, and additionally that the bar holds now that it
    is expected to."""
    with open(os.path.join(HERE, 'eval.json'), encoding='utf-8') as fh:
        ev = json.load(fh)
    assert ev['n_held_out'] > 0
    assert 0.0 <= ev['accuracy_among_scored'] <= 1.0
    assert 0.0 <= ev['unknown_rate'] <= 1.0
    assert ev['unknown_rate'] <= 0.30, 'unknown-rate half of the bar should hold'
    assert ev['accuracy_among_scored'] >= 0.80, 'accuracy half of the bar should hold now'


def test_hand_check_eval_meets_the_bar():
    """The new 300-recipe hand-checked set (brief S5b-2 #2): sources and titles not used in
    training (drawn from build_dataset.py's silver_surplus.jsonl -- lexicon matches the
    per-class cap left out of training). Also asserted against the bar."""
    path = os.path.join(HERE, 'hand_check_eval.json')
    with open(path, encoding='utf-8') as fh:
        ev = json.load(fh)
    assert ev['n_total'] > 0
    assert 0.0 <= ev['accuracy_among_scored'] <= 1.0
    assert 0.0 <= ev['unknown_rate'] <= 1.0
    assert ev['unknown_rate'] <= 0.30
    assert ev['accuracy_among_scored'] >= 0.80


# ---------- season ----------

def test_season_yaml_validates():
    assert S.validate(S.load()) == []


def test_asparagus_peaks_in_spring_not_winter():
    assert S.is_in_season('asparagus', 5)
    assert not S.is_in_season('asparagus', 12)


def test_recipe_in_season_produce_intersects_only_given_slugs():
    slugs = ['asparagus', 'chicken_thigh', 'garlic']
    in_season = S.recipe_in_season_produce(slugs, 5)
    assert 'asparagus' in in_season
    assert 'chicken_thigh' not in in_season  # not produce, never returned
    assert set(in_season) <= set(slugs)


def test_unknown_slug_is_never_in_season():
    assert S.recipe_in_season_produce(['not_a_real_slug'], 6) == []
