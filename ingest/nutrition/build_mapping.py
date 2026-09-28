"""Map every taxonomy slug to a USDA Foundation/SR Legacy food, and write the small artifact
ingest/build/build_corpus.py's fill hook reads at build time (no USDA CSVs needed there).

Run:
  python3 -m ingest.nutrition.build_mapping [--report PATH]

For each slug (ingest/taxonomy/ingredients.yaml), in order:
  1. ingest/nutrition/overrides.yaml, hand-checked: {slug: fdc_id} or {slug: null} to mark a
     slug as deliberately unmapped (spice blends, "nonfood", water, ice).
  2. usda_hint, when the taxonomy sets one: a scored match of the hint text against every food's
     description.
  3. the slug's own name + synonyms, same scoring.
A candidate must score at or above MIN_SCORE to be accepted; below that the slug is left
unmapped (it will not contribute grams, and lowers a recipe's nutrition coverage) rather than
guessing. `nonfood` slugs (garnish picks, cheesecloth, ...) are skipped outright.

Writes two files read by ingest/nutrition/estimate.py:
  mapping.json        {slug: {fdc_id, score, via, description}}    -- for the coverage report
  slug_nutrients.json {slug: {kcal, protein_g, ...}}                -- per 100 g, the fill's input
"""
import argparse
import json
import os

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
MAPPING_PATH = os.path.join(HERE, 'mapping.json')
NUTRIENTS_PATH = os.path.join(HERE, 'slug_nutrients.json')
OVERRIDES_PATH = os.path.join(HERE, 'overrides.yaml')

try:
    from . import usda as U
    from ..taxonomy import taxonomy as T
    from ..taxonomy.normalize import norm_tokens
except ImportError:  # run as a script
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
    from ingest.nutrition import usda as U  # noqa: E402
    from ingest.taxonomy import taxonomy as T  # noqa: E402
    from ingest.taxonomy.normalize import norm_tokens  # noqa: E402

MIN_SCORE = 0.55
# Words that help a description match a *raw ingredient* over a prepared dish it also names
# ("Cheese, cheddar" over "Macaroni and cheese, cheddar"); a light bonus, not a filter.
GENERIC_BONUS_WORDS = {'raw', 'whole'}
# Descriptions containing these read as a dish, not an ingredient; a light penalty, not a filter,
# so a slug with nothing better still gets its closest match.
DISH_PENALTY_WORDS = {'soup', 'stew', 'casserole', 'pie', 'sandwich', 'pizza', 'salad', 'dinner',
                      'dish', 'meal', 'dressing', 'baby food', 'formula', 'restaurant', 'fast foods'}
# A sanity backstop for the meat/fish token acting as the one shared word that made a match
# (rotini's "spiral" also names a ham slice cut; curry leaves' "leaf" also names pork leaf fat):
# a plant, grain or sweet slug never means a meat or fish description, whatever the token score.
MEAT_FISH_WORDS = {'pork', 'beef', 'lamb', 'veal', 'chicken', 'turkey', 'duck', 'goat', 'mutton',
                   'venison', 'bacon', 'sausage', 'ham', 'fish', 'salmon', 'tuna', 'shrimp',
                   'crab', 'lobster', 'shellfish', 'bison', 'rabbit', 'anchovy', 'poultry'}
NON_MEAT_CATEGORIES = {'vegetable', 'fruit', 'grain', 'cereal', 'pasta_noodle', 'legume', 'herb',
                       'spice', 'spice_blend', 'nut_seed', 'sweetener', 'beverage',
                       'dessert_sweet', 'bakery', 'snack', 'fat_oil', 'vinegar_acid'}


# Dropped before scoring: connective words common to both a taxonomy synonym ("dal of choice",
# "stock or broth") and an unrelated USDA description ("choice, raw"), which otherwise pad up an
# accidental match. Real ingredient words are never this short and generic.
STOPWORDS = {'of', 'or', 'and', 'with', 'without', 'to', 'a', 'the', 'in', 'for', 'choice',
            'select', 'style', 'plain', 'other', 'not', 'further', 'no', 'nfs', 'mix', 'mixed',
            'frozen', 'pack', 'packed', 'solid', 'solids', 'liquid', 'liquids', 'drained',
            'added', 'concentrate', 'concentrated', 'blend', 'non', 'alcoholic', 'variety'}


def _tokset(text):
    return {t for t in norm_tokens(text) if t not in STOPWORDS and len(t) > 1}


