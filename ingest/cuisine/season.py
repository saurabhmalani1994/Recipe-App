"""Seasonality: which of a recipe's ingredients are in-season produce for a given month
(brief S5b #4), read from season.yaml (temperate northern hemisphere, the default per D14 --
the owner's own location is not yet known).

Usage:
  python3 -m ingest.cuisine.season 7      list every produce slug in season in July
"""
import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SEASON_PATH = os.path.join(HERE, 'season.yaml')

_CACHE = {}


def load(path=SEASON_PATH):
    """{slug: [peak months, 1-12]}."""
    key = os.path.abspath(path)
    if key not in _CACHE:
        with open(path, encoding='utf-8') as fh:
            data = yaml.safe_load(fh) or {}
        _CACHE[key] = dict(data.get('produce') or {})
    return _CACHE[key]


def validate(produce):
    errors = []
    for slug, months in produce.items():
        if not isinstance(months, list) or not months:
            errors.append(f'{slug}: months must be a non-empty list')
            continue
        for m in months:
            if not isinstance(m, int) or not 1 <= m <= 12:
                errors.append(f'{slug}: bad month {m!r}')
        if len(set(months)) != len(months):
            errors.append(f'{slug}: repeated month')
    return errors


def is_in_season(slug, month, produce=None):
    produce = produce if produce is not None else load()
    return month in (produce.get(slug) or ())


def in_season_produce(month, produce=None):
    """Every slug in season.yaml that peaks in `month` (1-12)."""
    produce = produce if produce is not None else load()
    return sorted(slug for slug, months in produce.items() if month in months)


def recipe_in_season_produce(ingredient_slugs, month, produce=None):
    """The subset of a recipe's (already-parsed) ingredient slugs that are in-season produce
    for `month`. Slugs season.yaml doesn't cover (spices, proteins, pantry staples, produce
    with no real peak) are simply not returned -- not an error."""
    produce = produce if produce is not None else load()
    in_season = set(in_season_produce(month, produce))
    return sorted(set(ingredient_slugs) & in_season)


def main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print('usage: season.py MONTH  (1-12)')
        return 1
    month = int(argv[0])
    produce = load()
    errors = validate(produce)
    if errors:
        for e in errors:
            print(f'FAIL: {e}')
        return 1
    slugs = in_season_produce(month, produce)
    print(f'{len(slugs)} slugs in season in month {month}: {", ".join(slugs)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
