"""Pick the corpus from the ranked pool (briefs S8 #4, S8b #3).

select(pool, target) takes pool = [dict(key, source, score, cuisine, course, veg, nrm)] (the
dedupe leaders that passed the junk filters) and returns the chosen keys, in this order:

0. Recipes from EXCLUDED_SOURCES are never taken (R11: the foodcom source has no unit column,
   so its quantities cannot be scaled; rank counts them as curate_excluded_source).
1. Every recipe from the small editorial sources (EDITORIAL_SOURCES).
2. Cuisine floors: every cuisine with data gets its best min(available, CUISINE_FLOOR) recipes
   (recipes already taken in step 1 count toward the floor).
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

The ceiling (S8b proposal): american and southern_us together at most 12% of the target
(9,600 of 80,000). The S8 selection held 16.7% (american 9,240, southern_us 4,154), and a
third of it had no cuisine label at all, much of it American home cooking the classifier did
not place, so the labelled share understates the lean; 12% is below the owner's example of
15% for that reason. The editorial sources and the floors count toward it but are never cut.
"""
import math

EDITORIAL_SOURCES = ('bbcgoodfood', 'themealdb', 'foodwishes')
EXCLUDED_SOURCES = ('foodcom',)
CUISINE_FLOOR = 1500
CEILING_CUISINES = ('american', 'southern_us')
CEILING = 0.12
TARGET = 80_000
HARD_CAP = 100_000
OK = ('ok', 'adaptable')
MIX = {
    'main': (0.45, lambda r: r['course'] == 'main'),
    'vegetarian': (0.25, lambda r: r['veg'] in OK),
    'no_red_meat': (0.50, lambda r: r['nrm'] in OK),
}


def _order(r):
    return (-r['score'], r['key'])


def select(pool, target=TARGET, floor=CUISINE_FLOOR, editorial=EDITORIAL_SOURCES, mix=MIX,
           excluded=EXCLUDED_SOURCES, ceiling=CEILING, ceiling_cuisines=CEILING_CUISINES):
    """Returns (chosen keys in pick order, {key: reason}), reason one of editorial,
    cuisine_floor, score, score_unguarded."""
    assert target <= HARD_CAP
    ranked = sorted((r for r in pool if r['source'] not in excluded), key=_order)
    chosen = {}

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
            chosen[r['key']] = 'cuisine_floor'
            have[c] = have.get(c, 0) + 1

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
