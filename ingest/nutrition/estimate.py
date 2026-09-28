"""Per-recipe, per-serving nutrition: schema/corpus.sql's kcal, protein_g, fat_g, carbs_g,
fiber_g, sugar_g, sodium_mg on `recipes`.

fill_recipe(items, servings, ing, slug_nutrients) is the one function ingest/build/
build_corpus.py's Writer.write calls (its "fill hook"). It:
  1. converts each parsed ingredient item's quantity to grams, with the corpus's own unit table,
     ingredients.density_g_per_ml (volume) and ingredients.each_g (a "piece"-shaped unit) -- the
     same conversion the app would need to scale a recipe;
  2. looks up grams-per-100g nutrients for the item's slug, from ingest/nutrition/
     slug_nutrients.json (built by build_mapping.py from USDA FoodData Central: Foundation Foods
     + SR Legacy, public domain);
  3. sums, divides by servings, and returns None for every field -- never zero -- unless the
     grams that carried a nutrient value cover at least MIN_LINE_COVERAGE of the recipe's
     non-staple, non-optional ingredient LINES (rule: an estimate nobody checked isn't better
     than no estimate) and servings is known.
The per-recipe line coverage this decision was based on is always returned too, so the caller
can log or report it (PRODUCT.md: nutrition must read as an estimate, never silently wrong).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NUTRIENTS_PATH = os.path.join(HERE, 'slug_nutrients.json')

MASS_G = {'g': 1.0, 'kg': 1000.0, 'mg': 0.001, 'oz': 28.3495, 'lb': 453.592}
VOLUME_ML = {'tsp': 4.92892, 'tbsp': 14.7868, 'cup': 236.588, 'fl_oz': 29.5735, 'ml': 1.0,
            'l': 1000.0, 'pint': 473.176, 'quart': 946.353, 'gallon': 3785.41}

# Only ~300 of the taxonomy's ~1550 slugs carry density_g_per_ml/each_g (ingest/taxonomy README:
# set on "the ~300 most-used slugs", for the S7c grocery list). Most of the rest are exactly the
# herbs, spices and condiments that show up as a tsp/tbsp/sprig/handful/pinch in a LOT of core
# ingredient lines: without a fallback here, most recipes would fail the line-coverage bar not
# because their nutrition is actually unknown, but because a "1 tsp smoked paprika" can't be
# weighed. These are rough (a category-typical density; a unit-typical "one of it" weight), but
# the amounts they're used for are small enough that even a 2x miss barely moves a recipe's kcal.
FALLBACK_DENSITY_BY_CATEGORY = {
    'spice': 0.45, 'spice_blend': 0.45, 'herb': 0.2, 'salt': 1.2, 'sauce_condiment': 1.05,
    'vinegar_acid': 1.01, 'fat_oil': 0.92, 'dairy': 1.03, 'nondairy': 1.0, 'sweetener': 1.0,
    'stock': 1.0, 'alcohol': 0.94, 'beverage': 1.0, 'egg': 1.03,
}
# A typical single unit's weight, for a count-shaped unit with no ingredient-specific each_g.
FALLBACK_EACH_G_BY_UNIT = {
    'pinch': 0.36, 'dash': 0.5, 'drop': 0.05, 'splash': 5.0, 'drizzle': 5.0, 'sprig': 1.0,
    'leaf': 0.5, 'handful': 20.0, 'bunch': 30.0, 'knob': 15.0, 'stalk': 10.0, 'slice': 25.0,
    'head': 400.0, 'cube': 5.0, 'stick': 60.0, 'sheet': 5.0, 'loaf': 500.0, 'scoop': 30.0,
    'square': 10.0, 'clove': 5.0, 'ear': 90.0, 'inch': 15.0, 'can': 400.0, 'jar': 300.0,
    'bottle': 350.0, 'package': 200.0,
}

NUTRIENT_COLUMNS = ('kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'sugar_g', 'sodium_mg')
MIN_LINE_COVERAGE = 0.80
_NULL = {c: None for c in NUTRIENT_COLUMNS}


_CACHE = {}


def load_slug_nutrients(path=NUTRIENTS_PATH):
    key = os.path.abspath(path)
    if key not in _CACHE:
        if os.path.exists(path):
            with open(path, encoding='utf-8') as fh:
                _CACHE[key] = json.load(fh)
        else:
            _CACHE[key] = {}
    return _CACHE[key]


def _qty(it):
    """The item's amount: the low end of a range (never scales a recipe short)."""
    return it.get('qty')


