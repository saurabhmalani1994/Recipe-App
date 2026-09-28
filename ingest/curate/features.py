"""Per-recipe curation features and junk detectors (brief S8 #2, #3).

features(raw, derived, ratings) turns one raw recipe plus the build's own derivation
(build_corpus.derive: parsed items, tags, course, cuisine) into a flat dict: everything the
dedupe, the quality score and the selection need, so the 2.2M-line scan runs once and the
ranking can be re-run from its output in minutes.

Junk detectors (JUNK_FLAGS), each counted. A recipe with a HARD_JUNK flag is never selected;
missing_core_ingredient halves the quality score instead (see HARD_JUNK for why).
  ad_or_link              "click here", a URL, "advertisement", "brought to you by", "subscribe"...
  see_above               a component that lives in another recipe: "see above", "see recipe",
                          "use previous", "page 12". ("see below" is left alone: that part is
                          usually further down the same recipe.)
  title_is_ingredient     the whole title is one raw ingredient ("Chicken", "Carrots"), so the
                          title says nothing about the dish
  missing_core_ingredient the title names a core ingredient (a protein, vegetable, fruit,
                          legume, grain, pasta, nut, egg, dairy or chile) that no ingredient
                          line mentions ("Yellow Squash Frittata" with no squash). Mentions
                          after "mock", "no", "eggless"... or before "style", "flavored",
                          "free"... are not required.
  bad_title               over 120 characters, or fewer than 3 letters
"""
import re
from urllib.parse import urlparse

from ingest.parse.parser import SPAN_STOP
from ingest.taxonomy import taxonomy as T
from ingest.taxonomy.normalize import norm_name, norm_tokens

JUNK_FLAGS = ('ad_or_link', 'see_above', 'title_is_ingredient', 'missing_core_ingredient', 'bad_title')
# Flags that exclude a recipe from selection. missing_core_ingredient is a score penalty instead:
# on a hand-read sample of 40 flagged recipes about 15 were true misses ("Egg Drop Soup" with no
# egg), the rest dish words the taxonomy also knows as ingredients ("Potato Dish" made with hash
# browns), too noisy to drop editorial recipes on.
HARD_JUNK = ('ad_or_link', 'see_above', 'title_is_ingredient', 'bad_title')

_AD_RE = re.compile(
    r'click here|https?://|\bwww\.|advertisement|\bsponsored\b|brought to you by|\bsubscribe\b|'
    r'visit (?:our|my|us)\b|follow (?:us|me)\b|sign up for|newsletter|print this recipe|\bpin (?:it|this)\b|'
    r'\blike us on\b|read more (?:at|about)|for (?:the )?full (?:directions|recipe|instructions)', re.I)
_SEE_RE = re.compile(
    r'\b(?:see|from|use|as in|per) (?:the )?(?:above|previous|preceding|prior)\b|'
    r'\bsee (?:the )?(?:index|page|p\.)|\bsee (?:the )?recipe(?! (?:below|in (?:the )?(?:directions|instructions|method)))|'
    r'\bpage \d+|\bpg\.? ?\d+|\brecipe (?:above|follows on|on page)', re.I)

# Categories whose single-name title says nothing about the dish; sauces, prepared foods,
# desserts and drinks are dish names in their own right ("Pesto", "Hummus", "Brownies").
RAW_CATEGORIES = {'protein', 'vegetable', 'fruit', 'dairy', 'herb', 'spice', 'grain', 'legume', 'nut_seed',
                  'pasta_noodle', 'egg', 'fat_oil', 'flour_thickener', 'sweetener', 'basic', 'salt',
                  'aromatic', 'chile', 'vinegar_acid', 'leavener', 'nondairy', 'cereal'}
CORE_CATEGORIES = {'protein', 'vegetable', 'fruit', 'legume', 'pasta_noodle', 'grain', 'nut_seed', 'egg',
                   'dairy', 'chile'}
NEG_PREV = {'mock', 'faux', 'no', 'without', 'eggless', 'meatless', 'vegan', 'vegetarian', 'imitation', 'not',
            'fake', 'like', 'free'}
NEG_NEXT = {'style', 'flavor', 'flavored', 'flavour', 'free', 'less', 'fried', 'friendly', 'shaped', 'like',
            'substitute', 'inspired', 'lover', 'lovers', 'dog', 'seasoning', 'spice', 'rub',
            # a product named after the ingredient: "Caramel Apple Dip", "Pistachio butter"
            'butter', 'cream', 'creams', 'sauce', 'dip', 'spread', 'milk', 'oil', 'jam', 'jelly', 'syrup', 'glaze',
            'dressing', 'frosting', 'icing', 'marinade', 'vinegar', 'chip', 'crisp', 'topping', 'filling',
            'sprinkle', 'dust', 'salt', 'sugar', 'extract', 'liqueur', 'tea', 'soda', 'water', 'juice'}
