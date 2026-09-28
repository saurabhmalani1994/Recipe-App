"""Fetch Food.com review ratings and aggregate them per recipe (brief S8 #1).

Source: the Hugging Face dataset peterpeeterspeter/recipe-interactions, a public mirror (no
Kaggle auth) of `interactions_train.csv` from the Food.com "Recipes and Interactions" dataset
(Majumder et al. 2019, the RAW_interactions split used for training): 698,901 reviews on
160,901 recipes, columns user_id, recipe_id, date, rating, u, i. `recipe_id` is Food.com's own
numeric id, the number at the end of a food.com URL ("haluski-407129" -> 407129), so the join
to recipenlg's food.com records is exact. The full RAW_interactions (1.1M reviews) and
RAW_recipes were not found on a reachable mirror; this train split is ~62% of the reviews.

A rating of 0 in that data means a review with no star rating: it counts as a review
(n_reviews) but not in the mean (n_rated, mean).

Output: <raw>/foodcom_ratings/ratings.tsv, sorted by recipe_id, header
`recipe_id  n_reviews  n_rated  mean_rating`. No recipes.jsonl is written there, so the corpus
build does not see this directory as a recipe source.

Run: python3 ingest/fetch/fetch_foodcom_ratings.py   (idempotent; re-downloads only if missing)
"""
from __future__ import annotations

import os
import sys
import urllib.request

RAW = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
URL = ('https://huggingface.co/datasets/peterpeeterspeter/recipe-interactions/resolve/main/'
       'data/train-00000-of-00001.parquet')
DIR = os.path.join(RAW, 'foodcom_ratings')
PARQUET = os.path.join(DIR, 'interactions_train.parquet')
OUT = os.path.join(DIR, 'ratings.tsv')
TIMEOUT = 120


def download(url=URL, path=PARQUET):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.part'
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r, open(tmp, 'wb') as fh:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            fh.write(b)
    os.replace(tmp, path)
    return path


def aggregate(rows):
    """rows: iterable of (recipe_id, rating). Returns {recipe_id: (n_reviews, n_rated, mean)}."""
    acc = {}
    for rid, rating in rows:
        rid = int(rid)
        n, nr, s = acc.get(rid, (0, 0, 0.0))
        n += 1
        if rating is not None and float(rating) > 0:
            nr += 1
            s += float(rating)
        acc[rid] = (n, nr, s)
    return {rid: (n, nr, round(s / nr, 4) if nr else None) for rid, (n, nr, s) in acc.items()}


def write_tsv(agg, path=OUT):
    tmp = path + '.part'
    with open(tmp, 'w', encoding='utf-8') as fh:
        fh.write('recipe_id\tn_reviews\tn_rated\tmean_rating\n')
        for rid in sorted(agg):
            n, nr, mean = agg[rid]
            fh.write(f'{rid}\t{n}\t{nr}\t{"" if mean is None else mean}\n')
    os.replace(tmp, path)


def load(path=OUT):
    """{food.com recipe id: (n_reviews, n_rated, mean or None)}; {} when the file is absent."""
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as fh:
        next(fh, None)
        for line in fh:
            rid, n, nr, mean = line.rstrip('\n').split('\t')
            out[int(rid)] = (int(n), int(nr), float(mean) if mean else None)
    return out


def main():
    import pyarrow.parquet as pq
    download()
    t = pq.read_table(PARQUET, columns=['recipe_id', 'rating'])
    agg = aggregate(zip(t.column('recipe_id').to_pylist(), t.column('rating').to_pylist()))
    write_tsv(agg)
    n_rev = sum(v[0] for v in agg.values())
    print(f'{t.num_rows:,} reviews, {len(agg):,} recipes, {n_rev:,} aggregated -> {OUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
