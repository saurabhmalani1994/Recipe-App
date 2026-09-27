"""Score the recipe taggers against the hand-labelled gold set.

Run: python3 ingest/tag/gold/score.py [--misses]

gold.jsonl holds 150 raw recipes (schema/raw_recipe.md) drawn across sources, each with hand
labels. `pick` says why it is there: `random`, or a planted trap / targeted class (stock_alt,
oyster, lard, stove_bake, uk_grill, fp_or_blender, airfryer, mortar).

Labelling conventions (the labels were written by reading each recipe, before the tagger ran):
  equipment  what the method uses. Either/or alternatives in an instruction ("a blender or food
             processor", "under the grill or on the barbecue", "Alternatively, cook in the oven",
             "Or use a pestle and mortar") are all labelled. Serving suggestions, "if you want to
             make this in a slow cooker, see ..." pointers and equipment used as a weight are not.
             UK "grill" (heat the grill, under the grill) is `broiler`; barbecue/coals is `grill`.
             "Bake ... in a skillet" with no oven temperature is a stovetop bake; "bake in an iron
             skillet at 400" is oven. An unnamed "blend" is `blender`; an unnamed "blitz",
             "whizz" or "pulse" is `food_processor`. "Electric whisk/mixer" or a bare "mixer" is
             `hand_mixer`; `stand_mixer` needs "stand mixer", "dough hook", "paddle" or "the bowl
             of a mixer". `no_cook` = no heat source at all (a kettle of boiling water does not
             count as cooking). null = the steps are missing or truncated (openrecipes has no
             steps; foodwishes steps are fragments), so equipment cannot be judged.
  one_pot    exactly one heated cooking vessel or surface over the whole recipe (a pan moved
             from hob to oven counts once; mixing bowls and blenders do not count; boiling pasta
             separately is a second vessel). no_cook recipes are false. null when steps are
             missing.
  diet       per preset, `ok`, `adaptable` or `no`, applying R7/R8 and the S5a brief by hand:
             vegetarian excludes explicit meat, poultry, fish, shellfish and stocks/fats named
             for them (oyster/fish/Worcestershire sauce, gelatin and rennet cheese are fine);
             no_red_meat excludes anything red-meat, gelatin and lard included. `adaptable` =
             every offending item has a way out: an "or Y" alternative in the line, a
             substitution of quality >= 2 in ingest/subs whose context fits the dish, or the
             item is optional/garnish. `unknown` = no ingredient in the list can be read at all.
             Diet is judged from the whole recipe text, never the title: a meat the steps add
             but the ingredient list omits (a scraped list with dropped lines) still counts.

holdout.jsonl: 30 more recipes (bbcgoodfood, themealdb, foodcom, recipenlg), labelled the same
way after the tagger had been tuned on gold.jsonl and scored once, untouched, as an estimate for
unseen recipes. `--holdout` scores it; the bars apply to gold.jsonl only.

Bars, written before the first run (brief S5a):
  diet exact 100% on the diet traps (stock_alt, oyster, lard) and >= 98% overall;
  oven, stovetop, air_fryer, food_processor, blender, mortar_pestle: precision >= 90% and
  recall >= 85% each; one_pot accuracy >= 90%.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

GOLD_PATH = os.path.join(HERE, 'gold.jsonl')
HOLDOUT_PATH = os.path.join(HERE, 'holdout.jsonl')
DIET_TRAPS = ('stock_alt', 'oyster', 'lard')
PRESETS = ('vegetarian', 'no_red_meat')
BAR_EQUIPMENT = ('oven', 'stovetop', 'air_fryer', 'food_processor', 'blender', 'mortar_pestle')
BAR_DIET_TRAPS = 1.0
BAR_DIET = 0.98
BAR_PRECISION = 0.90
BAR_RECALL = 0.85
BAR_ONE_POT = 0.90


def load_gold(path=GOLD_PATH):
    with open(path, encoding='utf-8') as fh:
        return [json.loads(line) for line in fh if line.strip()]


def score(gold, tag_fn):
    """Return (summary dict, misses list)."""
    misses = []
    diet_n = diet_ok = trap_n = trap_ok = 0
    eq_counts = {}
    op_n = op_ok = 0
    all_eq = set()
    for g in gold:
        tags = tag_fn(g['recipe'])
        lab = g['labels']
        for p in PRESETS:
            want = lab['diet'][p]
            got = tags['diet'][p]['status']
            diet_n += 1
            diet_ok += want == got
            if g['pick'] in DIET_TRAPS:
                trap_n += 1
                trap_ok += want == got
            if want != got:
                misses.append((g['n'], g['id'], f'diet.{p}', want, got))
        if lab['equipment'] is not None:
            want = set(lab['equipment'])
            got = set(tags['equipment'])
            all_eq |= want | got
            for e in want | got:
                c = eq_counts.setdefault(e, [0, 0, 0])  # tp, fp, fn
                if e in want and e in got:
                    c[0] += 1
                elif e in got:
                    c[1] += 1
                    misses.append((g['n'], g['id'], 'equipment', f'-{e}', 'extra'))
                else:
                    c[2] += 1
                    misses.append((g['n'], g['id'], 'equipment', f'+{e}', 'missing'))
        if lab['one_pot'] is not None:
            op_n += 1
            op_ok += lab['one_pot'] == tags['one_pot']
            if lab['one_pot'] != tags['one_pot']:
                misses.append((g['n'], g['id'], 'one_pot', lab['one_pot'], tags['one_pot']))
    eq = {}
    for e, (tp, fp, fn) in sorted(eq_counts.items()):
        eq[e] = {'tp': tp, 'fp': fp, 'fn': fn,
                 'precision': tp / (tp + fp) if tp + fp else None,
                 'recall': tp / (tp + fn) if tp + fn else None}
    summary = {'diet': diet_ok / diet_n, 'diet_n': diet_n,
               'diet_traps': trap_ok / trap_n if trap_n else None, 'diet_traps_n': trap_n,
               'one_pot': op_ok / op_n if op_n else None, 'one_pot_n': op_n,
               'equipment': eq}
    return summary, misses


def bars(summary):
    fails = []
    if summary['diet_traps'] is None or summary['diet_traps'] < BAR_DIET_TRAPS:
        fails.append(f"diet traps {summary['diet_traps']}")
    if summary['diet'] < BAR_DIET:
        fails.append(f"diet {summary['diet']:.3f}")
    for e in BAR_EQUIPMENT:
        s = summary['equipment'].get(e)
        if not s or s['precision'] is None or s['precision'] < BAR_PRECISION:
            fails.append(f'{e} precision {s and s["precision"]}')
        if not s or s['recall'] is None or s['recall'] < BAR_RECALL:
            fails.append(f'{e} recall {s and s["recall"]}')
    if summary['one_pot'] is None or summary['one_pot'] < BAR_ONE_POT:
        fails.append(f"one_pot {summary['one_pot']}")
    return fails


def fmt(x):
    return '-' if x is None else f'{x * 100:.1f}%'


def main(argv):
    from ingest.tag.tagger import tag_recipe
    holdout = '--holdout' in argv
    gold = load_gold(HOLDOUT_PATH if holdout else GOLD_PATH)
    summary, misses = score(gold, tag_recipe)
    if '--misses' in argv:
        for m in misses:
            print('MISS', *m)
    print(f"diet overall {fmt(summary['diet'])} of {summary['diet_n']} decisions; "
          f"diet traps {fmt(summary['diet_traps'])} of {summary['diet_traps_n']}")
    print(f"one_pot {fmt(summary['one_pot'])} of {summary['one_pot_n']}")
    for e, s in summary['equipment'].items():
        mark = '*' if e in BAR_EQUIPMENT else ' '
        print(f"{mark} {e:18s} P {fmt(s['precision']):>6s}  R {fmt(s['recall']):>6s}  "
              f"(tp {s['tp']}, fp {s['fp']}, fn {s['fn']})")
    fails = bars(summary)
    if holdout:
        print('holdout: bars not applied (' + ('would pass' if not fails else '; '.join(fails)) + ')')
        return 0
    print('BARS PASSED' if not fails else 'BARS FAILED: ' + '; '.join(fails))
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