# Title words the taxonomy knows only in another sense ("air fryer", "Chuck's", "Swiss meringue").
AMBIGUOUS_KEYS = {'fryer', 'chuck', 'swiss', 'hen', 'broiler', 'roaster', 'curry', 'jerk', 'jerky', 'praline',
                  'hero', 'sub', 'deer', 'squash', 'jack', 'cobbler', 'tart', 'trifle', 'truffle'}
# Names that are also dish words or umbrella terms ("salad" resolves to greens, "meat loaf" to
# meat, "fruit salad" to mixed fruit), so a title naming them requires nothing.
GENERIC_SLUGS = {'greens', 'meat', 'mixed_fruit', 'mixed_berries', 'mixed_nuts', 'mixed_vegetables', 'cheese',
                 'milk', 'lasagna_noodles', 'meatballs', 'mexican_crema', 'seafood', 'fish', 'white_fish',
                 'shellfish', 'poultry', 'game', 'beans', 'nuts', 'vegetables', 'fruit', 'pasta', 'noodles'}
KEY_STOP = SPAN_STOP | {'style', 'country', 'baby', 'small', 'large', 'whole', 'ground', 'boneless', 'mixed',
                        'dried', 'frozen', 'canned', 'cooked', 'raw', 'wild', 'mini', 'jumbo'}
MAX_TITLE = 120

_FOODCOM_ID_RE = re.compile(r'food\.com/recipe/[^/?#]*?-?(\d+)/?(?:[?#].*)?$')

_STATE = {}


def _tax():
    if not _STATE:
        ing = T.load()
        _STATE.update(ing=ing, index=T.build_index(ing))
    return _STATE


def domain(raw):
    """The recipe's site: the source_url host without "www." for recipenlg (a scrape of many
    sites), else the source name."""
    src = raw.get('source') or ''
    if src == 'recipenlg':
        host = urlparse(raw.get('source_url') or '').netloc.lower()
        host = host.split(':')[0]
        for p in ('www.', 'm.', 'www2.'):
            if host.startswith(p):
                host = host[len(p):]
        return host or 'recipenlg:unknown'
    return src


def foodcom_id(raw):
    """Food.com's numeric recipe id, from a food.com URL or a foodcom:<id> key; else None."""
    if raw.get('source') == 'foodcom':
        tail = (raw.get('id') or '').split(':', 1)[-1]
        return int(tail) if tail.isdigit() else None
    m = _FOODCOM_ID_RE.search(raw.get('source_url') or '')
    return int(m.group(1)) if m else None


def title_mentions(title):
    """[(slug, matched key, start, length)] for the ingredient names in a title, longest match
    first, left to right, not overlapping."""
    st = _tax()
    index = st['index']
    toks = norm_tokens(title or '')
    out = []
    i = 0
    n = len(toks)
    while i < n:
        for L in range(min(4, n - i), 0, -1):
            k = ' '.join(toks[i:i + L])
            if L == 1 and k in SPAN_STOP:
                continue
            if k in index:
                out.append((index[k], k, i, L))
                i += L
                break
        else:
            i += 1
    return out, toks


def title_is_ingredient(title):
    """The whole title is a raw ingredient's own name ("Chicken", "Sweet Potatoes", "Pork Roast").
    A dish name that the taxonomy lists as a synonym ("Fruit Salad", "Spanish Rice") is not."""
    st = _tax()
    k = norm_name(title or '')
    slug = st['index'].get(k)
    if not slug or st['ing'][slug]['category'] not in RAW_CATEGORIES:
        return False
    rec = st['ing'][slug]
    return k in (norm_name(rec.get('name') or slug.replace('_', ' ')), norm_name(slug.replace('_', ' ')))


_TITLE_CUT_RE = re.compile(r'\s[–—-]\s|:|\(')
PRODUCT_HEADS = {'butter', 'cream', 'milk', 'paneer', 'ricotta', 'sausage', 'ravioli', 'stock', 'broth', 'ghee',
                 'yogurt', 'egg substitute', 'breakfast sausage', 'pinto', 'veal', 'goose', 'pumpkin', 'wing'}


def _stem(tok):
    return tok.replace('ll', 'l')[:5]


