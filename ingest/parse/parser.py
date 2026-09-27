"""Deterministic ingredient-line parser.

parse_line("1 (14 oz) can chickpeas, drained") ->
  [{'qty': 1, 'qty_max': None, 'unit': 'can', 'slug': 'chickpeas', 'raw_name': 'chickpeas',
    'prep': 'drained', 'optional': False, 'note': None, 'pkg': {'qty': 14, 'unit': 'oz'}}]

Output conventions (the gold set in gold.jsonl is labelled to the same rules):
  qty/qty_max  first number; a range gives qty=low and qty_max=high. "1 cup plus 2 tbsp" is
               summed into the first unit. Fractions, unicode fractions, "1-1/2" and a lost slash
               in front of a spoon unit ("1 12 teaspoons", "14 teaspoon") are read as fractions.
  unit         canonical (units.CANONICAL_UNITS). A number with no unit word gets 'piece'.
               Package words (box, bag, packet, envelope, carton...) are 'package'; tin is 'can'.
               A container's size ("1 (15 oz) can") goes to pkg, not to qty.
  slug         the most specific taxonomy slug named; "X or Y" takes X. None when nothing
               matches (instructions, headers glued to amounts, foods missing from the taxonomy).
  optional     "optional"/"if desired" anywhere, or an item with no amount that is "to taste" or
               a garnish.
  A line naming two ingredients ("salt and pepper", "1 egg plus 2 egg whites") gives two items.
  A section header ("For the glaze:") or a blank line gives no items.
"""
import os
import re
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.taxonomy import taxonomy as T  # noqa: E402
from ingest.taxonomy.normalize import norm_tokens, has_cjk, clean_text  # noqa: E402
from ingest.parse import units as U  # noqa: E402

I = re.IGNORECASE

FRACTIONS = {'½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5',
             '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8',
             '⅞': '7/8', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10'}
NUMBER_WORDS = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
                'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
                'dozen': 12, 'half': 0.5, 'a half': 0.5, 'half a': 0.5, 'a couple of': 2,
                'couple of': 2, 'a couple': 2, 'a few': None}
# "1 12 teaspoons", "14 teaspoon salt": a slash lost in the source (1 1/2, 1/4).
LOST_SLASH = {'12': 0.5, '13': 1 / 3, '14': 0.25, '18': 0.125, '23': 2 / 3, '34': 0.75,
              '38': 0.375, '58': 0.625, '78': 0.875}
SIZE_WORDS = ('extra large', 'extra-large', 'x-large', 'heaping', 'heaped', 'rounded', 'level',
              'scant', 'generous', 'good', 'full', 'firmly packed', 'lightly packed',
              'loosely packed', 'packed', 'large', 'small', 'medium', 'big', 'jumbo', 'tiny',
              'medium-sized', 'large-sized', 'small-sized', 'medium sized', 'huge',
              'little', 'very large', 'very small', 'thick', 'thin', 'heavy', 'rounded',
              'medium-large', 'medium large', 'smallish', 'largish', 'lrg', 'lge', 'lg', 'med', 'md',
              'sml', 'sm')
PREP_WORDS = {
    'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'crushed', 'beaten', 'melted',
    'softened', 'peeled', 'cubed', 'halved', 'quartered', 'julienned', 'mashed', 'pureed',
    'puréed', 'sifted', 'toasted', 'drained', 'rinsed', 'thawed', 'trimmed', 'seeded',
    'deseeded', 'cored', 'pitted', 'zested', 'juiced', 'torn', 'crumbled', 'cut', 'squeezed',
    'snipped', 'smashed', 'bashed', 'bruised', 'scrubbed', 'washed', 'dried', 'cooked',
    'uncooked', 'roasted', 'blanched', 'skinned', 'deveined', 'shelled', 'hulled', 'stemmed',
    'separated', 'whisked', 'lightly', 'finely', 'coarsely', 'roughly', 'thinly', 'thickly',
    'freshly', 'very', 'well', 'firmly', 'loosely', 'cold', 'chilled', 'warmed', 'boiled',
    'steamed', 'sauteed', 'fried', 'grilled', 'reserved', 'divided', 'picked', 'removed',
    'discarded', 'broken', 'flaked', 'ground', 'cracked', 'packed', 'slivered', 'segmented',
    'spiralized', 'riced', 'defrosted', 'frozen', 'soaked', 'strained', 'scalded', 'whipped',
    'room', 'temperature', 'into', 'pieces', 'chunks', 'cubes', 'strips', 'rings', 'wedges',
    'slices', 'halves', 'quarters', 'dice', 'inch', 'thick', 'thin', 'lengthwise', 'crosswise',
    'and', 'or', 'then', 'in', 'to', 'the', 'of', 'a', 'about', 'small', 'large', 'bite',
    'sized', 'size', 'sections', 'florets', 'optional', 'fine', 'rough', 'coarse',
}
STOP_SECOND_PART = {'juice', 'liquid', 'zest', 'rind', 'peel', 'seed', 'stem', 'leaf', 'oil',
                    'syrup', 'brine', 'fat', 'drippings', 'dripping', 'skin', 'bone',
                    'shell', 'green', 'top', 'white', 'yolk', 'cheese'}
