#!/usr/bin/env python3
"""Validate the substitutions table and compute diet safety from ingredient flags.

Diet flags of a substitute are always computed from its components' flags in the canonical
taxonomy, ingest/taxonomy/ingredients.yaml (owned by ingest; this package keeps no copy). An
entry may not declare them: any field outside the schema is an error.

Usage:
  python3 validate.py              summary line; exit 1 on any error
  python3 validate.py --report     also print, per target, whether a Vegetarian-safe and a
                                   No-red-meat-safe option exists
  python3 validate.py --coverage   also rewrite COVERAGE.md
"""
import os
import re
import sys
from collections import Counter, defaultdict

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.taxonomy import taxonomy as T  # noqa: E402

INGREDIENTS_PATH = T.TAXONOMY_PATH
SUBSTITUTIONS_PATH = os.path.join(HERE, 'substitutions.yaml')
COVERAGE_PATH = os.path.join(HERE, 'COVERAGE.md')

FLAGS = T.FLAGS
CATEGORIES = T.CATEGORIES
CONTEXTS = ('baking', 'sauce', 'marinade', 'dressing', 'stir_fry', 'braise', 'soup', 'frying',
            'garnish', 'dessert', 'beverage', 'any')
CUISINES = ('indian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'mexican',
            'middle_eastern', 'mediterranean', 'italian', 'french', 'american', 'global')
# Units a component amount may carry. `x` means a multiple of the target quantity.
UNITS = ('x', 'cup', 'tbsp', 'tsp', 'g', 'ml', 'oz', 'whole', 'pinch', 'clove', 'inch',
         'stalk', 'leaf', 'sheet', 'drop')
# Units an entry may be expressed `per`.
PER_UNITS = ('cup', 'tbsp', 'tsp', 'g', 'oz', 'whole', 'clove', 'inch', 'stalk', 'leaf', 'egg',
             'pinch', 'can', 'fillet')

# Diet presets (D5). A substitute is safe when none of these flags appear in its components.
# Vegetarian (D15/R7): excludes explicit_meat only -- oyster sauce, fish sauce, Worcestershire,
# shrimp/anchovy paste, gelatin and rennet cheeses are allowed, since they are not "the protein
# source". `vegetarian_strict` is the old, stricter rule (any red_meat/poultry/fish/shellfish/
# animal_derived flag); it is kept in code and tests for a possible strict mode later, but is not
# offered as a preset (R7).
DIETS = {
    'vegetarian': ('explicit_meat',),
    'vegetarian_strict': ('red_meat', 'poultry', 'fish', 'shellfish', 'animal_derived'),
    'no_red_meat': ('red_meat',),  # fish and poultry OK; stays strict (R8): beef stock, lard and
                                    # gelatin (all red_meat) are excluded
}
PRESETS = ('vegetarian', 'no_red_meat')

ENTRY_REQUIRED = ('id', 'target', 'substitute', 'contexts', 'quality', 'flavor_effect', 'cuisines')
ENTRY_OPTIONAL = ('note', 'per')
COMPONENT_KEYS = ('slug', 'amount', 'unit')
SLUG_RE = re.compile(r'^[a-z][a-z0-9]*(_[a-z0-9]+)*$')
ID_RE = re.compile(r'^[a-z0-9_]+__[a-z0-9_-]+$')
# NON_VEG guards hidden_animal / animal_derived consistency on ingredient records, independent
# of which diet preset is offered; it stays the broad (strict) set of animal flags.
NON_VEG = set(DIETS['vegetarian_strict'])


UniqueKeyLoader = T.UniqueKeyLoader


def load_yaml(path):
    with open(path, encoding='utf-8') as fh:
        return yaml.load(fh, Loader=UniqueKeyLoader)


def load(ingredients_path=INGREDIENTS_PATH, substitutions_path=SUBSTITUTIONS_PATH):
    ing = T.load(ingredients_path)
    subs = load_yaml(substitutions_path)
    return ing, (subs or {}).get('entries') or []


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_ingredients(ingredients):
    """The taxonomy's own validator (unknown category/flag, animal_derived without a
    hidden_animal note, ...)."""
    return T.validate(ingredients)


def ingredient_flags(ingredients, slug):
    rec = ingredients.get(slug)
    if not isinstance(rec, dict) or not isinstance(rec.get('flags'), list):
        return set()
    return set(rec['flags'])


def substitute_flags(ingredients, entry):
    """Diet flags of a substitute: the union of its components' ingredient flags."""
    out = set()
    for comp in entry.get('substitute') or []:
        if isinstance(comp, dict):
            out |= ingredient_flags(ingredients, comp.get('slug'))
    return out


def diet_safe(flags, diet):
    return not set(DIETS[diet]) & set(flags)


