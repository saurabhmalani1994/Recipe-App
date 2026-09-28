"""Servings for every recipe, estimated where the source gives none (brief S15).

estimate(raw, items, course, ing, slug_nutrients) -> {'servings', 'servings_source', 'yield_count'}

Deterministic. The evidence is taken in this order, and the first tier that gives a number wins:

  'source'  (a) The source's own head count: a `servings` field, or a yield string that is a head
            count (curate.parse_servings: "Serves 4", "4-6 servings", "8").
  'text'    (b) Explicit text in the yield string, title, ingredient lines or steps, strongest first:
            1. 'head'    a head count: "serves 4", "feeds 6", "for 4 people", "8 servings",
                         "divide between 4 plates";
            2. 'count'   a counted yield: "makes 24 cookies", "fill 12 muffin cups", "cut into 16
                         squares", "shape into 20 meatballs", or a source yield string "Makes 16",
                         "84 cookies", "1 loaf"; converted with COUNT_PER_SERVING / WHOLE_SERVINGS
                         ("24 cookies" is 12 servings, "1 loaf" 10);
            3. 'volume'  a volume yield string ("about 2 cups"), over PORTION_ML[course];
            4. 'pan'     a pan: "9x13 pan", "20cm square tin", "23cm round cake tin", "9-inch pie
                         dish", "loaf tin", "bundt": its area over PAN_SQIN_PER_SERVING[course];
            5. 'portion' portion-sized ingredients in a main or breakfast: "4 salmon fillets",
                         "8 chicken thighs", "4 burger buns", over PORTION_ITEMS' count per person.
  'energy'  (c) The recipe's total kcal (ingest/nutrition's fill with servings = 1, so the same 80%
            core-line coverage bar applies) over KCAL_PER_SERVING[course].
  'mass'    (d) The recipe's approximate total ingredient grams (ingest/nutrition's gram conversion;
            a resolved line that cannot be weighed counts at the recipe's mean weighed line, or
            TYPICAL_LINE_G) over GRAMS_PER_SERVING[course]. Every recipe with one resolved
            ingredient line gets at least this tier.

A recipe with none of these (no ingredient line resolved to the taxonomy) keeps servings NULL
(servings_source NULL); the build counts them.

`yield_count` is the counted yield when the text or yield string gives one ("24 cookies", "1 loaf",
"16 squares"), else None. build_corpus writes it to recipes.yield_text only when the source gave no
yield string, so the app can say "Makes 24 cookies"; a source's own yield string is never replaced.

Calibration. Fitted by `python3 -m ingest.build.servings_eval --fit` on the recipes whose source
states a head count (the eval set, see servings_eval.py), using only the fit half of a key hash;
the other half is the held-out eval.
  * KCAL_PER_SERVING, GRAMS_PER_SERVING: per-course medians of (recipe total / stated servings).
  * PAN_SQIN_PER_SERVING: per-course median of (pan area / stated servings).
  * COURSE_PRIOR: per course, the head count that is a hit (within +-1 or +-30%) for the most
    fit-half recipes (5 for a main: it is a hit on a stated 4, 5 or 6).
  * ZONE: every signal but an explicit head count is noisy (a parsed "1 chicken" or a stock-heavy
    soup moves a recipe's kcal or grams 2x either way; "divide the dough into 2 pieces" is not the
    yield; within a course the kcal-per-stated-serving ratio's interquartile range spans about
    2.5x). On the fit half the course prior alone out-scores the raw kcal or gram estimate by a
    wide margin (energy 172 vs 117 hits of 263, mass 187 vs 116 of 269). So a signal only moves
    the answer off the course prior when it is far from it: in log space the raw estimate is
    soft-thresholded around the prior with a band of ZONE[kind],
        servings = prior                  when prior / r <= raw <= prior * r
                   raw / r                when raw > prior * r
                   raw * r                when raw < prior / r
    (continuous at the band's edges). r is picked per kind from (1, 1.25, 1.5, 2, 2.5, 3, 4): the
    most fit-half hits, where a shortfall of under max(1, 2% of the kind's recipes) counts as a tie
    and a tie goes to the narrower band. r is capped at 4, so that every tier stays a function of
    its evidence (a party-sized recipe with 20 mains' worth of kcal is not scaled as 5) and a
    recipe's per-serving nutrition is never just the course constant. A 'head' count is the recipe
    saying how many it serves and is used as written (r = 1).
"""
import math
import re

