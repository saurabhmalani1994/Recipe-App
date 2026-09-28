"""Pick the corpus from the ranked pool (briefs S8 #4, S8b #3).

select(pool, target) takes pool = [dict(key, source, score, cuisine, course, veg, nrm)] (the
dedupe leaders that passed the junk filters) and returns the chosen keys, in this order:

0. Recipes from EXCLUDED_SOURCES are never taken (R11: the foodcom source has no unit column,
   so its quantities cannot be scaled; rank counts them as curate_excluded_source).
1. Every recipe from the small editorial sources (EDITORIAL_SOURCES) and from every cuisine
   site of ingest/fetch/sites.yaml (brief S10: treated like BBC, everything that passed the junk
   filters and the dedupe).
2. Cuisine floors: every cuisine with data gets its best min(available, CUISINE_FLOOR) recipes
   (recipes already taken in step 1 count toward the floor). R18: a floor never takes a recipe
   scoring below the pool's 25th percentile (FLOOR_MIN_QUANTILE); it keeps fewer instead (S8b's
   lowest kept were Cool Whip salads the fusion_other floor pulled in).
3. The rest by score, best first, guarded so the mix constraints can still be met: while the
   slots left are no more than a constraint's deficit, only recipes that meet it are taken.
   MIX: main course >= 45%; vegetarian ok or adaptable >= 25%; no_red_meat ok or adaptable
   >= 50%. A recipe whose cuisine is in CEILING_CUISINES is skipped once those cuisines
   together hold CEILING of the target (D17: the owner wants the corpus to lean global).
4. If a constraint cannot be met from the pool, the slots it held back are filled by score
   (reason score_unguarded), so the target is always reached when the pool allows. The
   cuisine ceiling still holds here: where the two conflict, the ceiling wins over the mix
   (possible only in a pool that is mostly the capped cuisines, never in the real one).
Ties on score break on the key, so the selection is deterministic.

5. The size cap (brief S10: corpus.db at most 235 MB). Every chosen recipe carries an estimate of
   the bytes it adds to corpus.db (est_bytes); when the chosen set would pass BYTE_BUDGET, the
   target is lowered and the selection redone, so the cut falls on the lowest-scored recipes
   picked by score while editorial, cuisine-site and floor recipes stay. select.size_stats holds
   the numbers.

The ceiling (S8b proposal): american and southern_us together at most 12% of the target
(9,600 of 80,000). The S8 selection held 16.7% (american 9,240, southern_us 4,154), and a
third of it had no cuisine label at all, much of it American home cooking the classifier did
not place, so the labelled share understates the lean; 12% is below the owner's example of
15% for that reason. The editorial sources and the floors count toward it but are never cut.
"""
import math
import os

import yaml

_SITES_YAML = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fetch', 'sites.yaml')


def site_sources(path=_SITES_YAML):
    """The cuisine-site source ids (ingest/fetch/sites.yaml), sorted."""
    with open(path, encoding='utf-8') as fh:
        return tuple(sorted(s['id'] for s in (yaml.safe_load(fh) or {}).get('sites') or []))


SITE_SOURCES = site_sources()
EDITORIAL_SOURCES = ('bbcgoodfood', 'themealdb', 'foodwishes') + SITE_SOURCES
FLOOR_MIN_QUANTILE = 0.25   # R18
EXCLUDED_SOURCES = ('foodcom',)
CUISINE_FLOOR = 1500
CEILING_CUISINES = ('american', 'southern_us')
CEILING = 0.12
TARGET = 80_000
HARD_CAP = 100_000
# The size cap (brief S10). est_bytes was fitted on the first S10 build (79,998 recipes, 287.5 MB,
# before the cap): each recipe's bytes across steps, recipe_ingredients (twice: the FTS indexes the
# lines), recipe_diet, recipe_slugs and its recipes row, scaled to the file, regressed on the
# scan's features. R^2 0.80; mean 3,579 bytes (recipenlg 3,798, bbcgoodfood 2,921, foodwishes
# 2,487). STATIC_BYTES is that build's taxonomy/substitution/season/unit tables. The budget keeps a
# 3% margin under the cap for the estimate's error and for the crawls still appending.
SIZE_CAP_BYTES = 235_000_000
BYTE_BUDGET = int(SIZE_CAP_BYTES * 0.97)
STATIC_BYTES = 823_296
# S19 (schema 4) stores no vegetarian_strict rows and writes swaps with short keys: measured on a
# copy of the S10 build, 13,877,248 bytes over its 64,225 recipes, 216 bytes a recipe, taken off
# the fitted base of 529.
EST_BASE, EST_PER_STEP_CHAR, EST_PER_LINE = 313.0, 0.997, 162.4
OK = ('ok', 'adaptable')
MIX = {
    'main': (0.45, lambda r: r['course'] == 'main'),
    'vegetarian': (0.25, lambda r: r['veg'] in OK),
    'no_red_meat': (0.50, lambda r: r['nrm'] in OK),
}


def _order(r):
    return (-r['score'], r['key'])