def validate_entries(ingredients, entries):
    errors = []
    if not isinstance(entries, list) or not entries:
        return ['entries: missing or empty']
    seen = {}
    for n, e in enumerate(entries):
        where = f'entry #{n}'
        if not isinstance(e, dict):
            errors.append(f'{where}: must be a mapping')
            continue
        if isinstance(e.get('id'), str):
            where = f'entry {e["id"]!r}'
        for k in ENTRY_REQUIRED:
            if k not in e or e[k] is None or e[k] == '':
                errors.append(f'{where}: missing field {k!r}')
        for k in e:
            if k not in ENTRY_REQUIRED + ENTRY_OPTIONAL:
                errors.append(f'{where}: unknown field {k!r} (diet flags are computed, '
                              f'never declared)')
        eid = e.get('id')
        if eid is not None:
            if not isinstance(eid, str) or not ID_RE.match(eid):
                errors.append(f'{where}: malformed id')
            elif eid in seen:
                errors.append(f'{where}: duplicate id (also entry #{seen[eid]})')
            else:
                seen[eid] = n
        target = e.get('target')
        if target is not None and target not in ingredients:
            errors.append(f'{where}: unknown target slug {target!r}')
        per = e.get('per')
        if per is not None and per not in PER_UNITS:
            errors.append(f'{where}: unknown per unit {per!r}')
        comps = e.get('substitute')
        if 'substitute' in e:
            if not isinstance(comps, list) or not comps:
                errors.append(f'{where}: substitute must be a non-empty list')
            else:
                slugs = []
                for c in comps:
                    if not isinstance(c, dict):
                        errors.append(f'{where}: component must be a mapping')
                        continue
                    for k in COMPONENT_KEYS:
                        if k not in c:
                            errors.append(f'{where}: component missing field {k!r}')
                    for k in c:
                        if k not in COMPONENT_KEYS:
                            errors.append(f'{where}: component unknown field {k!r}')
                    slug = c.get('slug')
                    slugs.append(slug)
                    if 'slug' in c and slug not in ingredients:
                        errors.append(f'{where}: unknown slug {slug!r}')
                    if slug is not None and slug == target:
                        errors.append(f'{where}: substitute contains the target itself')
                    if 'amount' in c and (not _is_num(c['amount']) or c['amount'] <= 0):
                        errors.append(f'{where}: amount must be a positive number')
                    unit = c.get('unit')
                    if 'unit' in c and unit not in UNITS:
                        errors.append(f'{where}: unknown unit {unit!r}')
                    elif per is None and 'unit' in c and unit != 'x':
                        errors.append(f'{where}: unit {unit!r} needs a per field')
                if len(set(map(str, slugs))) != len(slugs):
                    errors.append(f'{where}: repeated component slug')
        ctx = e.get('contexts')
        if 'contexts' in e:
            if not isinstance(ctx, list) or not ctx:
                errors.append(f'{where}: contexts must be a non-empty list')
            else:
                for c in ctx:
                    if c not in CONTEXTS:
                        errors.append(f'{where}: unknown context {c!r}')
        q = e.get('quality')
        if 'quality' in e and (not isinstance(q, int) or isinstance(q, bool) or not 1 <= q <= 3):
            errors.append(f'{where}: quality must be an integer 1-3, got {q!r}')
        fe = e.get('flavor_effect')
        if 'flavor_effect' in e and (not isinstance(fe, str) or not fe.strip() or '\n' in fe):
            errors.append(f'{where}: flavor_effect must be one non-empty line')
        if 'note' in e and (not isinstance(e['note'], str) or not e['note'].strip()):
            errors.append(f'{where}: note must be a non-empty string when present')
        cu = e.get('cuisines')
        if 'cuisines' in e:
            if not isinstance(cu, list) or not cu:
                errors.append(f'{where}: cuisines must be a non-empty list')
            else:
                for c in cu:
                    if c not in CUISINES:
                        errors.append(f'{where}: unknown cuisine {c!r}')
    return errors


def target_report(ingredients, entries):
    """Per target: entry count and whether a safe option exists for each diet preset."""
    rep = {}
    for e in entries:
        t = e['target']
        r = rep.setdefault(t, {'entries': 0, 'vegetarian': False, 'no_red_meat': False,
                               'target_flags': sorted(ingredient_flags(ingredients, t))})
        r['entries'] += 1
        fl = substitute_flags(ingredients, e)
        for diet in PRESETS:
            if diet_safe(fl, diet):
                r[diet] = True
    return rep


def validate(ingredients, entries):
    return validate_ingredients(ingredients) + validate_entries(ingredients, entries)


def used_slugs(entries):
    used = set()
    for e in entries:
        used.add(e.get('target'))
        for c in e.get('substitute') or []:
            if isinstance(c, dict):
                used.add(c.get('slug'))
    return used


