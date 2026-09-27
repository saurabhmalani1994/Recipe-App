"""Build the labelled training set from raw recipes whose source cuisine label maps to the
canonical list (cuisines.yaml), plus silver-labelled recipes from a dish-name/demonym lexicon
matched against titles in the sources with no cuisine field of their own (brief S5b-2 #1b).
Writes ingest/cuisine/dataset.jsonl: one row per labelled recipe,
{id, source, label, title, tokens, silver}.

Gold sources (a real, source-native cuisine field): themealdb, bbcgoodfood (checked against
openrecipes and recipenlg in S5b: neither has one -- recipenlg's `tags` are ingredient words,
not cuisine tags) and hf_cuisine_type (brief S5b-2 #1a, fetch_hf_cuisine.py; run that once,
separately, before this -- it is the only network call in this package). Every recipe read is
counted: kept, label unmapped, or no ingredients/title to build features from (rule 11).

Silver sources: recipenlg, openrecipes, matched by lexicon.find_label() against the title
(brief S5b-2 #1b). To avoid leakage, the marker's own words are stripped from that row's
title tokens before it's written (features.tokens(..., exclude_words=...)) -- the model has to
learn the cuisine from the rest of the title and the ingredients, not from the word that
produced the label. Every class (gold + silver together) is capped at 5x the smallest
nonzero class (brief S5b-2 #1b, see cap_classes()): silver is trimmed first, deterministically
by id; gold is trimmed too if a class is still over cap with no silver left (e.g.
hf_cuisine_type alone hands `american` far more gold rows than the cap allows). The silver
surplus is written out separately (see SURPLUS_PATH -- outside git, it's tens of MB) as the
pool the new 300-recipe hand-checked eval set is drawn from, so that set never overlaps a
title used in training (brief S5b-2 #2); trimmed gold is simply dropped, since it's from a
training-used source and so isn't independent eval material either way.

Usage:
  python3 -m ingest.cuisine.build_dataset
"""
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine import cuisines as C  # noqa: E402
from ingest.cuisine import lexicon as L  # noqa: E402
from ingest.cuisine.features import tokens  # noqa: E402

RAW_ROOT = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
OUT_PATH = os.path.join(HERE, 'dataset.jsonl')
# Large (tens of MB) and fully reproducible from the raw data, so -- like everything else
# under /home/user/recipe-data -- it lives outside git, never committed (role card). Only the
# 300 rows hand_check.py samples from it (hand_checked.jsonl) are a committed artifact.
SURPLUS_PATH = os.environ.get(
    'RECIPE_SILVER_SURPLUS_PATH',
    os.path.join(os.path.dirname(RAW_ROOT.rstrip('/')), 'derived', 'cuisine_silver_surplus.jsonl'))
# Sources whose raw jsonl carries a real, source-native cuisine field, per schema/raw_recipe.md.
GOLD_SOURCES = ('themealdb', 'bbcgoodfood', 'hf_cuisine_type')
# Sources with no cuisine field, mined for silver labels by lexicon.find_label() on the title.
SILVER_SOURCES = ('recipenlg', 'openrecipes')
SILVER_CAP_MULTIPLE = 5


def _iter_source(path, drop):
    if not os.path.exists(path):
        drop('file missing')
        return
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                drop('bad json')


def build_gold(raw_root, sources, drops):
    rows = []
    for source in sources:
        path = os.path.join(raw_root, source, 'recipes.jsonl')

        def drop(reason, source=source):
            drops[f'{source}: {reason}'] = drops.get(f'{source}: {reason}', 0) + 1

        for rec in _iter_source(path, drop):
            raw_label = rec.get('cuisine_label')
            canon = C.to_canonical(source, raw_label)
            if canon is None:
                drop(f'unmapped label {raw_label!r}' if raw_label else 'no cuisine_label')
                continue
            toks = tokens(rec.get('ingredients'), rec.get('title'))
            if not toks:
                drop('no usable tokens')
                continue
            rows.append({
                'id': rec['id'], 'source': source, 'label': canon,
                'title': rec.get('title', ''), 'tokens': toks, 'silver': False,
            })
    return rows


def build_silver(raw_root, sources, drops):
    """One row per distinct title (across all silver sources) that the lexicon labels.
    Deterministically ordered by id, ready for build()'s cap/trim step."""
    rows = []
    seen_titles = set()
    for source in sources:
        path = os.path.join(raw_root, source, 'recipes.jsonl')

        def drop(reason, source=source):
            drops[f'{source}: {reason}'] = drops.get(f'{source}: {reason}', 0) + 1

        for rec in _iter_source(path, drop):
            title = rec.get('title', '')
            key = title.strip().lower()
            if not key:
                drop('no title')
                continue
            label, marker = L.find_label(title)
            if label is None:
                drop('no lexicon marker in title')
                continue
            if key in seen_titles:
                drop('duplicate title, already silver-labelled from another source')
                continue
            toks = tokens(rec.get('ingredients'), title, exclude_words=L.marker_words(marker))
            if not toks:
                drop('no usable tokens')
                continue
            seen_titles.add(key)
            rows.append({
                'id': rec['id'], 'source': source, 'label': label,
                'title': title, 'tokens': toks, 'silver': True, 'marker': marker,
                # kept (only on silver rows) so surplus rows can be re-classified end-to-end
                # for the hand-check eval set, rather than reusing the leak-stripped tokens.
                'ingredients': rec.get('ingredients') or [],
            })
    rows.sort(key=lambda r: r['id'])
    return rows