# A slug that must only match as the whole name, not as a word inside a longer one.
SPAN_STOP = {'green', 'white', 'red', 'black', 'yellow', 'sweet', 'hot', 'fresh', 'dry',
             'bun', 'rose', 'spring', 'cube', 'mix', 'base', 'light', 'dark', 'regular', 'brown',
             'natural', 'crystal', 'plain', 'cold', 'pure', 'kosher', 'lean', 'fluid'}
# A fresh ingredient bought in a can is a different product.
CANNED_FORM = {'tomatoes': 'canned_tomatoes', 'roma_tomato': 'canned_tomatoes',
               'cherry_tomatoes': 'canned_tomatoes', 'tuna': 'canned_tuna',
               'salmon': 'canned_salmon', 'pumpkin': 'pumpkin_puree'}
MEATLESS_WORDS = {'vegan', 'vegetarian', 'meatless', 'veggie', 'imitation', 'faux', 'mock',
                  'plant', 'meat-free', 'meatfree'}

NUM = r'(?:\d+\s*-\s*\d+/\d+|\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+)'
RANGE_RE = re.compile(rf'^({NUM})(?:\s*(?:-|to|or)\s*({NUM})(?![\d/]))?', I)
UNIT_RE = re.compile(rf'^\s*-?\s*({U.UNIT_ALT})(\.?)(?=$|[^a-zA-Z])', I)
PKG_PAREN_RE = re.compile(
    rf'^\s*\(\s*(?:about\s+|approx\.?\s+)?({NUM})(?:\s*(?:-|to)\s*({NUM}))?\s*-?\s*'
    rf'({U.UNIT_ALT})\.?\s*(?:each|size|package|pkg|can|jar)?\.?\s*\)\.?', I)
SIZE_SPEC_RE = re.compile(
    rf'^\s*({NUM})\s*-?\s*(?:(?:to|-)\s*({NUM})\s*-?\s*)?({U.UNIT_ALT})\.?(?=$|[^a-zA-Z])', I)
ALT_MEASURE_RE = re.compile(rf'^\s*/\s*{NUM}\s*({U.UNIT_ALT})\.?(?=$|[^a-zA-Z])', I)
OPTIONAL_RE = re.compile(r'\boptional(ly)?\b|\bif desired\b|\bif you like\b|\bif preferred\b|'
                         r'\bif you wish\b|\bif available\b|\bif wanted\b', I)
TASTE_RE = re.compile(r'\bto taste\b|\bgarnish|\bto decorate\b|\bfor decorat|\bas desired\b', I)
HEADER_RE = re.compile(r'^(?:for\s+(?:the\s+)?[a-z][\w\s&\'-]*|[a-z][\w\s&\'()/-]*:)\s*:?\s*$', I)
CLAUSE_RE = re.compile(
    r'(?:,\s*|\s+|^)(?:'
    r'for\s+\w.*|'
    r'to\s+(?:taste|serve|garnish|decorate|dust|coat|finish|brush|grease|fry|sprinkle|top|drizzle|'
    r'make|adjust|cover|thin|use|glaze|thicken|season|mix|rinse|soak|cook|dip|roll|spread|'
    r'fill|drain|bind|loosen|moisten|dot|line|oil|butter|flour|sweeten)\b.*|'
    r'as\s+(?:needed|required|desired|necessary)\b.*|'
    r'or\s+(?:as\s+needed|to\s+taste|as\s+desired)\b.*|or\s+(?:more|less|so)\s*$|'
    r'plus\s+(?:more|extra|additional|a\s+little|some|a\s+bit)\b.*|'
    r'if\s+(?:needed|necessary|desired|using|you\s+like|preferred|available)\b.*|'
    r'such\s+as\b.*|e\.g\.?.*|'
    r'divided(?:\s+use)?\b.*|'
    r'(?:at\s+)?room\s+temperature\s*$|'
    r'\(?optional\)?\s*$'
    r')', I)


