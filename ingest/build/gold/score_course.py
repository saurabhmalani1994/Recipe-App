"""Score the course tagger (ingest/build/course.py) against the hand-labelled gold set.

Run: python3 ingest/build/gold/score_course.py [--holdout] [--misses]

course_gold.jsonl holds 100 raw recipes and course_holdout.jsonl 50 more, drawn by
draw_course_gold.py (seed 9) from the 5k build sample after the build's drops. Both were
labelled by reading each recipe (title, source category, ingredients, steps) before the tagger
was written. The tagger is tuned on course_gold.jsonl only; the holdout is scored once at the
end as an estimate for unseen recipes.

Bar, written before the first run (brief S9a #2): accuracy >= 85% on course_gold.jsonl.

Labelling conventions (one course per recipe; the first rule that fits wins):
  drink            anything poured to drink: coffee, tea, cocktails, liqueurs, smoothies, punch.
  sauce_condiment  something that goes on or with another dish: sauces, dressings, marinades,
                   salsas, pestos, chutneys, jams, pickles, spice mixes, gravies, flavoured
                   butters, and sweet toppings (icing, frosting, glaze, caramel sauce).
  breakfast        pancakes, waffles, French toast, porridge and oats, granola, and dishes the
                   source or title calls breakfast or brunch.
  dessert          sweet dishes: cakes, cookies and sweet biscuits, bars and traybakes, brownies,
                   sweet pies and tarts, puddings, ice cream, candy and confectionery, sweet
                   "salads" (jello, pretzel salad), sweet dumplings.
  baking           breads, rolls and yeast buns (sweet or not), sweet or savoury loaves and quick
                   breads, muffins, scones, savoury biscuits, and doughs and pastry made to be
                   used in something else (pie crust, pizza and pasta dough).
  snack            appetizers and starters, dips, canapes, finger food, fritters served as a
                   starter, candied or spiced nuts, party mixes.
  side             vegetable, potato, rice, grain and bean dishes served alongside a main; side
                   salads and slaws; casseroles of a vegetable with no protein.
  main             the centre of a meal: meat, poultry, fish and seafood dishes, pasta with a
                   sauce, curries, stews, casseroles with a protein, pies and quiches, burgers
                   and sandwiches, main salads with a protein. Every soup is main (a soup that is
                   a starter in one book is supper in another; this keeps the rule checkable).
"""
import argparse
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

GOLD = os.path.join(HERE, 'course_gold.jsonl')
HOLDOUT = os.path.join(HERE, 'course_holdout.jsonl')
BAR = 0.85


def load(path):
    with open(path, encoding='utf-8') as fh:
        return [json.loads(line) for line in fh if line.strip()]


def score(rows):
    from ingest.build.course import tag_course
    hits = 0
    misses = []
    confusion = collections.Counter()
    for row in rows:
        got = tag_course(row['recipe'])['course']
        confusion[(row['course'], got)] += 1
        if got == row['course']:
            hits += 1
        else:
            misses.append((row['n'], row['recipe']['title'], row['course'], got))
    return hits, misses, confusion


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--holdout', action='store_true')
    ap.add_argument('--misses', action='store_true')
    args = ap.parse_args(argv)
    rows = load(HOLDOUT if args.holdout else GOLD)
    hits, misses, _ = score(rows)
    acc = hits / len(rows)
    name = 'holdout' if args.holdout else 'gold'
    if args.misses:
        for n, title, want, got in misses:
            print(f'  [{n}] {title!r}: want {want}, got {got}')
    ok = acc >= BAR
    print(f'course {name}: {hits}/{len(rows)} = {acc:.1%} (bar {BAR:.0%}) '
          f'{"PASSED" if ok else "MISSED"}')
    return 0 if (ok or args.holdout) else 1


if __name__ == '__main__':
    sys.exit(main())