from ingest.build.curate import parse_servings
from ingest.nutrition import estimate as NUT

SOURCES = ('source', 'text', 'energy', 'mass')
KINDS = ('head', 'count', 'volume', 'pan', 'portion', 'energy', 'mass')
MAX_SERVINGS = 100

# ---- calibration (servings_eval.py --fit prints these; see the module docstring) ----------------

KCAL_PER_SERVING = {
    'main': 530, 'side': 320, 'dessert': 550, 'baking': 400, 'breakfast': 400,
    'sauce_condiment': 170, 'snack': 330, 'drink': 200,
}
GRAMS_PER_SERVING = {
    'main': 270, 'side': 199, 'dessert': 140, 'baking': 112, 'breakfast': 224,
    'sauce_condiment': 110, 'snack': 183, 'drink': 173,
}
PAN_SQIN_PER_SERVING = {   # fitted: main, side, dessert; the rest (under 5 pans each) are set
    'main': 13.2, 'side': 11.7, 'dessert': 6.2, 'baking': 8.0, 'breakfast': 13.2,
    'sauce_condiment': 10.0, 'snack': 8.0, 'drink': 10.0,
}
COURSE_PRIOR = {
    'main': 5, 'side': 5, 'dessert': 7, 'baking': 9, 'breakfast': 3,
    'sauce_condiment': 5, 'snack': 5, 'drink': 2,
}
# volume is never seen by the eval (it reads only a source yield string, which the eval hides): unfitted, as is.
ZONE = {'head': 1.0, 'count': 2.5, 'volume': 1.0, 'pan': 1.25, 'portion': 1.5, 'energy': 1.5, 'mass': 3.0}
ZONE_GRID = (1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0)
TYPICAL_LINE_G = 60   # fitted: median grams per weighed resolved line
MAX_PIECE_G = 1500    # a counted ('piece') line heavier than this is a lost unit, and is not weighed
DEFAULT_PRIOR = 4

# ---- text evidence -------------------------------------------------------------------------------

_WORDNUM = {
    'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
    'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'fifteen': 15, 'sixteen': 16,
    'eighteen': 18, 'twenty': 20, 'thirty': 30, 'forty': 40,
}
_N = r'(\d+(?:\.\d+)?|' + '|'.join(sorted((w for w in _WORDNUM if len(w) > 2), key=len, reverse=True)) + r')'
_RANGE = rf'{_N}(?:\s*(?:-|–|to|or)\s*{_N})?'
_DOZEN = r'(?:\s+(dozen))?'
_ADJ = r'(?:(?:[a-z]+-)?[a-z]+\s+){0,3}?'   # up to three words between the number and the noun