def score(query_tokens, desc_tokens, data_type, category=None):
    """How well a short query (an ingredient name) is covered by a food's (often long,
    comma-listed) description: mostly "are the query's words all in there", with a small
    preference for a shorter, more generic description when two foods tie."""
    if not query_tokens or not desc_tokens:
        return 0.0
    inter = query_tokens & desc_tokens
    if not inter:
        return 0.0
    recall = len(inter) / len(query_tokens)      # every query word found -> 1.0
    # A short query (1-2 words: most ingredient names) needs every word present, or a single
    # shared common word ("pods", "leaf") between two unrelated foods reads as a match. A longer
    # query (a descriptive synonym) may drop one word.
    min_recall = 1.0 if len(query_tokens) <= 2 else 0.75
    if recall < min_recall:
        return 0.0
    if (category in NON_MEAT_CATEGORIES and (desc_tokens & MEAT_FISH_WORDS)
            and not (query_tokens & MEAT_FISH_WORDS)):
        return 0.0
    precision = len(inter) / len(desc_tokens)     # the description isn't mostly unrelated words
    s = 0.75 * recall + 0.25 * precision
    if desc_tokens & GENERIC_BONUS_WORDS:
        s += 0.02
    if desc_tokens & DISH_PENALTY_WORDS:
        s -= 0.08
    if data_type == 'foundation_food':
        s += 0.01  # Foundation values are lab-measured; a tied score prefers it
    return s


def best_match(queries, foods, desc_tokens_cache, category=None):
    """Best (score, fdc_id) over every query string (a name and its synonyms)."""
    qsets = [_tokset(q) for q in queries]
    best = (0.0, None)
    for fdc_id, f in foods.items():
        dt = desc_tokens_cache[fdc_id]
        for q in qsets:
            s = score(q, dt, f['data_type'], category=category)
            if s > best[0]:
                best = (s, fdc_id)
    return best


def load_overrides():
    if not os.path.exists(OVERRIDES_PATH):
        return {}
    with open(OVERRIDES_PATH, encoding='utf-8') as fh:
        data = yaml.safe_load(fh) or {}
    return data.get('overrides') or {}


def build(log=print):
    ing = T.load()
    foods = U.load()
    desc_tokens = {fdc_id: _tokset(f['description']) for fdc_id, f in foods.items()}
    overrides = load_overrides()

    mapping = {}
    for slug in sorted(ing):
        r = ing[slug]
        if r['category'] == 'nonfood':
            continue
        if slug in overrides:
            fdc_id = overrides[slug]
            if fdc_id is None:
                continue
            fdc_id = int(fdc_id)
            if fdc_id not in foods:
                raise KeyError(f'overrides.yaml: {slug} -> {fdc_id} is not a Foundation/SR Legacy fdc_id')
            mapping[slug] = {'fdc_id': fdc_id, 'score': 1.0, 'via': 'override',
                             'description': foods[fdc_id]['description']}
            continue
        if r.get('usda_hint'):
            queries, via = [r['usda_hint']], 'hint'
        else:
            queries = [r.get('name') or slug.replace('_', ' ')] + list(r.get('synonyms') or [])
            via = 'name'
        s, fdc_id = best_match(queries, foods, desc_tokens, category=r['category'])
        if fdc_id is not None and s >= MIN_SCORE:
            mapping[slug] = {'fdc_id': fdc_id, 'score': round(s, 4), 'via': via,
                             'description': foods[fdc_id]['description']}
    nutrients = {slug: foods[m['fdc_id']]['nutrients'] for slug, m in mapping.items()}
    with open(MAPPING_PATH, 'w', encoding='utf-8') as fh:
        json.dump(mapping, fh, indent=1, sort_keys=True)
        fh.write('\n')
    with open(NUTRIENTS_PATH, 'w', encoding='utf-8') as fh:
        json.dump(nutrients, fh, indent=1, sort_keys=True)
        fh.write('\n')
    log(f'{len(mapping)}/{len(ing) - sum(1 for r in ing.values() if r["category"] == "nonfood")} '
        f'mappable slugs matched (>= {MIN_SCORE}); wrote {MAPPING_PATH} and {NUTRIENTS_PATH}')
    return mapping


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--report')
    args = ap.parse_args(argv)
    mapping = build()
    if args.report:
        ing = T.load()
        lines = ['# USDA mapping (ingest/nutrition/build_mapping.py)\n',
                 f'{len(mapping)} of {len(ing)} taxonomy slugs mapped.\n',
                 '| slug | via | score | fdc description |', '|---|---|---:|---|']
        for slug, m in sorted(mapping.items(), key=lambda kv: -kv[1]['score'])[:40]:
            lines.append(f"| {slug} | {m['via']} | {m['score']:.2f} | {m['description']} |")
        with open(args.report, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines) + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