def unused_slugs(ingredients, entries):
    """Taxonomy slugs the table never mentions. Informational since the taxonomy is shared."""
    used = set()
    for e in entries:
        used.add(e.get('target'))
        for c in e.get('substitute') or []:
            if isinstance(c, dict):
                used.add(c.get('slug'))
    return sorted(set(ingredients) - used)


def coverage_markdown(ingredients, entries):
    rep = target_report(ingredients, entries)
    cat = lambda s: ingredients[s]['category']
    by_cat_entries = Counter(cat(e['target']) for e in entries)
    by_cat_targets = Counter(cat(t) for t in rep)
    by_cuisine = Counter(c for e in entries for c in e['cuisines'])
    by_quality = Counter(e['quality'] for e in entries)
    by_ctx = Counter(c for e in entries for c in e['contexts'])
    n_veg = sum(r['vegetarian'] for r in rep.values())
    n_nrm = sum(r['no_red_meat'] for r in rep.values())
    L = ['# Substitutions coverage', '',
         'Generated by `python3 validate.py --coverage`. Do not edit by hand.', '',
         f'- Entries: {len(entries)}',
         f'- Targets: {len(rep)}',
         f'- Ingredient slugs used: {len(used_slugs(entries) & set(ingredients))} '
         f'(of {len(ingredients)} in the taxonomy)',
         f'- Targets with a Vegetarian-safe option: {n_veg} of {len(rep)}',
         f'- Targets with a No-red-meat-safe option: {n_nrm} of {len(rep)}',
         f'- Quality: 3 = {by_quality[3]}, 2 = {by_quality[2]}, 1 = {by_quality[1]}', '',
         '## By category (of the target)', '', '| Category | Targets | Entries |', '|---|---:|---:|']
    for c in CATEGORIES:
        if by_cat_entries[c]:
            L.append(f'| {c} | {by_cat_targets[c]} | {by_cat_entries[c]} |')
    L += ['', '## By cuisine', '',
          'An entry can be apt for several cuisines; `global` means no particular cuisine.', '',
          '| Cuisine | Entries |', '|---|---:|']
    for c in CUISINES:
        L.append(f'| {c} | {by_cuisine[c]} |')
    L += ['', '## By context', '', '| Context | Entries |', '|---|---:|']
    for c in CONTEXTS:
        L.append(f'| {c} | {by_ctx[c]} |')
    no_veg = sorted(t for t, r in rep.items() if not r['vegetarian'])
    L += ['', '## Targets with no Vegetarian-safe option', '',
          f'{len(no_veg)} targets. "Target itself" shows the target\'s own non-vegetarian flags; '
          'a target with none listed is itself vegetarian and is a gap worth filling.', '',
          '| Target | Category | Entries | Target itself | No-red-meat option |',
          '|---|---|---:|---|---|']
    for t in no_veg:
        r = rep[t]
        own = ', '.join(f for f in r['target_flags'] if f in NON_VEG) or 'vegetarian'
        L.append(f'| {t} | {cat(t)} | {r["entries"]} | {own} | '
                 f'{"yes" if r["no_red_meat"] else "no"} |')
    no_nrm = sorted(t for t, r in rep.items() if not r['no_red_meat'])
    L += ['', '## Targets with no No-red-meat-safe option', '', f'{len(no_nrm)} targets.', '']
    L += [f'- {t}' for t in no_nrm] or ['- none']
    return '\n'.join(L) + '\n'


def main(argv):
    try:
        ingredients, entries = load()
    except (yaml.YAMLError, OSError) as exc:
        print(f'validate: 1 errors (load failed: {exc})')
        return 1
    errors = validate(ingredients, entries)
    for err in errors:
        print(f'ERROR {err}')
    unused = unused_slugs(ingredients, entries)
    if errors:
        print(f'validate: {len(errors)} errors, {len(entries)} entries')
        return 1
    rep = target_report(ingredients, entries)
    if '--report' in argv:
        print('target\tentries\tvegetarian_option\tno_red_meat_option')
        for t in sorted(rep):
            r = rep[t]
            print(f'{t}\t{r["entries"]}\t{"yes" if r["vegetarian"] else "NO"}\t'
                  f'{"yes" if r["no_red_meat"] else "NO"}')
    if '--coverage' in argv:
        with open(COVERAGE_PATH, 'w', encoding='utf-8') as fh:
            fh.write(coverage_markdown(ingredients, entries))
    print(f'validate: 0 errors, {len(entries)} entries, {len(rep)} targets, '
          f'{len(ingredients) - len(unused)} taxonomy slugs used (of {len(ingredients)}), '
          f'vegetarian option {sum(r["vegetarian"] for r in rep.values())}/{len(rep)}, '
          f'no-red-meat option {sum(r["no_red_meat"] for r in rep.values())}/{len(rep)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
