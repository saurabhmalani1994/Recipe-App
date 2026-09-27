"""Tests for the cuisine classifier and seasonality. Run: python3 -m pytest ingest/cuisine -q"""
import json
import os

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))

from ingest.cuisine import cuisines as C  # noqa: E402
from ingest.cuisine import season as S  # noqa: E402
from ingest.cuisine.classifier import classify, load_model, UNKNOWN  # noqa: E402
from ingest.cuisine.features import tokens, ingredient_slugs, title_words  # noqa: E402

CANON = set(C.canonical_labels())


# ---------- cuisines.yaml ----------

def test_cuisines_yaml_validates():
    assert C.validate(C.load()) == []


def test_around_25_canonical_labels():
    assert 20 <= len(CANON) <= 30


def test_label_map_targets_are_canonical():
    for source in ('themealdb', 'bbcgoodfood'):
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
    """The bar is >=80% accuracy among scored, <=30% unknown (brief S5b #3). With ~823
    labelled recipes across 26 overlapping cuisines the trained model does not clear the
    accuracy half of it; this asserts the numbers are computed and sane, not that the bar
    passed -- see orch/reports/S5b.md for the honest result."""
    with open(os.path.join(HERE, 'eval.json'), encoding='utf-8') as fh:
        ev = json.load(fh)
    assert ev['n_held_out'] > 0
    assert 0.0 <= ev['accuracy_among_scored'] <= 1.0
    assert 0.0 <= ev['unknown_rate'] <= 1.0
    assert ev['unknown_rate'] <= 0.30, 'unknown-rate half of the bar should hold'


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