# How many of a counted thing make one serving. A noun not listed counts one per serving.
COUNT_PER_SERVING = {
    'cookie': 2, 'biscuit': 2, 'biscotti': 2, 'macaroon': 2, 'macaron': 2, 'truffle': 3, 'ball': 3,
    'bite': 3, 'meatball': 4, 'pancake': 2, 'crepe': 2, 'crêpe': 2, 'blini': 4, 'taco': 2,
    'dumpling': 5, 'wonton': 5, 'gyoza': 5, 'wing': 5, 'samosa': 2, 'spring roll': 2,
    'egg roll': 2, 'fritter': 2, 'falafel': 3, 'pakora': 3, 'bhaji': 2, 'croquette': 2,
    'cracker': 4, 'crostini': 3, 'bruschetta': 2, 'canape': 3, 'canapé': 3, 'skewer': 2,
    'kebab': 2, 'meringue': 2, 'madeleine': 2, 'truffle ': 3,
}
# a whole thing cut to share: servings per one of it
WHOLE_SERVINGS = {
    'loaf': 10, 'loaves': 10, 'cake': 12, 'cakes': 12, 'pie': 8, 'pies': 8, 'tart': 8, 'quiche': 6,
    'pavlova': 8, 'cheesecake': 12, 'traybake': 16,
}
COUNT_NOUNS = sorted(set((
    'cookies', 'cookie', 'biscuits', 'biscotti', 'macaroons', 'macarons', 'truffles', 'balls',
    'bites', 'meatballs', 'pancakes', 'crepes', 'crêpes', 'blinis', 'blini', 'tacos', 'dumplings',
    'wontons', 'gyoza', 'wings', 'samosas', 'spring rolls', 'egg rolls', 'fritters', 'falafel',
    'pakoras', 'bhajis', 'croquettes', 'crackers', 'crostini', 'canapes', 'canapés', 'skewers',
    'kebabs', 'meringues', 'madeleines', 'muffins', 'cupcakes', 'scones', 'rolls', 'buns', 'bagels',
    'brownies', 'blondies', 'bars', 'squares', 'slices', 'wedges', 'triangles', 'fingers', 'pieces',
    'portions', 'servings', 'tarts', 'tartlets', 'pies', 'pasties', 'pastries', 'croissants',
    'doughnuts', 'donuts', 'waffles', 'burgers', 'patties', 'sliders', 'wraps', 'burritos',
    'enchiladas', 'quesadillas', 'flatbreads', 'naans', 'popsicles', 'lollies', 'ice lollies',
    'puddings', 'sandwiches', 'crumpets', 'cakes', 'loaves', 'loaf', 'cake', 'pie', 'tart', 'quiche',
    'pavlova', 'cheesecake', 'traybake', 'eclairs', 'éclairs', 'profiteroles', 'churros', 'drinks',
    'cocktails', 'glasses',
)), key=len, reverse=True)
_WHOLE_ONE = {'loaf', 'loaves', 'cake', 'cakes', 'pie', 'pies', 'tart', 'quiche', 'pavlova', 'cheesecake', 'traybake'}
_HEAD_NOUNS = {'servings', 'portions'}
# "cut into N ..." counts only for these nouns; pieces/slices/wedges only in a sweet or baked course,
# where "cut into 8 pieces" is the tray, not the chicken.
_CUT_ANY_COURSE = {'squares', 'bars', 'brownies', 'blondies', 'triangles', 'fingers'}
_CUT_SWEET = {'pieces', 'slices', 'wedges'}
_SWEET_COURSES = {'dessert', 'baking', 'snack', 'breakfast'}
_NOT_A_YIELD = re.compile(r'\b(?:dough|pastry|marzipan|fondant|icing|batter|each|half|halves)\b', re.I)
MIN_COUNT = 4   # a step's "make 2 balls" or "divide into 2 pieces" is a step, not the yield
_NOUN_ALT = '|'.join(re.escape(n) for n in COUNT_NOUNS)

_HEAD_RES = [
    re.compile(rf'\b(?:serves|feeds|servings\s*:|serving size\s*:?)\s*(?:about\s+|approximately\s+|approx\.?\s+|up to\s+)?{_RANGE}'
               r'(?!\s*(?:minutes|mins|hours|°|degrees|cm\b|in\b|inch|g\b|ml\b|x\b))', re.I),
    re.compile(rf'\bfor\s+{_RANGE}\s+(?:people|persons|guests|adults)\b', re.I),
    re.compile(rf'\b(?:makes|yields?|enough for)\s+(?:about\s+)?{_RANGE}\s+(?:servings|portions|people)\b', re.I),
    re.compile(rf'(?<!into )\b{_RANGE}\s+(?:generous\s+|small\s+|large\s+|main[- ]course\s+|starter\s+)?(?:servings|portions)\b', re.I),
]
# "divide between 4 plates": serving vessels only, in a savoury course, and not a mixing step
_VESSEL_RE = re.compile(rf'\b(?:divide|split|spoon|ladle|pour|share|serve)\b([^.;]{{0,60}}?)\b(?:between|among|amongst|into)\s+'
                        rf'{_N}\s+(?:warm(?:ed)?\s+|shallow\s+|deep\s+|large\s+|small\s+|serving\s+)*'
                        r'(?:bowls|plates|glasses|mugs|tumblers|people)\b', re.I)
_VESSEL_COURSES = {'main', 'side', 'breakfast', 'drink', 'snack'}
_VESSEL_NOT = re.compile(r'\b(?:half|third|quarter|mixture|icing|batter|dough|dressing|cream|mixing|marinade|glaze)\b', re.I)