def item_grams(it, ing_rec):
    """Grams this item contributes, or None when the quantity, unit or a needed conversion
    (density_g_per_ml for a volume, each_g for a count unit) is missing."""
    q = _qty(it)
    if q is None or ing_rec is None:
        return None
    pkg = it.get('pkg') or {}
    if pkg.get('qty') is not None and pkg.get('unit'):
        # "1 (14 oz) can": the container's own stated size is the more reliable grams source.
        g_each = _unit_to_grams(pkg['qty'], pkg['unit'], ing_rec)
        if g_each is not None:
            return q * g_each
    unit = it.get('unit')
    return _unit_to_grams(q, unit, ing_rec)


def _unit_to_grams(qty, unit, ing_rec):
    if unit in MASS_G:
        return qty * MASS_G[unit]
    if unit in VOLUME_ML:
        density = ing_rec.get('density_g_per_ml') or FALLBACK_DENSITY_BY_CATEGORY.get(ing_rec.get('category'))
        return qty * VOLUME_ML[unit] * density if density else None
    # every other unit (piece, clove, slice, can/jar/bottle without a pkg size, bunch, ...) is
    # treated as one count of the ingredient's own "each" weight, or a unit-typical fallback.
    each_g = ing_rec.get('each_g') or FALLBACK_EACH_G_BY_UNIT.get(unit)
    return qty * each_g if each_g else None


def _is_core_line(it, ing_rec):
    """A non-staple, non-optional use: schema/README's "core" (matches recipe_slugs.core, and
    build_corpus.py's core_slug_count), the denominator for how much of a recipe we can price."""
    return not it.get('optional') and not (ing_rec or {}).get('is_staple')


def fill_recipe(items, servings, ing, slug_nutrients=None):
    """items: parse_items() output with '_slug' set (ingest/build/build_corpus.py.Writer.write);
    ing: {slug: taxonomy record} (density_g_per_ml, each_g, is_staple); slug_nutrients: {slug:
    {column: amount_per_100g}}, defaults to load_slug_nutrients().
    Returns (values, coverage): values is {column: float or None} (all None together), coverage
    is the share of core ingredient lines whose grams were priced (0.0..1.0, or None with no
    core lines to judge by)."""
    if slug_nutrients is None:
        slug_nutrients = load_slug_nutrients()
    totals = {c: 0.0 for c in NUTRIENT_COLUMNS}
    any_grams = False
    core_lines, core_priced = set(), set()
    for it in items:
        slug = it.get('_slug') or it.get('slug')
        if not slug:
            continue
        ing_rec = ing.get(slug)
        if ing_rec is None:
            continue
        core = _is_core_line(it, ing_rec)
        if core:
            core_lines.add(it['line'])
        grams = item_grams(it, ing_rec)
        nutrients = slug_nutrients.get(slug)
        if grams is None or not nutrients:
            continue
        if core:
            core_priced.add(it['line'])
        any_grams = True
        for col, per100 in nutrients.items():
            totals[col] += grams * per100 / 100.0
    coverage = len(core_priced) / len(core_lines) if core_lines else (1.0 if any_grams else None)
    if not servings or servings <= 0 or coverage is None or coverage < MIN_LINE_COVERAGE:
        return dict(_NULL), coverage
    values = {c: round(totals[c] / servings, 1) for c in NUTRIENT_COLUMNS}
    # A trace amount (a pinch of a spice with no other core ingredient) can round to 0; report it
    # as 0.0, a real (if tiny) estimate, only when at least one nutrient is meaningfully nonzero.
    if all(v == 0.0 for v in values.values()):
        return dict(_NULL), coverage
    return values, coverage
