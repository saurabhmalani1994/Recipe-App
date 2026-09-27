"""The canonical ingredient taxonomy: load, validate and index `ingredients.yaml`.

`ingest` owns this file. Every other package (the substitutions table, the parser, and later
the app) reads it through this module.

Usage:
  python3 -m ingest.taxonomy.taxonomy      summary line; exit 1 on any error
"""
import os
import sys

import yaml

try:
    from .normalize import norm_name
except ImportError:  # run as a script
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from normalize import norm_name  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TAXONOMY_PATH = os.path.join(HERE, 'ingredients.yaml')

# Diet flags. Meaning of each is documented at the top of ingredients.yaml.
FLAGS = ('red_meat', 'poultry', 'fish', 'shellfish', 'animal_derived', 'explicit_meat',
         'dairy', 'egg', 'gluten', 'nuts', 'alcohol')
CATEGORIES = (
    # the flavour-role categories the substitutions table was built on
    'sauce_condiment', 'vinegar_acid', 'dairy', 'nondairy', 'egg', 'flour_thickener',
    'leavener', 'sweetener', 'chocolate_cocoa', 'fat_oil', 'herb', 'spice', 'spice_blend', 'salt',
    'aromatic', 'chile', 'alcohol', 'stock', 'protein', 'pantry', 'nut_seed', 'basic',
    # added with the full taxonomy
    'vegetable', 'fruit', 'grain', 'cereal', 'pasta_noodle', 'legume', 'bakery', 'snack',
    'dessert_sweet', 'beverage', 'prepared', 'nonfood',
)
AISLES = ('produce', 'dairy', 'meat', 'seafood', 'bakery', 'pantry', 'spices', 'international',
          'frozen', 'beverages', 'other')
REQUIRED = ('name', 'synonyms', 'category', 'aisle', 'flags', 'is_staple')
OPTIONAL = ('parent', 'density_g_per_ml', 'each_g', 'usda_hint', 'hidden_animal', 'note')
# Flags that make an ingredient non-vegetarian under the strict reading. hidden_animal must be
# consistent with them.
NON_VEG = ('red_meat', 'poultry', 'fish', 'shellfish', 'animal_derived')


class UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader that refuses duplicate mapping keys instead of silently keeping the last."""


def _construct_mapping(loader, node, deep=False):
    seen = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in seen:
            raise yaml.constructor.ConstructorError(
                None, None, f'duplicate key {key!r}', key_node.start_mark)
        seen.add(key)
    return loader.construct_mapping(node, deep=deep)


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)

_CACHE = {}


def load(path=TAXONOMY_PATH):
    """Return {slug: record}. Cached per path; the file is ~2000 entries."""
    key = os.path.abspath(path)
    if key not in _CACHE:
        with open(path, encoding='utf-8') as fh:
            data = yaml.load(fh, Loader=UniqueKeyLoader)
        _CACHE[key] = (data or {}).get('ingredients') or {}
    return _CACHE[key]


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate(ingredients, full=True):
    """Return a list of error strings. `full=False` checks only what the substitutions table
    relies on (category, flags, hidden_animal), so hand-built fixtures stay small."""
    import re
    slug_re = re.compile(r'^[a-z][a-z0-9]*(_[a-z0-9]+)*$')
    errors = []
    if not isinstance(ingredients, dict) or not ingredients:
        return ['ingredients: missing or empty']
    keys = {}
    for slug, rec in ingredients.items():
        where = f'ingredient {slug!r}'
        if not isinstance(slug, str) or not slug_re.match(slug):
            errors.append(f'{where}: slug must be lowercase snake_case')
        if not isinstance(rec, dict):
            errors.append(f'{where}: must be a mapping')
            continue
        required = REQUIRED if full else ('category', 'flags')
        for k in required:
            if k not in rec:
                errors.append(f'{where}: missing field {k!r}')
        for k in rec:
            if k not in REQUIRED + OPTIONAL:
                errors.append(f'{where}: unknown field {k!r}')
        if 'category' in rec and rec['category'] not in CATEGORIES:
            errors.append(f'{where}: unknown category {rec["category"]!r}')
        if 'aisle' in rec and rec['aisle'] not in AISLES:
            errors.append(f'{where}: unknown aisle {rec["aisle"]!r}')
        fl = rec.get('flags')
        if 'flags' in rec:
            if not isinstance(fl, list):
                errors.append(f'{where}: flags must be a list')
            else:
                for f in fl:
                    if f not in FLAGS:
                        errors.append(f'{where}: unknown flag {f!r}')
                if len(set(fl)) != len(fl):
                    errors.append(f'{where}: repeated flag')
                if 'explicit_meat' in fl and not set(fl) & {'red_meat', 'poultry', 'fish',
                                                            'shellfish'}:
                    errors.append(f'{where}: explicit_meat needs the animal flag it is meat of')
        hidden = rec.get('hidden_animal')
        if hidden is not None:
            if not isinstance(hidden, str) or not hidden.strip():
                errors.append(f'{where}: hidden_animal must be a non-empty string')
            elif isinstance(fl, list) and not set(NON_VEG) & set(fl):
                errors.append(f'{where}: hidden_animal set but no non-vegetarian flag')
        if isinstance(fl, list) and 'animal_derived' in fl and not hidden:
            errors.append(f'{where}: animal_derived needs a hidden_animal note')
        if 'is_staple' in rec and not isinstance(rec['is_staple'], bool):
            errors.append(f'{where}: is_staple must be true or false')
        for k in ('density_g_per_ml', 'each_g'):
            if k in rec and (not _is_num(rec[k]) or rec[k] <= 0):
                errors.append(f'{where}: {k} must be a positive number')
        for k in ('usda_hint', 'note', 'name'):
            if k in rec and (not isinstance(rec[k], str) or not rec[k].strip()):
                errors.append(f'{where}: {k} must be a non-empty string')
        parent = rec.get('parent')
        if parent is not None:
            if parent not in ingredients:
                errors.append(f'{where}: unknown parent {parent!r}')
            elif parent == slug:
                errors.append(f'{where}: parent is itself')
        syns = rec.get('synonyms')
        if 'synonyms' in rec and not isinstance(syns, list):
            errors.append(f'{where}: synonyms must be a list')
            syns = []
        if full:
            for s in [rec.get('name')] + list(syns or []):
                if not isinstance(s, str) or not s.strip():
                    errors.append(f'{where}: empty name or synonym')
                    continue
                k = norm_name(s)
                if not k:
                    errors.append(f'{where}: synonym {s!r} normalizes to nothing')
                    continue
                other = keys.get(k)
                if other is not None and other != slug:
                    errors.append(f'{where}: name {s!r} also names {other!r}')
                keys[k] = slug
    # parent chains must end (no cycles)
    for slug, rec in ingredients.items():
        seen = {slug}
        p = rec.get('parent') if isinstance(rec, dict) else None
        while p is not None and p in ingredients:
            if p in seen:
                errors.append(f'ingredient {slug!r}: parent cycle')
                break
            seen.add(p)
            p = ingredients[p].get('parent')
    return errors


def build_index(ingredients):
    """{normalized name: slug} over every name and synonym."""
    index = {}
    for slug, rec in ingredients.items():
        for s in [rec.get('name', slug.replace('_', ' '))] + list(rec.get('synonyms') or []):
            k = norm_name(s)
            if k:
                index.setdefault(k, slug)
        index.setdefault(norm_name(slug.replace('_', ' ')), slug)
    return index


def ancestors(ingredients, slug):
    """[slug, parent, grandparent, ...]."""
    out = []
    while slug is not None and slug in ingredients and slug not in out:
        out.append(slug)
        slug = ingredients[slug].get('parent')
    return out


def flags_of(ingredients, slug):
    rec = ingredients.get(slug)
    if not isinstance(rec, dict) or not isinstance(rec.get('flags'), list):
        return set()
    return set(rec['flags'])


def main(argv):
    try:
        ing = load()
    except (yaml.YAMLError, OSError) as exc:
        print(f'taxonomy: 1 errors (load failed: {exc})')
        return 1
    errors = validate(ing)
    for e in errors:
        print(f'ERROR {e}')
    n_syn = sum(len(r.get('synonyms') or []) for r in ing.values())
    n_parent = sum(1 for r in ing.values() if r.get('parent'))
    print(f'taxonomy: {len(errors)} errors, {len(ing)} slugs, {n_syn} synonyms, '
          f'{n_parent} with a parent, {sum(1 for r in ing.values() if r.get("is_staple"))} staples')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