_COUNT_RES = [
    # "makes 24 cookies", "makes about 2 dozen small biscuits", "yield: 12 muffins"
    ('make', re.compile(rf'\b(?:makes|yields?|yield\s*:|you should (?:make|get|have)|you(?:\'ll| will) (?:make|get|have)|to make about)\s+'
                        rf'(?:about\s+|approximately\s+|around\s+|up to\s+)?{_RANGE}{_DOZEN}\s+{_ADJ}({_NOUN_ALT})\b', re.I)),
    # "fill 12 muffin cups", "a 12-hole muffin tin", "12-cup muffin pan"
    ('muffin', re.compile(rf'\b(?:fill|line|grease)\s+(?:the\s+)?{_N}\s+(?:\w+\s+)?(?:muffin|cupcake|bun)\s+(?:cups|cases|holes|tins|liners)\b', re.I)),
    ('muffin', re.compile(rf'\b{_N}[- ](?:hole|cup)\s+(?:non-stick\s+|nonstick\s+)?(?:muffin|cupcake|bun|fairy cake)\s+(?:tin|tray|pan)\b', re.I)),
    # "cut into 16 squares", "slice into 8 wedges", "shape into 20 meatballs"
    ('cut', re.compile(rf'\b(?:cut|slice|divide|portion|shape|roll|form)\b([^.;]{{0,40}}?)\binto\s+(?:about\s+)?'
                       rf'{_RANGE}{_DOZEN}\s+(?:equal\s+|even\s+|small\s+|large\s+|[\w-]+-sized\s+)?({_NOUN_ALT})\b', re.I)),
]
# a source yield string that is not a head count: "Makes 16", "84 cookies", "1 loaf", "2 dozen"
_YIELD_COUNT_RE = re.compile(rf'^\s*(?:makes|make|yields?|about|approx\.?|approximately)?\s*(?:about\s+)?'
                             rf'{_RANGE}{_DOZEN}\b\s*(?:x\s+)?(?:{_ADJ}({_NOUN_ALT})\b)?', re.I)
_VOLUME_ML = {'cup': 236.6, 'cups': 236.6, 'quart': 946.4, 'quarts': 946.4, 'qt': 946.4, 'pint': 473.2,
              'pints': 473.2, 'l': 1000.0, 'litre': 1000.0, 'litres': 1000.0, 'liter': 1000.0,
              'liters': 1000.0, 'ml': 1.0, 'gallon': 3785.4, 'gallons': 3785.4}
_YIELD_VOLUME_RE = re.compile(rf'{_N}\s*(cups?|quarts?|qt|pints?|litres?|liters?|l|ml|gallons?)\b', re.I)
PORTION_ML = {'main': 350, 'side': 200, 'dessert': 150, 'baking': 120, 'breakfast': 250,
              'sauce_condiment': 60, 'snack': 120, 'drink': 250}

# ---- pans --------------------------------------------------------------------------------------

_CM = 1 / 2.54
_PAN_WORDS = r'(?:pan|tin|dish|tray|casserole|springform)'
_PAN_SHAPE = (r'((?:round\s+|square\s+|deep\s+|shallow\s+|loose-bottomed\s+|fluted\s+|springform\s+|pie\s+|tart\s+|'
              r'cake\s+|flan\s+|sandwich\s+|baking\s+|glass\s+|ceramic\s+|metal\s+|brownie\s+|traybake\s+|'
              r'ovenproof\s+|roasting\s+|non-stick\s+|nonstick\s+|shallow\s+|rectangular\s+|oblong\s+){0,3})')
_PAN_RECT_RE = re.compile(r'\b(\d{1,2}(?:\.\d)?)\s*(?:"|in\.?|inch(?:es)?|cm)?\s*(?:x|×|by)\s*(\d{1,2}(?:\.\d)?)\s*'
                          r'(?:(?:x|×)\s*\d{1,2}(?:\.\d)?\s*)?-?\s*("|in\.?|inch(?:es)?|cm)?[- ]?' + _PAN_SHAPE + _PAN_WORDS + r'\b',
                          re.I)
_PAN_ROUND_RE = re.compile(r'\b(?:(two|2|three|3)\s+)?(\d{1,2}(?:\.\d)?)\s*(?:-|\s)?("|in\.?|inch(?:es)?|cm)[- ]?'
                           + _PAN_SHAPE + _PAN_WORDS + r'\b', re.I)