def missing_core(title, lines, slugs):
    """The title's core-ingredient mentions that no ingredient line carries: [matched key]."""
    st = _tax()
    ing = st['ing']
    mentions, toks = title_mentions(_TITLE_CUT_RE.split(title or '')[0])
    if not mentions:
        return []
    line_toks = set()
    for ln in lines:
        if isinstance(ln, str):
            line_toks.update(norm_tokens(ln))
    # compared on a 5-letter stem, so "apple" meets "applesauce" and "chilli" meets "chili"
    line_stems = {_stem(t) for t in line_toks}
    related = set()
    for s in slugs:
        related.update(T.ancestors(ing, s))
    roots = {T.ancestors(ing, s)[-1] for s in slugs if s in ing}
    out = []
    for slug, key, i, L in mentions:
        if ing[slug]['category'] not in CORE_CATEGORIES or slug in GENERIC_SLUGS:
            continue
        prev = toks[i - 1] if i > 0 else ''
        nxt = toks[i + L] if i + L < len(toks) else ''
        if prev in NEG_PREV or nxt in NEG_NEXT or key in AMBIGUOUS_KEYS or (not nxt and key in PRODUCT_HEADS):
            continue
        chain = T.ancestors(ing, slug)
        if slug in related or any(a in slugs for a in chain) or chain[-1] in roots:
            continue
        if any(_stem(t) in line_stems for t in key.split() if t not in KEY_STOP):
            continue
        out.append(key)
    return out


def junk_flags(raw, slugs):
    title = (raw.get('title') or '').strip()
    lines = [x for x in (raw.get('ingredients') or []) if isinstance(x, str)]
    steps = [x for x in (raw.get('steps') or []) if isinstance(x, str)]
    text = '\n'.join([title] + lines + steps)
    flags = []
    if _AD_RE.search(text):
        flags.append('ad_or_link')
    if _SEE_RE.search('\n'.join(lines + steps)):
        flags.append('see_above')
    if title_is_ingredient(title):
        flags.append('title_is_ingredient')
    elif missing_core(title, lines, slugs):
        flags.append('missing_core_ingredient')
    if len(title) > MAX_TITLE or sum(ch.isalpha() for ch in title) < 3:
        flags.append('bad_title')
    return flags


def norm_title(title):
    """The dedupe key for a title: normalized words minus filler ("easy", "best", "recipe")."""
    toks = [t for t in norm_tokens(title or '') if t not in TITLE_FILLER]
    return ' '.join(toks)


TITLE_FILLER = {'the', 'a', 'an', 'recipe', 'easy', 'best', 'homemade', 'quick', 'simple', 'delicious',
                'my', 'our', 'famous', 'ever', 'world', 'yummy', 'super', 'really', 'very', 'perfect',
                'ultimate', 'classic', 'old', 'fashioned', 'fashion', 'original', 'favorite', 'favourite',
                'i', 'ii', 'iii', 'iv', '1', '2', '3', 'no'}


def features(raw, derived, ratings=None):
    """The flat record the scan writes for one recipe (see module docstring)."""
    items, tags, course, (cuisine, cconf, csrc) = derived
    lines = raw.get('ingredients') or []
    text_lines = [n for n, ln in enumerate(lines) if isinstance(ln, str) and ln.strip()]
    resolved = {it['line'] for it in items if it.get('slug')}
    with_qty = {it['line'] for it in items if it.get('qty') is not None}
    slugs = sorted({it['slug'] for it in items if it.get('slug')})
    steps = [s.strip() for s in (raw.get('steps') or []) if isinstance(s, str) and s.strip()]
    tm = tags['time']
    fid = foodcom_id(raw)
    rating = raw.get('rating') if isinstance(raw.get('rating'), (int, float)) else None
    rcount = raw.get('rating_count') if isinstance(raw.get('rating_count'), int) else None
    rsrc = 'source' if rating is not None and rcount else None
    if rsrc is None and fid is not None and ratings:
        got = ratings.get(fid)
        if got and got[1] and got[2] is not None:
            rating, rcount, rsrc = got[2], got[1], 'foodcom_interactions'
    n = len(text_lines)
    return {
        'key': raw['id'],
        'source': raw.get('source'),
        'domain': domain(raw),
        'title': (raw.get('title') or '').strip(),
        'ntitle': norm_title(raw.get('title')),
        'slugs': slugs,
        'n_lines': n,
        'resolved': sum(1 for x in text_lines if x in resolved) / n if n else 0.0,
        'qty': sum(1 for x in text_lines if x in with_qty) / n if n else 0.0,
        'n_steps': len(steps),
        'step_chars': sum(len(s) for s in steps),
        'max_step': max((len(s) for s in steps), default=0),
        'time_source': tm.get('source'),
        'total_min': tm.get('total_min'),
        'course': course,
        'cuisine': cuisine,
        'cuisine_conf': cconf,
        'veg': tags['diet']['vegetarian']['status'],
        'nrm': tags['diet']['no_red_meat']['status'],
        'image': bool(raw.get('image_url')),
        'servings': bool(raw.get('yield_text')),
        'foodcom_id': fid,
        'rating': rating,
        'rating_count': rcount,
        'rating_source': rsrc,
        'junk': junk_flags(raw, set(slugs)),
    }