def quantile(scores, q):
    """The q-quantile of `scores` by the nearest-rank-below rule rank.py reports
    (sorted descending, index int((1 - q) * (n - 1)))."""
    xs = sorted(scores, reverse=True)
    return xs[int((1 - q) * (len(xs) - 1))] if xs else None


def est_bytes(r):
    """What one recipe adds to corpus.db, estimated from its scan features (see BYTE_BUDGET)."""
    return EST_BASE + EST_PER_STEP_CHAR * (r.get('step_chars') or 0) + EST_PER_LINE * (r.get('n_lines') or 0)


def select(pool, target=TARGET, byte_budget=BYTE_BUDGET, **kw):
    """Returns (chosen keys in pick order, {key: reason}), reason one of editorial,
    cuisine_floor, score, score_unguarded. select.floor_stats holds the R18 numbers of the
    last call (the score bar and how many recipes each floor declined below it), and
    select.size_stats the size cap's: the estimate, the budget and the target it settled on.
    Keywords are _select's."""
    assert target <= HARD_CAP
    by_key = {r['key']: r for r in pool}
    budget = None if byte_budget is None else byte_budget - STATIC_BYTES
    tried = []
    t = target
    for _ in range(12):
        keys, why = _select(pool, target=t, **kw)
        est = sum(est_bytes(by_key[k]) for k in keys)
        tried.append((t, len(keys), round(est)))
        if budget is None or est <= budget:
            break
        scored = [est_bytes(by_key[k]) for k in keys if why[k] in ('score', 'score_unguarded')]
        if not scored:
            break   # nothing left to cut: editorial and floors alone pass the budget (reported)
        t = max(len(keys) - len(scored), t - math.ceil((est - budget) / (sum(scored) / len(scored))) - 1)
    select.size_stats = {'target': target, 'settled_target': t, 'selected': len(keys),
                         'est_bytes': round(est + STATIC_BYTES), 'byte_budget': byte_budget,
                         'size_cap': SIZE_CAP_BYTES, 'within_budget': budget is None or est <= budget,
                         'tries': tried}
    return keys, why


def _select(pool, target=TARGET, floor=CUISINE_FLOOR, editorial=EDITORIAL_SOURCES, mix=MIX,
            excluded=EXCLUDED_SOURCES, ceiling=CEILING, ceiling_cuisines=CEILING_CUISINES,
            floor_min_quantile=FLOOR_MIN_QUANTILE):
    ranked = sorted((r for r in pool if r['source'] not in excluded), key=_order)
    chosen = {}
    # R18: the pool's 25th percentile (a quarter of the pool scores below it)
    bar = quantile((r['score'] for r in ranked), floor_min_quantile) if floor_min_quantile is not None else None
    declined = {}

    for r in ranked:
        if r['source'] in editorial:
            chosen[r['key']] = 'editorial'

    have = {}
    for r in ranked:
        if r['key'] in chosen and r['cuisine']:
            have[r['cuisine']] = have.get(r['cuisine'], 0) + 1
    avail = {}
    for r in ranked:
        if r['cuisine']:
            avail[r['cuisine']] = avail.get(r['cuisine'], 0) + 1
    for r in ranked:
        c = r['cuisine']
        if not c or r['key'] in chosen:
            continue
        if have.get(c, 0) < min(avail[c], floor):
            if bar is not None and r['score'] < bar:
                declined[c] = declined.get(c, 0) + 1   # R18: counted, and the floor stays short
                continue
            chosen[r['key']] = 'cuisine_floor'
            have[c] = have.get(c, 0) + 1
    select.floor_stats = {'bar': bar, 'quantile': floor_min_quantile, 'declined_below_bar': dict(sorted(declined.items())),
                          'short': {c: min(avail[c], floor) - have.get(c, 0) for c in sorted(avail)
                                    if have.get(c, 0) < min(avail[c], floor)}}

    cap = math.floor(ceiling * target) if ceiling is not None else None
    capped = set(ceiling_cuisines or ())
    n_capped = sum(have.get(c, 0) for c in capped)

    def over_cap(r):
        return cap is not None and r['cuisine'] in capped and n_capped >= cap

    need = {k: math.ceil(frac * target) for k, (frac, _) in mix.items()}
    by_key = {r['key']: r for r in ranked}
    count = {k: sum(1 for key in chosen if test(by_key[key])) for k, (_, test) in mix.items()}
    for r in ranked:
        left = target - len(chosen)
        if left <= 0:
            break
        if r['key'] in chosen or over_cap(r):
            continue
        meets = {k: test(r) for k, (_, test) in mix.items()}
        if any(not meets[k] and need[k] - count[k] >= left for k in mix):
            continue
        chosen[r['key']] = 'score'
        n_capped += r['cuisine'] in capped
        for k in mix:
            count[k] += meets[k]
    # A constraint the pool cannot meet must not leave slots empty: fill them by score.
    for r in ranked:
        if len(chosen) >= target:
            break
        if r['key'] not in chosen and not over_cap(r):
            chosen[r['key']] = 'score_unguarded'
            n_capped += r['cuisine'] in capped
    return list(chosen), chosen


def mix_shares(rows):
    n = len(rows) or 1
    return {k: sum(1 for r in rows if test(r)) / n for k, (_, test) in MIX.items()}