_PAN_NAMED = [
    (re.compile(r'\bloaf\s+(?:tin|pan)\b', re.I), 10, '1 loaf'),
    (re.compile(r'\bbundt\b', re.I), 12, '1 bundt cake'),
]

# ---- portion items (mains) ---------------------------------------------------------------------

# "4 salmon fillets": one-per-person shapes, and how many of one make a person's serving.
PORTION_ITEMS = {
    'fillets': 1, 'breasts': 1, 'breast fillets': 1, 'chops': 1, 'steaks': 1, 'thighs': 2,
    'drumsticks': 2, 'burger buns': 1, 'buns': 1, 'pittas': 1, 'pitta breads': 1, 'pita breads': 1,
    'pitas': 1, 'tortillas': 2, 'wraps': 1, 'sausages': 2, 'shanks': 1, 'poussins': 1,
    'cutlets': 1, 'escalopes': 1, 'burgers': 1, 'baking potatoes': 1, 'jacket potatoes': 1,
    'bread rolls': 1, 'rolls': 1, 'bagels': 1, 'english muffins': 1, 'taco shells': 2,
}
_PORTION_COURSES = {'main', 'breakfast'}
_PORTION_NOT = re.compile(r'\b(?:anchov\w*|cocktail|chipolatas?|packs?|packets?|cans?|tins?|jars?|mini)\b', re.I)
_PORTION_ALT = '|'.join(re.escape(n) for n in sorted(PORTION_ITEMS, key=len, reverse=True))
_PORTION_RE = re.compile(rf'^\s*{_N}\s+{_ADJ}({_PORTION_ALT})\b', re.I)


def _num(s):
    if s is None:
        return None
    s = s.lower()
    if s in _WORDNUM:
        return float(_WORDNUM[s])
    try:
        return float(s)
    except ValueError:
        return None


def _clamp(v):
    if v is None or not math.isfinite(v):
        return None
    return max(1, min(MAX_SERVINGS, int(round(v))))


def _singular(noun):
    n = noun.lower()
    irregular = {'loaves': 'loaf', 'patties': 'patty', 'pastries': 'pastry', 'brownies': 'brownie',
                 'blondies': 'blondie', 'lollies': 'lolly', 'ice lollies': 'ice lolly'}
    if n in irregular:
        return irregular[n]
    if n.endswith(('ches', 'shes')):
        return n[:-2]
    if n.endswith('s') and not n.endswith('ss'):
        return n[:-1]
    return n


def count_to_servings(count, noun):
    """Servings from a counted yield: 24 cookies -> 12, 12 muffins -> 12, 1 loaf -> 10."""
    if noun is None:
        return count
    n = noun.lower()
    if n in _HEAD_NOUNS:
        return count
    if n in WHOLE_SERVINGS:
        return count * WHOLE_SERVINGS[n]
    per = COUNT_PER_SERVING.get(_singular(n)) or COUNT_PER_SERVING.get(n) or 1
    return count / per


def _count_label(count, noun):
    c = int(count) if float(count).is_integer() else count
    return f'{c} {noun.lower()}' if noun else str(c)


def _texts(raw, use_yield):
    """(where, text) in evidence order: the yield string, the title, each ingredient line, each step."""
    out = []
    if use_yield and isinstance(raw.get('yield_text'), str):
        out.append(('yield', raw['yield_text']))
    if isinstance(raw.get('title'), str):
        out.append(('title', raw['title']))
    out += [('ingredient', ln) for ln in raw.get('ingredients') or [] if isinstance(ln, str)]
    out += [('step', st) for st in raw.get('steps') or [] if isinstance(st, str)]
    return out


def head_count(texts, course):
    """The first explicit head count in the text, or None."""
    for rx in _HEAD_RES:
        for _, t in texts:
            m = rx.search(t)
            if m:
                v = _num(m.group(1))
                if v and 0 < v <= MAX_SERVINGS:
                    return v
    if course in _VESSEL_COURSES:
        for where, t in texts:
            if where != 'step':
                continue
            for m in _VESSEL_RE.finditer(t):
                v = _num(m.group(2))
                if v and 1 <= v <= 24 and not _VESSEL_NOT.search(m.group(0)):
                    return v
    return None