def _num(tok):
    tok = tok.strip()
    m = re.fullmatch(r'(\d+)\s*-\s*(\d+)/(\d+)', tok) or re.fullmatch(r'(\d+)\s+(\d+)/(\d+)', tok)
    if m:
        d = int(m.group(3))
        return int(m.group(1)) + (int(m.group(2)) / d if d else 0)
    m = re.fullmatch(r'(\d+)/(\d+)', tok)
    if m:
        d = int(m.group(2))
        return int(m.group(1)) / d if d else None
    try:
        return float(tok)
    except ValueError:
        return None


def _clean_number(x):
    if x is None:
        return None
    x = round(x, 4)
    return int(x) if x == int(x) else x


# ---------------------------------------------------------------- taxonomy index

_STATE = {}


def _state():
    if not _STATE:
        ing = T.load()
        index = T.build_index(ing)
        cjk_keys = sorted((k for k in index if has_cjk(k)), key=len, reverse=True)
        _STATE.update(ing=ing, index=index, cjk=cjk_keys)
    return _STATE


def resolve(text):
    """(slug, matched key) for a name, or (None, None). Exact name first, then the longest
    contiguous run of words that is a known name (rightmost on a tie, which is usually the head
    noun), then CJK substring."""
    st = _state()
    index = st['index']
    toks = norm_tokens(text)
    if not toks:
        return None, None
    key = ' '.join(toks)
    if key in index:
        return index[key], key
    n = len(toks)
    for L in range(min(n, 8), 0, -1):
        for i in range(n - L, -1, -1):
            k = ' '.join(toks[i:i + L])
            if L == 1 and k in SPAN_STOP:
                continue
            if k in index:
                return index[k], k
    if has_cjk(text):
        t = clean_text(text)
        for k in st['cjk']:
            if k in t:
                return index[k], k
    return None, None


# ---------------------------------------------------------------- text helpers

