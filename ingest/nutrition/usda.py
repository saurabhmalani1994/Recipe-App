"""Load Foundation + SR Legacy foods into {fdc_id: Food}, per 100 g.

Usage:
  from ingest.nutrition import usda
  foods = usda.load()             # {fdc_id: {'description', 'data_type', 'nutrients': {...}}}

Only food.csv, food_nutrient.csv and nutrient.csv are read; the two datasets' food.csv also
carries other USDA record types (sub_sample_food, market_acquisition, ...) that are not generic
foods, so rows are kept only when data_type is 'foundation_food' or 'sr_legacy_food'.
"""
import csv
import os

from . import fetch_usda as F

# nutrient.csv id -> the schema/corpus.sql column it fills. Carbohydrate, by difference (1005) is
# USDA's standard "carbs" figure (total minus fiber is NOT subtracted again here; corpus carbs_g
# is USDA's own by-difference value, as every published label uses).
NUTRIENT_MAP = {
    1003: 'protein_g',   # Protein
    1004: 'fat_g',        # Total lipid (fat)
    1005: 'carbs_g',      # Carbohydrate, by difference
    1079: 'fiber_g',      # Fiber, total dietary
    1063: 'sugar_g',      # Sugars, Total
    1093: 'sodium_mg',    # Sodium, Na
}
# Energy (KCAL): most SR Legacy rows carry 1008 directly. Many newer Foundation Foods rows
# instead carry only the Atwater conversion factors (2047 general, 2048 specific, applied to this
# same food's protein/fat/carb) -- still an energy VALUE for this food, just computed by USDA
# rather than measured, so 1008 is preferred and either Atwater id is the fallback.
KCAL_IDS = (1008, 2047, 2048)
FOOD_DATA_TYPES = {'foundation_food', 'sr_legacy_food'}


def _rows(path):
    with open(path, encoding='utf-8-sig', newline='') as fh:
        yield from csv.DictReader(fh)


def load(only=None):
    """{fdc_id: {'description', 'data_type', 'nutrients': {corpus_column: amount_per_100g}}}.
    only: optional subset of DATASETS keys ('foundation', 'sr_legacy'), for tests."""
    dirs = {k: F.dataset_dir(k) for k in (only or F.DATASETS)}
    missing = [k for k, d in dirs.items() if d is None]
    if missing:
        raise FileNotFoundError(f'USDA datasets not fetched: {missing}. Run `python3 -m '
                                f'ingest.nutrition.fetch_usda` first.')
    foods = {}
    for key, d in dirs.items():
        for row in _rows(os.path.join(d, 'food.csv')):
            if row['data_type'] in FOOD_DATA_TYPES:
                fdc_id = int(row['fdc_id'])
                foods[fdc_id] = {'description': row['description'], 'data_type': row['data_type'],
                                 'dataset': key, 'nutrients': {}}
        kcal_candidates = {}  # fdc_id -> {nutrient_id: amount}, resolved to 'kcal' after the pass
        for row in _rows(os.path.join(d, 'food_nutrient.csv')):
            fdc_id = int(row['fdc_id'])
            f = foods.get(fdc_id)
            if f is None:
                continue
            try:
                nid = int(row['nutrient_id'])
            except ValueError:
                continue
            amount = row.get('amount')
            if amount in (None, ''):
                continue
            if nid in KCAL_IDS:
                kcal_candidates.setdefault(fdc_id, {}).setdefault(nid, float(amount))
                continue
            col = NUTRIENT_MAP.get(nid)
            if col is None or col in f['nutrients']:
                continue
            f['nutrients'][col] = float(amount)
        for fdc_id, byid in kcal_candidates.items():
            for nid in KCAL_IDS:
                if nid in byid:
                    foods[fdc_id]['nutrients']['kcal'] = byid[nid]
                    break
    return foods


def summary(foods):
    have_kcal = sum(1 for f in foods.values() if 'kcal' in f['nutrients'])
    by_ds = {}
    for f in foods.values():
        by_ds[f['dataset']] = by_ds.get(f['dataset'], 0) + 1
    return f'{len(foods)} foods ({by_ds}), {have_kcal} with kcal'


if __name__ == '__main__':
    print(summary(load()))