def count_yield(texts, course):
    """The first counted yield in the text: (servings, 'N noun') or None."""
    for kind, rx in _COUNT_RES:
        for where, t in texts:
            if where == 'yield':
                continue
            for m in rx.finditer(t):
                if kind == 'muffin':
                    v = _num(m.group(1))
                    if v and MIN_COUNT <= v <= 48:
                        return v, _count_label(v, 'muffins')
                    continue
                if kind == 'make':
                    v, dozen, noun = _num(m.group(1)), m.group(3), m.group(4)
                else:
                    if _NOT_A_YIELD.search(m.group(1)):
                        continue
                    v, dozen, noun = _num(m.group(2)), m.group(4), m.group(5)
                    low = noun.lower()
                    if low in _HEAD_NOUNS:
                        continue
                    if low not in _CUT_ANY_COURSE and not (low in _CUT_SWEET and course in _SWEET_COURSES) \
                            and low not in {n for n in COUNT_NOUNS if _singular(n) in COUNT_PER_SERVING}:
                        continue
                if not v:
                    continue
                if dozen:
                    v *= 12
                if v < MIN_COUNT and noun.lower() not in _WHOLE_ONE:
                    continue
                s = count_to_servings(v, noun)
                if 0 < s <= MAX_SERVINGS:
                    return s, None if noun.lower() in _HEAD_NOUNS else _count_label(v, noun)
    return None


def pan_servings(texts, course):
    """Servings from a pan named in the ingredients or steps: (servings, label or None) or None."""
    per = PAN_SQIN_PER_SERVING.get(course, 10.0)
    for where, t in texts:
        if where == 'yield':
            continue
        m = _PAN_RECT_RE.search(t)
        if m:
            a, b, unit = float(m.group(1)), float(m.group(2)), (m.group(3) or '')
            if unit.lower() == 'cm' or (not unit and (a > 16 or b > 16)):
                a, b = a * _CM, b * _CM
            if 4 <= a <= 20 and 4 <= b <= 20:
                return a * b / per, None
        m = _PAN_ROUND_RE.search(t)
        if m:
            k = _num(m.group(1)) or 1
            d, unit, shape = float(m.group(2)), m.group(3), (m.group(4) or '').lower()
            if unit.lower() == 'cm':
                d *= _CM
            if 4 <= d <= 16:
                area = d * d if 'square' in shape else math.pi * (d / 2) ** 2
                if k > 1 and ('sandwich' in shape or 'cake' in shape or 'layer' in t.lower()):
                    k = 1   # two sandwich tins make one layered cake
                return k * area / per, None
        for rx, s, label in _PAN_NAMED:
            if rx.search(t):
                return s, label
    return None


def yield_string(text, course):
    """A source yield string that is not a head count: ('count' | 'volume', servings, label) or None.
    "Makes 16" -> 16, "84 cookies" -> 42, "1 loaf" -> 10, "about 2 cups" (a side) -> 2."""
    if not isinstance(text, str) or not text.strip():
        return None
    m = _YIELD_VOLUME_RE.search(text)
    if m and not re.search(_NOUN_ALT, text[:m.start()], re.I):
        v = _num(m.group(1))
        ml = _VOLUME_ML.get(m.group(2).lower())
        if v and ml:
            return 'volume', v * ml / PORTION_ML.get(course, 150), f'{m.group(1)} {m.group(2).lower()}'
    m = _YIELD_COUNT_RE.match(text)
    if m:
        v = _num(m.group(1))
        if v:
            if m.group(3):
                v *= 12
            noun = m.group(4)
            s = count_to_servings(v, noun)
            if 0 < s <= MAX_SERVINGS:
                return 'count', s, _count_label(v, noun)
    return None


def portion_items(raw, course):
    """Mains and breakfasts: the largest per-person count among portion-shaped ingredient lines
    ("4 salmon fillets" -> 4, "8 chicken thighs" -> 4), or None."""
    if course not in _PORTION_COURSES:
        return None
    best = None
    for ln in raw.get('ingredients') or []:
        if not isinstance(ln, str) or _PORTION_NOT.search(ln):
            continue
        m = _PORTION_RE.match(ln)
        if m:
            v = _num(m.group(1))
            if v and v >= 2:
                s = v / PORTION_ITEMS[m.group(2).lower()]
                if 1 <= s <= 20:
                    best = max(best or 0, s)
    return best