def preclean(line):
    s = line.replace('Â', '').replace(' ', ' ').replace(' ', ' ')
    s = s.replace('⁄', '/')
    for ch, fr in FRACTIONS.items():
        s = re.sub(rf'(\d)?\s*{ch}', lambda m, fr=fr: (m.group(1) + ' ' if m.group(1) else ' ') + fr + ' ', s)
    for a, b in (('–', '-'), ('—', '-'), ('‑', '-'), ('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'),
                 ('（', '('), ('）', ')'), ('，', ','), ('：', ':'), ('®', ''), ('™', ''), ('©', ''),
                 ('*', ''), ('\t', ' ')):
        s = s.replace(a, b)
    s = re.sub(r'^\s*半', '0.5 ', s)
    s = s.replace('适量', ' to taste ').replace('少许', ' to taste ')
    s = re.sub(r'\bnone\b', ' ', s, flags=I)
    s = re.sub(r'\bS\s*&\s*P\b', 'salt and pepper', s)
    s = re.sub(r'^\s*[-•·▪●◦~]+\s*', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def is_header(s):
    if re.search(r'\d', s):
        return False
    if s.endswith(':') and len(s.split()) <= 8:
        return True
    low = s.lower().strip(' .')
    if low in ('optional', 'divided', 'to serve', 'to garnish', 'garnish', 'for serving',
               'for garnish', 'topping', 'toppings', 'filling', 'sauce', 'crust', 'glaze',
               'frosting', 'icing', 'dressing', 'marinade', 'batter', 'dough', 'streusel',
               'ingredients', 'garnishes', 'to decorate', 'decoration', 'assembly'):
        return True
    if re.match(r'^to\s+(?:make|assemble|finish|moisten|prepare|cook)\b', low) \
            and len(s.split()) <= 8:
        return True
    return bool(re.match(r'^for\s+(the\s+)?[a-z]', s, I)) and len(s.split()) <= 6 and HEADER_RE.match(s) is not None


def _pop_parens(s):
    notes = []
    while True:
        m = re.search(r'\(([^()]*)\)', s)
        if not m:
            break
        if m.group(1).strip():
            notes.append(m.group(1).strip())
        s = (s[:m.start()] + ' ' + s[m.end():])
    if '(' in s:
        i = s.index('(')
        if s[i + 1:].strip():
            notes.append(s[i + 1:].strip())
        s = s[:i]
    s = s.replace(')', ' ')
    s = s.replace('[', ' ').replace(']', ' ')
    return re.sub(r'\s+', ' ', s).strip(), notes


def _strip_clauses(s):
    """Cut trailing usage clauses ("for garnish", "to taste", "divided") into notes."""
    notes = []
    m = CLAUSE_RE.search(s)
    while m:
        notes.append(s[m.start():].strip(' ,;'))
        s = s[:m.start()]
        m = CLAUSE_RE.search(s)
    return s.strip(' ,;:-'), notes


def _skip_size_words(s, notes):
    changed = True
    while changed:
        changed = False
        # "whole" is a size word only in front of a unit ("1 whole clove garlic"); otherwise it
        # belongs to the name ("whole wheat flour", "whole milk", "3 whole cloves")
        m = re.match(r'^\s*whole\s+', s, I)
        if m and UNIT_RE.match(s[m.end():]):
            m2 = UNIT_RE.match(s[m.end():])
            if s[m.end() + m2.end():].strip():
                s = s[m.end():]
                changed = True
                continue
        for w in SIZE_WORDS:
            m = re.match(rf'^\s*{re.escape(w)}\b\.?\s*', s, I)
            if m:
                if w not in ('whole',):
                    notes.append(w)
                s = s[m.end():]
                changed = True
                break
    return s


# ---------------------------------------------------------------- amount

def parse_amount(s):
    """Read the amount at the start of s. Returns a dict with qty, qty_max, unit, pkg, rest,
    notes, each, to_taste."""
    a = {'qty': None, 'qty_max': None, 'unit': None, 'pkg': None, 'rest': s, 'notes': [],
         'each': False, 'to_taste': False, 'unit_implicit_one': False}
    s = s.strip()
    s = re.sub(r'^(?:or|and|about|approx\.?|approximately|around|roughly|~|ca\.?)\s+', '', s, flags=I)
    m = re.match(r'^(to taste|to serve|for serving|to garnish|for garnish|garnish with|garnish|'
                 r'for decoration|to decorate|optional)[:,]?\s+', s, I)
    if m:
        a['notes'].append(m.group(1).lower())
        if 'taste' in m.group(1).lower() or 'garnish' in m.group(1).lower() or 'decor' in m.group(1).lower():
            a['to_taste'] = True
        s = s[m.end():]
    # number words
    m = re.match(r'^(a couple of|couple of|a couple|a half|half a|a few|one|two|three|four|five|six|'
                 r'seven|eight|nine|ten|eleven|twelve|dozen|half|an|a)\b(?![-\'])\s*', s, I)
    qty = None
    if m and not re.match(r'^\d', s):
        w = m.group(1).lower()
        if NUMBER_WORDS.get(w) is not None:
            qty = NUMBER_WORDS[w]
            s = s[m.end():]
    if qty is None:
        m = RANGE_RE.match(s)
        if m and not re.match(r'^\s*%', s[m.end():]):
            lo, hi = _num(m.group(1)), _num(m.group(2)) if m.group(2) else None
            rest = s[m.end():]
            # lost slash: "1 12 teaspoons" = 1 1/2; "14 teaspoon" = 1/4
            m2 = re.match(r'^\s+(\d\d)\s*(?=(?:tsp|teaspoon|tbsp|tablespoon|tbs|tbl|t\b|c\b|c\.|cup))', rest, I)
            if hi is None and m2 and m2.group(1) in LOST_SLASH and re.fullmatch(r'\d+', m.group(1)):
                lo = lo + LOST_SLASH[m2.group(1)]
                rest = rest[m2.end():]
            elif hi is None and re.fullmatch(r'\d\d', m.group(1)) and m.group(1) in LOST_SLASH:
                m3 = re.match(r'^\s*(tsp|teaspoon|tbsp|tablespoon|tbs|tbl|cup|c\.)', rest, I)
                if m3 and not (m.group(1) == '12' and m3.group(1).lower().startswith('c')):
                    lo = LOST_SLASH[m.group(1)]
            qty, a['qty_max'] = lo, hi
            s = rest
    if qty is not None and re.match(r'^\s*to taste\b', s, I):
        # "1 to taste salt": the number is a unit-less artefact of the source
        qty = None
        a['qty_max'] = None
        a['to_taste'] = True
        a['notes'].append('to taste')
        s = re.sub(r'^\s*to taste\b\s*', '', s, flags=I)
    m = re.match(r'^\s*(?:doz|dozen)\.?\b\s*', s, I)
    if qty is not None and m:
        qty = qty * 12
        a['qty_max'] = a['qty_max'] * 12 if a['qty_max'] is not None else None
        s = s[m.end():]
    a['qty'] = qty
    # multiplier "2 x 400g cans"
    s = re.sub(r'^\s*x\s+', ' ', s, flags=I)
    pkg = None
    m = PKG_PAREN_RE.match(s)
    if m and qty is not None:
        pkg = {'qty': _clean_number(_num(m.group(1))), 'unit': U.lookup(m.group(3))}
        s = s[m.end():]
    s = _skip_size_words(s, a['notes'])
    unit = None
    unit_word = None
    m = UNIT_RE.match(s)
    if m:
        u = U.lookup(m.group(1))
        after = s[m.end():]
        # a lone "t"/"c" needs a dot or a following word; "C" in "Cupcakes" never reaches here
        if u and not (m.group(1) in ('t', 'T', 'c', 'C') and not (m.group(2) or after.startswith(' '))):
            if not (u in U.FRONT_ONLY and qty is None and not re.match(r'^\s*of\b', after, I)
                    and u != 'head'):
                unit = u
                unit_word = m.group(1)
                a['each'] = m.group(1).lower() in ('each', 'ea')
                s = after
    if unit is None and qty is not None and pkg is None:
        # "Four 5- to 6-ounce steaks", "1 8 oz package pecans": a size, then maybe a container
        m = SIZE_SPEC_RE.match(s)
        if m and U.lookup(m.group(3)) in U.MASS_G.keys() | U.VOLUME_ML.keys():
            pkg = {'qty': _clean_number(_num(m.group(1))), 'unit': U.lookup(m.group(3))}
            s = s[m.end():]
            s = re.sub(r'^\s*\([^)]*\)\.?', '', s)
            s = _skip_size_words(s, a['notes'])
            m = UNIT_RE.match(s)
            if m and U.lookup(m.group(1)) in U.CONTAINERS:
                unit = U.lookup(m.group(1))
                s = s[m.end():]
    if unit is not None:
        m = ALT_MEASURE_RE.match(s)
        if m:
            a['notes'].append(s[:m.end()].strip(' /'))
            s = s[m.end():]
        m = PKG_PAREN_RE.match(s)
        if m:
            if unit in U.CONTAINERS and pkg is None:
                pkg = {'qty': _clean_number(_num(m.group(1))), 'unit': U.lookup(m.group(3))}
            else:
                a['notes'].append(s[:m.end()].strip(' ()'))
            s = s[m.end():]
    m = re.match(r'^\s*,?\s*or\s+(?:more|less|so)\b\.?\s*,?\s*', s, I)
    if m and qty is not None:
        a['notes'].append(m.group(0).strip(' ,'))
        s = s[m.end():]
        m2 = UNIT_RE.match(s)
        if unit is None and m2 and U.lookup(m2.group(1)):
            unit, unit_word = U.lookup(m2.group(1)), m2.group(1)
            s = s[m2.end():]
    m = re.match(r'^\s*to taste\b\s*', s, I)
    if m and qty is not None:
        a['notes'].append('to taste')
        s = s[m.end():]
    if unit is not None and re.match(r'^\s*each\b', s, I):
        # "1/4 tsp each salt and pepper"
        a['each'] = True
        s = re.sub(r'^\s*each\b\s*', '', s, flags=I)
    s = re.sub(r'^\s*(?:of|x)\b\s*', '', s, flags=I)
    s = _skip_size_words(s, a['notes'])
    if unit is None and qty is None:
        # a unit word with no number: "pinch of salt", "Bunch Parsley"
        m = UNIT_RE.match(s)
        if m:
            u = U.lookup(m.group(1))
            after = s[m.end():]
            singular = not re.search(r'(es|s)\.?$', m.group(1).strip(), I) or u == 'pinch' and m.group(1).lower() == 'pinch'
            if u in U.IMPLICIT_ONE and m.group(1) not in ('t', 'T', 'c', 'C') and after.strip() and singular:
                unit, qty = u, 1
                unit_word = m.group(1)
                a['qty'] = 1
                a['unit_implicit_one'] = True
                s = re.sub(r'^\s*of\b\s*', '', after, flags=I)
    if qty is None and unit is not None and unit_word and not a['unit_implicit_one']:
        singular = not re.search(r'(?:es|s)$', unit_word.strip().rstrip('.'), I)
        if unit in U.IMPLICIT_ONE and singular and unit_word not in ('t', 'T', 'c', 'C'):
            a['qty'] = 1
            a['unit_implicit_one'] = True
    a['unit'] = unit
    a['unit_word'] = unit_word
    a['pkg'] = pkg
    a['rest'] = s.strip()
    return a


# ---------------------------------------------------------------- names

def _prep_from(text, matched_key):
    words = re.findall(r"[a-zA-ZÀ-ɏ'-]+", text.lower())
    key_toks = set((matched_key or '').split())
    out = []
    for w in words:
        if w in PREP_WORDS and w not in key_toks and w not in ('and', 'or', 'then', 'in', 'to', 'the', 'of', 'a', 'about'):
            out.append(w)
    return out


def _resolve_name(name, amount):
    """slug + matched key for a name segment, applying 'or' alternatives and small rules."""
    notes = []
    alts = re.split(r'\s+or\s+|\s*/\s*(?=[a-zA-Z])', name, flags=I)
    slug, key = None, None
    if len(alts) > 1:
        a1, rest_alts = alts[0].strip(), [x.strip() for x in alts[1:]]
        notes.append('or ' + ' or '.join(rest_alts))
        a2_toks = rest_alts[0].split()
        # "chicken or vegetable broth" -> chicken broth; "vegetable or olive oil" -> vegetable oil
        if len(a1.split()) <= 2 and len(a2_toks) >= 2:
            for k in range(1, len(a2_toks)):
                cand = a1 + ' ' + ' '.join(a2_toks[k:])
                s2, k2 = resolve(cand)
                if s2 and set(norm_tokens(a1)) & set(k2.split()):
                    slug, key = s2, k2
                    break
        if slug is None:
            slug, key = resolve(a1)
        if slug is None:
            slug, key = resolve(rest_alts[0])
    else:
        slug, key = resolve(name)
    return slug, key, notes


def _post_rules(slug, key, name, amount, all_text):
    st = _state()
    toks = set(norm_tokens(name))
    if slug == 'coriander' and (toks & {'fresh', 'leaf', 'leave', 'sprig', 'bunch', 'handful', 'chopped', 'stalk'}
                                or amount.get('unit') in ('bunch', 'handful', 'sprig')):
        slug = 'cilantro'
    canned = (amount.get('unit') in ('can', 'jar') or toks & {'canned', 'tinned'}
              or (amount.get('pkg') and amount.get('unit') == 'package'))
    if canned and slug in CANNED_FORM:
        slug = CANNED_FORM[slug]
    if slug and toks & MEATLESS_WORDS and 'explicit_meat' in T.flags_of(st['ing'], slug):
        slug = 'vegetarian_meat'
    return slug


def _make_item(amount, name, extra_notes, all_text, prep_extra=None):
    name = name.strip(' ,;:-.')
    name = re.sub(r'^(?:of|the)\s+', '', name, flags=I)
    notes = list(amount['notes']) + list(extra_notes)
    unit = amount['unit']
    qty = amount['qty']
    if not name and amount.get('unit_word') and resolve(amount['unit_word'])[0]:
        # "3 whole cloves": the would-be unit is the ingredient
        name, unit = amount['unit_word'], None
        if amount.get('unit_implicit_one'):
            qty = None
    # postfix unit: "4 garlic cloves", "2 celery stalks", "6 garlic cloves skin removed"
    words = name.split()
    if unit is None:
        for i in range(1, len(words)):
            w = words[i].lower().strip('.,')
            if w in U.POSTFIX and resolve(' '.join(words[:i]))[0]:
                unit = U.POSTFIX[w]
                break
    for t in (prep_extra or [])[:1]:
        if unit is None and t.lower().strip('. ') in U.POSTFIX:
            unit = U.POSTFIX[t.lower().strip('. ')]
    slug, key, alt_notes = _resolve_name(name, amount) if name else (None, None, [])
    notes += alt_notes
    amount2 = dict(amount, unit=unit)
    slug = _post_rules(slug, key, name, amount2, all_text)
    if qty is not None and unit is None:
        unit = 'piece'
    prep = _prep_from(name, key) + list(prep_extra or [])
    optional = bool(OPTIONAL_RE.search(all_text)) or (
        qty is None and (amount.get('to_taste') or any(TASTE_RE.search(n) for n in notes)))
    return {
        'qty': _clean_number(qty) if qty is not None else None,
        'qty_max': _clean_number(amount['qty_max']) if amount['qty_max'] is not None else None,
        'unit': unit,
        'slug': slug,
        'raw_name': name or None,
        'prep': ', '.join(dict.fromkeys(prep)) or None,
        'optional': optional,
        'note': '; '.join(n for n in notes if n) or None,
        'pkg': amount['pkg'],
    }


def _split_tail(rest):
    """name segment, prep words, notes from the text after the amount."""
    rest, paren_notes = _pop_parens(rest)
    if not rest.strip(' ,;:.-') and paren_notes:
        # "(ground beef or steak)", "1 (1/4-oz. package active dry yeast)": the name is inside
        inner = paren_notes.pop(0)
        a = parse_amount(inner)
        rest = a['rest'] if (a['qty'] is not None or a['unit']) and a['rest'] else inner
    rest = rest.strip(' ,;:.-')
    rest, clause_notes = _strip_clauses(rest)
    return rest.strip(' ,;:.-'), paren_notes + clause_notes


def _fruit_part(rest):
    """"Juice of 1 lime", "zest of 2 lemons", "lemons, rind of" -> (part, amount text)."""
    m = re.match(r'^(?:the\s+)?(?:finely\s+|freshly\s+)?(?:grated\s+)?(juice|zest|rind|peel)'
                 r'(?:\s+and\s+(?:finely\s+)?(?:grated\s+)?(?:juice|zest|rind|peel))?\s+(?:from|of)\s+(.*)$',
                 rest, I)
    if m:
        return m.group(1).lower(), m.group(2)
    m = re.match(r'^(.*?),?\s+(juice|zest|rind|peel)\s+of\b\.?\s*$', rest, I)
    if m:
        return m.group(2).lower(), m.group(1)
    return None, None


def _parse_simple(text, all_text):
    """One segment (no 'plus' split). Returns a list of items."""
    part, fruit_text = _fruit_part(text)
    if part:
        amount = parse_amount(fruit_text)
        name, notes = _split_tail(amount['rest'])
        name = name.split(',')[0]
        fslug, _ = resolve(name)
        target = None
        if fslug:
            base = fslug.split('_')[0]
            target = f'{base}_juice' if part == 'juice' else f'{base}_zest'
            if target not in _state()['ing']:
                target = fslug
        item = _make_item(amount, name, notes, all_text)
        item['slug'] = target
        if item['qty'] is not None and amount['unit'] is None:
            item['unit'] = 'piece'
        return [item]
    amount = parse_amount(text)
    body, notes = _split_tail(amount['rest'])
    segments = [seg.strip() for seg in body.split(',')]
    first = segments[0] if segments else ''
    tail = [x for x in segments[1:] if x]

    # several ingredients on one line
    multi = _try_multi(body if (amount['qty'] is None or amount['each']) else first, amount, all_text, notes)
    if multi:
        return multi

    name = first
    slug, _ = resolve(name) if name else (None, None)
    used = 1
    if slug is None and tail:
        # "2 large boneless, skinless chicken breasts": the name runs past the first comma
        for j in range(1, min(len(segments), 4)):
            cand = ' '.join(segments[:j + 1])
            s2, _ = resolve(cand)
            if s2:
                name, used = cand, j + 1
                break
    tail = [x for x in segments[used:] if x]
    prep_extra, tail_notes = [], []
    for t in tail:
        w = t.split()[0].lower() if t.split() else ''
        if w in PREP_WORDS or w.endswith('ed') or w.endswith('ly') or w in U.POSTFIX:
            prep_extra.append(t)
        else:
            tail_notes.append(t)
    return [_make_item(amount, name, notes + tail_notes, all_text, prep_extra)]


def _try_multi(body, amount, all_text, notes):
    body = re.sub(r'\s*&\s*', ' and ', body)
    if ' and ' not in body.lower() and ',' not in body:
        return None
    whole, _ = resolve(body)
    if whole and ' '.join(norm_tokens(body)) in _state()['index']:
        return None
    parts = [p.strip() for p in re.split(r',|\band\b|\bplus\b', body, flags=I)]
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return None
    resolved = []
    for pi, p in enumerate(parts):
        a2 = parse_amount(p) if re.match(r'^\d', p) else None
        pname = a2['rest'] if a2 else p
        pname, _ = _split_tail(pname)
        s, k = resolve(pname)
        if not s:
            return None
        if pi > 0 and ' '.join(norm_tokens(pname)) in STOP_SECOND_PART:
            return None
        resolved.append((p, a2))
    if amount['qty'] is not None and not amount['each']:
        # with an amount, only a clean "X and Y" of two full names splits ("1 Salt and pepper")
        for p, _ in resolved:
            if ' '.join(norm_tokens(_split_tail(p)[0])) not in _state()['index']:
                return None
    items = []
    for n, (p, a2) in enumerate(resolved):
        if a2:
            it = _make_item(a2, _split_tail(a2['rest'])[0], notes, all_text)
        else:
            if amount['each'] or n == 0:
                am = amount
            else:
                am = dict(amount, qty=None, qty_max=None, unit=None, pkg=None, notes=list(amount['notes']))
            it = _make_item(am, p, notes, all_text)
        items.append(it)
    return items


def parse_line(line):
    """Parse one raw ingredient line into a list of items (see module docstring)."""
    if line is None:
        return []
    text = preclean(line)
    if not text or not re.search(r'[\w一-鿿]', text):
        return []
    if is_header(text):
        return []
    # "1 cup plus 2 tablespoons X" / "1 egg plus 2 egg whites"
    m = re.search(r'\s+(?:plus|mixed with|combined with|whisked with|dissolved in|blended with)\s+(?=\d)', text, I)
    if m:
        seg1, seg2 = text[:m.start()], text[m.end():]
        a1 = parse_amount(seg1)
        name1, _ = _split_tail(a1['rest'])
        a2 = parse_amount(seg2)
        if not name1 and a1['unit'] and a2['unit'] and a1['qty'] is not None and a2['qty'] is not None:
            add = U.convert(a2['qty'], a2['unit'], a1['unit'])
            if add is not None:
                merged = dict(a2, qty=a1['qty'] + add, unit=a1['unit'], qty_max=None,
                              notes=a1['notes'] + [f'{seg1.strip()} plus {_clean_number(a2["qty"])} {a2["unit"]}'])
                body, notes = _split_tail(merged['rest'])
                segs = body.split(',')
                return [_make_item(merged, segs[0], notes + [s.strip() for s in segs[1:] if s.strip()], text)]
        name2, _ = _split_tail(a2['rest'])
        s2, _ = resolve(name2) if name2 else (None, None)
        if name1 and s2:
            return _parse_simple(seg1, text) + _parse_simple(seg2, text)
        if not name1 and name2:
            # "1 c. plus 1 pinch sugar", "1 stick plus 2 Tbsp. melted margarine": the name is
            # after the second amount and the units do not add up
            body, notes = _split_tail(a2['rest'])
            segs = body.split(',')
            return [_make_item(a1, segs[0], notes + ['plus ' + seg2.strip()] +
                               [s.strip() for s in segs[1:] if s.strip()], text)]
        items = _parse_simple(seg1, text)
        if items:
            items[0]['note'] = '; '.join(x for x in [items[0]['note'], 'plus ' + seg2] if x)
        return items
    return _parse_simple(text, text)


def main(argv):
    for line in (argv or sys.stdin.read().splitlines()):
        for it in parse_line(line):
            print(line, '=>', it)


if __name__ == '__main__':
    main(sys.argv[1:])