def cap_classes(gold_rows, silver_rows, multiple=SILVER_CAP_MULTIPLE):
    """Cap every class's total (gold + silver) at `multiple` x the smallest nonzero class
    total (brief S5b-2 #1b: "cap each class", not just each silver class -- a class this
    lopsided, e.g. hf_cuisine_type alone hands `american` 19,038 gold rows against
    `east_west_african`'s 44, would otherwise still dominate the trained class priors even
    with silver capped). Silver is trimmed first (kept in id order for determinism, and the
    trimmed rows are returned as surplus for reuse as hand-check eval material); gold is
    trimmed only if a class is still over cap with zero silver left, and that trimmed gold is
    simply dropped (counted), not reused -- it's from the training-used sources, so it can't
    serve as an independent eval set anyway (brief S5b-2 #2). Returns
    (kept_rows, surplus_silver, n_gold_trimmed)."""
    gold_by_label = defaultdict(list)
    for r in gold_rows:
        gold_by_label[r['label']].append(r)
    silver_by_label = defaultdict(list)
    for r in silver_rows:
        silver_by_label[r['label']].append(r)
    all_labels = set(gold_by_label) | set(silver_by_label)
    totals = {label: len(gold_by_label.get(label, [])) + len(silver_by_label.get(label, []))
              for label in all_labels}
    nonzero = [n for n in totals.values() if n > 0]
    if not nonzero:
        return list(gold_rows) + list(silver_rows), [], 0
    smallest = min(nonzero)
    cap = multiple * smallest

    kept, surplus_silver = [], []
    n_gold_trimmed = 0
    for label in all_labels:
        gold = sorted(gold_by_label.get(label, []), key=lambda r: r['id'])
        silver = sorted(silver_by_label.get(label, []), key=lambda r: r['id'])
        total = len(gold) + len(silver)
        if total <= cap:
            kept.extend(gold)
            kept.extend(silver)
            continue
        # Trim silver first, down to whatever room is left under the cap after gold.
        silver_allowed = max(cap - len(gold), 0)
        kept.extend(silver[:silver_allowed])
        surplus_silver.extend(silver[silver_allowed:])
        # If gold alone is still over cap (no silver left to trim), trim gold too.
        gold_allowed = min(len(gold), cap)
        kept.extend(gold[:gold_allowed])
        n_gold_trimmed += len(gold) - gold_allowed
    kept.sort(key=lambda r: r['id'])
    surplus_silver.sort(key=lambda r: r['id'])
    return kept, surplus_silver, n_gold_trimmed


def build(out_path=OUT_PATH, surplus_path=SURPLUS_PATH, raw_root=RAW_ROOT,
          gold_sources=GOLD_SOURCES, silver_sources=SILVER_SOURCES):
    drops = {}
    gold_rows = build_gold(raw_root, gold_sources, drops)
    silver_rows = build_silver(raw_root, silver_sources, drops)
    rows, surplus_silver, n_gold_trimmed = cap_classes(gold_rows, silver_rows)
    if surplus_silver:
        drops['silver: over the 5x-smallest-class cap, held out for hand-check eval'] = len(surplus_silver)
    if n_gold_trimmed:
        drops['gold: over the 5x-smallest-class cap even with all its silver trimmed'] = n_gold_trimmed
    with open(out_path, 'w', encoding='utf-8') as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + '\n')
    os.makedirs(os.path.dirname(surplus_path), exist_ok=True)
    with open(surplus_path, 'w', encoding='utf-8') as out:
        for row in surplus_silver:
            out.write(json.dumps(row, ensure_ascii=False) + '\n')
    return rows, drops


def main(argv):
    rows, drops = build()
    by_label = Counter(r['label'] for r in rows)
    n_silver = sum(1 for r in rows if r['silver'])
    print(f'kept {len(rows)} labelled recipes ({len(rows) - n_silver} gold, {n_silver} silver) '
          f'-> {OUT_PATH}')
    for label, n in by_label.most_common():
        n_s = sum(1 for r in rows if r['label'] == label and r['silver'])
        print(f'  {label:22s} {n:5d}  (silver {n_s})')
    print('drops:')
    for reason, n in sorted(drops.items(), key=lambda kv: -kv[1]):
        print(f'  {reason}: {n}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