def signals(raw, items, course, ing, slug_nutrients, use_yield=True):
    """Every tier-(b..d) signal's raw servings estimate, in evidence order: [(kind, value)], plus
    the counted-yield label. servings_eval.py --fit calibrates on these."""
    texts = _texts(raw, use_yield)
    out = []
    label = None
    h = head_count(texts, course)
    if h:
        out.append(('head', h))
    cy = count_yield(texts, course)
    if cy:
        out.append(('count', cy[0]))
        label = cy[1]
    if use_yield:
        ys = yield_string(raw.get('yield_text'), course)
        if ys:
            out.append((ys[0], ys[1]))
            label = ys[2] if ys[0] == 'count' else label
    p = pan_servings(texts, course)
    if p:
        out.append(('pan', p[0]))
        label = label or p[1]
    pi = portion_items(raw, course)
    if pi:
        out.append(('portion', pi))
    k = total_kcal(items, ing, slug_nutrients)
    if k:
        out.append(('energy', k / KCAL_PER_SERVING.get(course, 400)))
    g = total_grams(items, ing)
    if g:
        out.append(('mass', g / GRAMS_PER_SERVING.get(course, 200)))
    order = {k: i for i, k in enumerate(KINDS)}
    out.sort(key=lambda kv: order[kv[0]])
    return out, label


# ---- energy and mass -------------------------------------------------------------------------

def total_kcal(items, ing, slug_nutrients):
    """The recipe's total kcal, or None under ingest/nutrition's line-coverage bar."""
    vals, _ = NUT.fill_recipe(items, 1, ing, slug_nutrients)
    return vals['kcal']


def total_grams(items, ing):
    """The recipe's approximate total mass in grams: the weighable resolved lines' grams, plus each
    resolved line that cannot be weighed (no quantity, or a unit with no conversion; foodcom lines
    often carry no amount at all) at the recipe's own mean grams per weighed line, or at
    TYPICAL_LINE_G when none could be weighed. None only when no line resolved to an ingredient."""
    lines, weighed, grams = set(), set(), 0.0
    for it in items:
        slug = it.get('_slug') or it.get('slug')
        rec = ing.get(slug) if slug else None
        if rec is None:
            continue
        lines.add(it['line'])
        g = NUT.item_grams(it, rec)
        if g and it.get('unit') in (None, 'piece') and g > MAX_PIECE_G:
            g = None   # "250 shallots": a gram amount whose unit the source lost (foodcom), not 250 shallots
        if g and g > 0:
            grams += g
            weighed.add(it['line'])
    if not lines:
        return None
    per_line = grams / len(weighed) if weighed else TYPICAL_LINE_G
    return grams + per_line * len(lines - weighed)


def shrink(value, course, kind, zone=None, priors=None):
    """The signal's raw estimate, soft-thresholded around the course prior in log space (module
    docstring, ZONE)."""
    r = ZONE[kind] if zone is None else zone
    prior = (priors or COURSE_PRIOR).get(course, DEFAULT_PRIOR)
    if value > prior * r:
        return value / r
    if value < prior / r:
        return value * r
    return prior


_TIER = {'head': 'text', 'count': 'text', 'volume': 'text', 'pan': 'text', 'portion': 'text',
         'energy': 'energy', 'mass': 'mass'}


def estimate(raw, items, course, ing, slug_nutrients=None, use_source=True):
    """{'servings': int or None, 'servings_source': one of SOURCES or None, 'yield_count': str or
    None}. use_source=False hides the source's own yield string and servings field (the eval)."""
    if slug_nutrients is None:
        slug_nutrients = NUT.load_slug_nutrients()
    out = {'servings': None, 'servings_source': None, 'yield_count': None}
    if use_source:
        s = raw.get('servings')
        s = s if isinstance(s, int) and not isinstance(s, bool) and 0 < s <= MAX_SERVINGS \
            else parse_servings(raw.get('yield_text'))
        if s:
            cy = count_yield(_texts(raw, False), course)
            out.update(servings=s, servings_source='source', yield_count=cy[1] if cy else None)
            return out
    sig, label = signals(raw, items, course, ing, slug_nutrients, use_yield=use_source)
    out['yield_count'] = label
    if sig:
        kind, value = sig[0]
        out.update(servings=_clamp(shrink(value, course, kind)), servings_source=_TIER[kind])
    return out
