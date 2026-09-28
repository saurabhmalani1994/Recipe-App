"""Pick the corpus from the ranked pool (brief S8 #4).

select(pool, target) takes pool = [dict(key, source, score, cuisine, course, veg, nrm)] (the
dedupe leaders that passed the junk filters) and returns the chosen keys, in this order:

1. Every recipe from the small editorial sources (EDITORIAL_SOURCES).
2. Cuisine floors: every cuisine with data gets its best min(available, CUISINE_FLOOR) recipes
   (recipes already taken in step 1 count toward the floor).
3. The rest by score, best first, guarded so the mix constraints can still be met: while the
   slots left are no more than a constraint's deficit, only recipes that meet it are taken.
   MIX: main course >= 45%; vegetarian ok or adaptable >= 25%; no_red_meat ok or adaptable
   >= 50%.
Ties on score break on the key, so the selection is deterministic.
"""
import math

EDITORIAL_SOURCES = ('bbcgoodfood', 'themealdb', 'foodwishes')
CUISINE_FLOOR = 1500
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


def select(pool, target=TARGET, floor=CUISINE_FLOOR, editorial=EDITORIAL_SOURCES, mix=MIX):
    """Returns (chosen keys in pick order, {key: reason}), reason one of editorial,
    cuisine_floor, score."""
    assert target <= HARD_CAP
    ranked = sorted(pool, key=_order)
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

    need = {k: math.ceil(frac * target) for k, (frac, _) in mix.items()}
    by_key = {r['key']: r for r in ranked}
    count = {k: sum(1 for key in chosen if test(by_key[key])) for k, (_, test) in mix.items()}
    for r in ranked:
        left = target - len(chosen)
        if left <= 0:
            break
        if r['key'] in chosen:
            continue
        meets = {k: test(r) for k, (_, test) in mix.items()}
        if any(not meets[k] and need[k] - count[k] >= left for k in mix):
            continue
        chosen[r['key']] = 'score'
        for k in mix:
            count[k] += meets[k]
    return list(chosen), chosen


def mix_shares(rows):
    n = len(rows) or 1
    return {k: sum(1 for r in rows if test(r)) / n for k, (_, test) in MIX.items()}
