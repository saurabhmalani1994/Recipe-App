"""Score the course tagger (ingest/build/course.py) against the hand-labelled gold set.

Run: python3 ingest/build/gold/score_course.py [--holdout | --blind] [--misses]

course_gold.jsonl holds 100 raw recipes and course_holdout.jsonl 50 more, drawn by
draw_course_gold.py (seed 9) from the 5k build sample after the build's drops. Both were
labelled by reading each recipe (title, source category, ingredients, steps) before the tagger
was written. The tagger is tuned on course_gold.jsonl only; the holdout is scored once at the
end as an estimate for unseen recipes. The holdout's titles were seen while the word lists
were written, so course_blind.jsonl (50 more, seed 10) was drawn and labelled only after the
tagger was frozen, and scored once.

Scored once each: holdout 42/50 = 84.0% (before the trigram and protein fixes); blind
41/50 = 82.0% (frozen tagger). The bar applies to course_gold.jsonl only.

course_blind2.jsonl (brief S10b #2) is a second, later blind set: 60 recipes drawn straight
from the built S10 corpus (draw_course_blind2.py; a different pool from the 150+50 above, which
came from the pre-build 5k sample), labelled after the S10b modifier rules (summer/spring
rolls, dumplings, "breakfast X", jello/pudding salads) were frozen. Also scored once, and this
one is the one the S10b bar (>= 85%) is checked against -- --blind still reports course_blind.jsonl
(the S9a one) for comparison, unchanged.

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
BLIND = os.path.join(HERE, 'course_blind.jsonl')
BLIND2 = os.path.join(HERE, 'course_blind2.jsonl')
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
    ap.add_argument('--blind', action='store_true')
    ap.add_argument('--blind2', action='store_true')
    ap.add_argument('--misses', action='store_true')
    args = ap.parse_args(argv)
    path = BLIND2 if args.blind2 else BLIND if args.blind else HOLDOUT if args.holdout else GOLD
    rows = load(path)
    hits, misses, _ = score(rows)
    acc = hits / len(rows)
    name = 'blind2' if args.blind2 else 'blind' if args.blind else 'holdout' if args.holdout else 'gold'
    if args.misses:
        for n, title, want, got in misses:
            print(f'  [{n}] {title!r}: want {want}, got {got}')
    ok = acc >= BAR
    print(f'course {name}: {hits}/{len(rows)} = {acc:.1%} (bar {BAR:.0%}) '
          f'{"PASSED" if ok else "MISSED"}')
    return 0 if (ok or args.holdout or args.blind) else 1


if __name__ == '__main__':
    sys.exit(main())
