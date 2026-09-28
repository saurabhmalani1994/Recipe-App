"""EXPLAIN QUERY PLAN and time the matching query (match.sql) on a built corpus.db.

Run: python3 -m ingest.build.explain_match [DB]   (default: the 5k sample build)

Prints the plan once, then the median of 20 runs for each planted kitchen, with every filter on
and with every filter off, and the per-slug posting-list lookup the query starts from.
"""
import json
import os
import sqlite3
import statistics
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
MATCH_SQL = os.path.join(HERE, 'match.sql')
DEFAULT_DB = '/home/user/recipe-data/derived/corpus_sample.db'

KITCHENS = {
    'weeknight pantry': ['chicken_breast', 'onion', 'garlic', 'tomatoes', 'canned_tomatoes', 'rice', 'egg',
                         'butter', 'all_purpose_flour', 'milk', 'cheddar', 'lemon', 'potato',
                         'carrot', 'soy_sauce', 'sugar', 'brown_sugar', 'olive_oil', 'pasta', 'parmigiano_reggiano'],
    'baking shelf': ['all_purpose_flour', 'sugar', 'brown_sugar', 'butter', 'egg', 'milk', 'baking_powder',
                     'baking_soda', 'vanilla_extract', 'chocolate_chips', 'cocoa_powder', 'powdered_sugar'],
}
ALL_FILTERS = {'diet': 'vegetarian', 'kitchen': json.dumps(['oven', 'stovetop', 'blender', 'microwave',
                                                            'sheet_pan', 'food_processor', 'hand_mixer']),
               'one_pot': 1, 'cuisine': None, 'max_min': 60, 'max_missing': 3, 'limit': 50}
NO_FILTERS = {'diet': None, 'kitchen': None, 'one_pot': None, 'cuisine': None, 'max_min': None,
              'max_missing': None, 'limit': 50}


def load_query():
    with open(MATCH_SQL, encoding='utf-8') as fh:
        return fh.read()


def run(con, sql, params, n=20):
    times = []
    rows = None
    for _ in range(n):
        t0 = time.perf_counter()
        rows = con.execute(sql, params).fetchall()
        times.append((time.perf_counter() - t0) * 1000)
    return rows, statistics.median(times)


def main(argv):
    db = argv[0] if argv else DEFAULT_DB
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    sql = load_query()
    n = con.execute('SELECT count(*) FROM recipes').fetchone()[0]
    print(f'{db}: {n} recipes')
    params = dict(ALL_FILTERS, have=json.dumps(KITCHENS['weeknight pantry']))
    print('\nEXPLAIN QUERY PLAN (every filter on):')
    for row in con.execute('EXPLAIN QUERY PLAN ' + sql, params):
        print(f'  {row[0]:>3} {row[1]:>3}  {row[3]}')
    print('\nposting list: EXPLAIN QUERY PLAN SELECT recipe_id FROM recipe_slugs WHERE slug = ?')
    for row in con.execute('EXPLAIN QUERY PLAN SELECT recipe_id FROM recipe_slugs WHERE slug = ?', ('onion',)):
        print(f'  {row[3]}')
    print()
    for name, have in KITCHENS.items():
        for label, filt in (('all filters', ALL_FILTERS), ('no filters', NO_FILTERS)):
            rows, ms = run(con, sql, dict(filt, have=json.dumps(have)))
            top = '; '.join(f'{r[2]} (missing {r[7]})' for r in rows[:3])
            print(f'{name}, {label}: {len(rows)} rows, median {ms:.1f} ms. Top: {top}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
