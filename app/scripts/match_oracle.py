"""Independent oracle for the S6 engine's planted kitchens (src/features/cook/engine.test.ts).

Written before the engine was run: it recomputes coverage, filters and candidate counts straight
from fixture.db with plain Python, so the expected values in the test do not come from the
engine under test. Substitutions are not modelled here; the test states those by hand.

    python3 app/scripts/match_oracle.py
"""
import json
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / 'src' / 'corpus' / 'fixture.db'
c = sqlite3.connect(DB)

parent = dict(c.execute('SELECT slug, parent FROM ingredients WHERE parent IS NOT NULL'))
children = {}
for s, p in parent.items():
    children.setdefault(p, []).append(s)
staples = {s for (s,) in c.execute('SELECT slug FROM ingredients WHERE is_staple = 1')}


def expand(have):
    out = set(staples)
    for h in have:
        out.add(h)
        x = parent.get(h)
        while x and x not in out:
            out.add(x)
            x = parent.get(x)
        out.update(children.get(h, []))
    return out


recipes = {r[0]: r for r in c.execute(
    'SELECT id, key, title, course, cuisine, total_min, quality, one_pot, unresolved_count FROM recipes')}
core = {}
for rid, slug in c.execute('SELECT recipe_id, slug FROM recipe_slugs WHERE core = 1'):
    core.setdefault(rid, set()).add(slug)
equip = {}
for rid, e in c.execute('SELECT recipe_id, equipment FROM recipe_equipment'):
    equip.setdefault(rid, set()).add(e)
diet = {(rid, p): s for rid, p, s in c.execute('SELECT recipe_id, preset, status FROM recipe_diet')}


def run(have, cuisine=None, diet_p=None, kitchen=None, use_only=None, one_pot=False, max_min=None):
    h = expand(have)
    out = []
    for rid, (_, key, title, course, cui, tmin, q, op, unres) in recipes.items():
        cs = core.get(rid, set())
        covered = len(cs & h)
        if covered == 0:
            continue
        if diet_p and diet.get((rid, diet_p)) not in ('ok', 'adaptable'):
            continue
        if one_pot and not (op == 1 and course == 'main'):
            continue
        if cuisine and cui != cuisine:
            continue
        if max_min is not None and (tmin is None or tmin > max_min):
            continue
        eq = equip.get(rid, set())
        if kitchen and not eq <= set(kitchen):
            continue
        if use_only and not (eq <= set(use_only) and eq & set(use_only)):
            continue
        needed = len(cs) + unres
        missing = needed - covered
        out.append((-covered / needed, missing, -q, rid, key, title, covered, needed))
    out.sort()
    return out


def show(name, rows, n=5):
    print(f'{name}: candidates={len(rows)}')
    for r in rows[:n]:
        print(f'   {r[4]}  {r[5]!r}  covered {r[6]}/{r[7]}')


pad_thai = core[283]
k1 = sorted(pad_thai - {'fish_sauce'} | {'soy_sauce', 'nori'})
print('K1 have', json.dumps(k1))
rows = run(k1)
show('K1', rows, 8)
print('   pad thai rank', [r[3] for r in rows].index(283) + 1)
show('K1 vegetarian', run(k1, diet_p='vegetarian'))
print('   pad thai present', 283 in [r[3] for r in run(k1, diet_p='vegetarian')])
show('K1 thai', run(k1, cuisine='thai'))
show('K1 vietnamese', run(k1, cuisine='vietnamese'))
show('K1 one-pot', run(k1, one_pot=True))
show('K1 <=30 min', run(k1, max_min=30))
show('K1 kitchen stovetop', run(k1, kitchen=['stovetop']))
show('K1 use only oven', run(k1, use_only=['oven']))

k2 = sorted(core[278])
print('K2 have', json.dumps(k2))
show('K2 indian', run(k2, cuisine='indian'), 3)
show('K2 indian one-pot', run(k2, cuisine='indian', one_pot=True), 3)
show('K2 any', run(k2), 5)
for have in (['chicken'], ['chicken_cutlet'], ['chicken_thigh']):
    rows = {r[3]: r for r in run(have)}
    r = rows.get(74)
    print(f'K3 have {have}: Chicken Caesar Wraps covered', r[6] if r else 0, 'of', r[7] if r else '-')
for have in (['red_onion'], ['onion']):
    rows = {r[3]: r for r in run(have)}
    print(f'K3 have {have}: Corn Salsa (red_onion) covered', rows[80][6] if 80 in rows else 0,
          '| Sfincione (yellow_onion) covered', rows[119][6] if 119 in rows else 0)
