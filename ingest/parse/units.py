"""Unit aliases -> canonical unit names, and the conversions the parser needs for "plus" amounts."""
import re

# canonical -> aliases. Matching is case-insensitive except where CASE_SENSITIVE says otherwise.
UNIT_ALIASES = {
    'g': ['g', 'gm', 'gms', 'gr', 'grm', 'grms', 'gram', 'grams', 'gramme', 'grammes', '克'],
    'kg': ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes',
           '千克', '公斤'],
    'mg': ['mg', 'milligram', 'milligrams'],
    'ml': ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'cc', '毫升'],
    'l': ['l', 'litre', 'litres', 'liter', 'liters', 'ltr', 'ltrs', '升'],
    'tsp': ['tsp', 'tsps', 'teaspoon', 'teaspoons', 'teasp', 'teaspoonful', 'teaspoonfuls',
            'tspn', 'ts', '小勺', '茶匙', '小匙'],
    'tbsp': ['tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tablespoonful', 'tablespoonfuls',
             'tbs', 'tbl', 'tbls', 'tblsp', 'tblsps', 'tblspn', 'tbsn', 'tbspn', 'tbsp', 'tb',
             'tbl.', '大勺', '汤匙', '大匙'],
    'cup': ['cup', 'cups', 'cupful', 'cupfuls', 'c', '杯'],
    'fl_oz': ['fl oz', 'fl. oz', 'fl.oz', 'floz', 'fluid ounce', 'fluid ounces', 'fl ounce',
              'fl ounces', 'fl. ounces', 'fluid oz'],
    'oz': ['oz', 'ozs', 'ounce', 'ounces', 'onz'],
    'lb': ['lb', 'lbs', 'pound', 'pounds', 'ib', 'ibs'],
    'pint': ['pint', 'pints', 'pt', 'pts'],
    'quart': ['quart', 'quarts', 'qt', 'qts'],
    'gallon': ['gallon', 'gallons', 'gal', 'gals'],
    'pinch': ['pinch', 'pinches', 'smidgen', 'smidge'],
    'dash': ['dash', 'dashes'],
    'drop': ['drop', 'drops'],
    'splash': ['splash', 'splashes', 'glug', 'glugs'],
    'drizzle': ['drizzle', 'drizzles'],
    'clove': ['clove', 'cloves', '瓣'],
    'piece': ['piece', 'pieces', 'pc', 'pcs', 'each', 'ea', 'link', 'links', 'twist', 'twists', '个', '只',
              '块', '段', '颗', '粒', '根', '条'],
    'slice': ['slice', 'slices', 'strip', 'strips', 'rasher', 'rashers', '片'],
    'can': ['can', 'cans', 'tin', 'tins', '罐'],
    'jar': ['jar', 'jars'],
    'bottle': ['bottle', 'bottles'],
    'package': ['package', 'packages', 'pkg', 'pkgs', 'packet', 'packets', 'pack', 'packs',
                'envelope', 'envelopes', 'sachet', 'sachets', 'box', 'boxes', 'bag', 'bags',
                'carton', 'cartons', 'container', 'containers', 'tub', 'tubs', 'punnet', 'punnets',
                'pouch', 'pouches', '包', '袋', '盒'],
    'bunch': ['bunch', 'bunches', 'bundle', 'bundles', '把'],
    'sprig': ['sprig', 'sprigs'],
    'stalk': ['stalk', 'stalks', 'rib', 'ribs'],
    'head': ['head', 'heads'],
    'stick': ['stick', 'sticks'],
    'sheet': ['sheet', 'sheets'],
    'leaf': ['leaf', 'leaves'],
    'handful': ['handful', 'handfuls'],
    'inch': ['inch', 'inches'],
    'ear': ['ear', 'ears'],
    'cube': ['cube', 'cubes'],
    'loaf': ['loaf', 'loaves'],
    'knob': ['knob', 'knobs'],
    'scoop': ['scoop', 'scoops'],
    'square': ['square', 'squares', 'sq', 'sqs'],
}
CANONICAL_UNITS = tuple(UNIT_ALIASES)
# Single capital T means tablespoon, single lower-case t means teaspoon.
CASE_SENSITIVE = {'T': 'tbsp', 't': 'tsp', 'Tb': 'tbsp', 'TB': 'tbsp', 'C': 'cup', 'c': 'cup'}

ALIAS_TO_UNIT = {}
for _u, _al in UNIT_ALIASES.items():
    for _a in _al:
        ALIAS_TO_UNIT[_a.lower()] = _u

# Units that only count when they come before the name (a leading "leaves" is a unit, a trailing
# "bay leaves" is a name).
FRONT_ONLY = {'leaf', 'stick', 'sheet', 'cube', 'loaf', 'inch', 'head', 'ear', 'square'}
# Units that may follow the name: "4 garlic cloves", "2 celery stalks", "4 thyme sprigs".
POSTFIX = {'clove': 'clove', 'cloves': 'clove', 'stalk': 'stalk', 'stalks': 'stalk',
           'rib': 'stalk', 'ribs': 'stalk', 'sprig': 'sprig', 'sprigs': 'sprig', 'ear': 'ear',
           'ears': 'ear'}
# A unit with no number in front of it means one of it ("pinch of salt", "Bunch Parsley").
IMPLICIT_ONE = {'pinch', 'dash', 'splash', 'drizzle', 'handful', 'bunch', 'sprig', 'knob',
                'head', 'stalk', 'clove', 'slice', 'can', 'package', 'jar', 'bottle', 'drop',
                'stick', 'cube', 'sheet', 'loaf', 'scoop', 'piece', 'twist'}
CONTAINERS = {'can', 'jar', 'bottle', 'package', 'piece', 'stick', 'loaf', 'slice', 'head'}

VOLUME_ML = {'tsp': 4.92892, 'tbsp': 14.7868, 'cup': 236.588, 'fl_oz': 29.5735, 'ml': 1.0,
             'l': 1000.0, 'pint': 473.176, 'quart': 946.353, 'gallon': 3785.41}
MASS_G = {'g': 1.0, 'kg': 1000.0, 'mg': 0.001, 'oz': 28.3495, 'lb': 453.592}


def convert(qty, from_unit, to_unit):
    """qty in from_unit expressed in to_unit, or None when they are not the same dimension."""
    for table in (VOLUME_ML, MASS_G):
        if from_unit in table and to_unit in table:
            return qty * table[from_unit] / table[to_unit]
    return None


def _alias_pattern():
    al = sorted(set(ALIAS_TO_UNIT) | set(CASE_SENSITIVE), key=len, reverse=True)
    parts = []
    for a in al:
        esc = re.escape(a).replace(r'\ ', r'\s*')
        parts.append(esc)
    return '|'.join(parts)


UNIT_ALT = _alias_pattern()


def lookup(token):
    """Canonical unit for a matched alias token (without trailing dot)."""
    t = token.strip().rstrip('.')
    if t in CASE_SENSITIVE:
        return CASE_SENSITIVE[t]
    t2 = re.sub(r'\s+', ' ', t.lower())
    if t2 in ('t',):
        return 'tsp'
    return ALIAS_TO_UNIT.get(t2) or ALIAS_TO_UNIT.get(t2.replace(' ', ''))
