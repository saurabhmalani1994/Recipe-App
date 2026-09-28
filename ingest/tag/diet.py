"""Diet tagger: vegetarian / no_red_meat (offered presets, D5/R7/R8) and vegetarian_strict (kept
internal, R7) -> `ok`, `adaptable` or `no`, with the swaps that make an adaptable recipe work.

Rules (brief S5a):
  - An item offends a preset when its taxonomy flags hit the preset's excluded flags
    (ingest.subs.validate.DIETS). An item the parser could not resolve (slug None) offends when
    its raw name names a meat or fish (MEAT_WORDS below). The title is never read for diet.
  - `adaptable` = every offending item has a diet-safe way out:
      1. an alternative written in the line ("or vegetable broth", "you may use chicken",
         "can sub chicken stock") that resolves to a safe ingredient, or
      2. a substitution in ingest/subs of quality >= 2 whose context fits the dish (a context
         of `any`, or one of the contexts read from the steps, see dish_contexts), found on the
         item's slug or any taxonomy ancestor, or
      3. the item is optional or a garnish, so it can be left out.
  - A meat the steps add but the ingredient list lacks ("Add chicken pieces", "Place pork in a
    saucepan": scraped lists that dropped lines) offends too, and has no way out except a
    substitution.
  - `unknown` when the recipe has no ingredient lines, or none of them can be read.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.taxonomy import taxonomy as T  # noqa: E402
from ingest.subs import validate as V  # noqa: E402
from ingest.parse.parser import resolve  # noqa: E402

PRESETS = ('vegetarian', 'no_red_meat', 'vegetarian_strict')
MIN_QUALITY = 2

I = re.IGNORECASE
_RED = (r'beef|steaks?|pork|ham|hams|bacon|lamb|mutton|veal|venison|goat|sausages?|chorizo|salami|'
        r'pepperoni|prosciutto|pancetta|brisket|hamburgers?|burgers?|meatballs?|meatloaf|'
        r'hot ?dogs?|frankfurters?|bratwursts?|kielbasa|lard|suet|oxtail|spam|jerky|bison|boar|'
        r'meat|mince|minced meat|ground meat|chops?|ribs?|spareribs|bologna|pastrami|liverwurst')
_POULTRY = r'chicken|turkey|duck|goose|quail|hens?|poussin|pheasant|giblets'
_FISH = (r'fish|salmon|tuna|cod|haddock|tilapia|trout|sardines?|mackerel|halibut|snapper|'
         r'sea ?bass|swordfish|catfish|anchov(?:y|ies)|herring|pollock|sole|flounder|mahi')
_SHELL = (r'shrimps?|prawns?|crabs?|crabmeat|lobsters?|scallops?|clams?|mussels?|oysters?|squid|'
          r'calamari|octopus|crawfish|crayfish')
MEAT_WORDS = [(re.compile(rf'\b(?:{p})\b', I), fl) for p, fl in (
    (_RED, ('red_meat', 'explicit_meat')),
    (_POULTRY, ('poultry', 'explicit_meat')),
    (_FISH, ('fish', 'explicit_meat')),
    (_SHELL, ('shellfish', 'explicit_meat')))]
# Phrases where a meat word does not mean meat.
NOT_MEAT_RE = re.compile(
    r'\b(?:fish|oyster|duck|steak|hoisin|plum|anchovy|shrimp|crab|clam)\s+(?:sauce|paste|seasoning)s?\b|'
    r'\b(?:chicken|poultry|fish|steak|beef|pork|meat)\s+(?:seasoning|spice|rub|tenderi[sz]er)s?\b|'
    r'\boyster\s+mushrooms?\b|\bcrab\s*apples?\b|\bbeef\s*(?:steak\s+)?tomato(?:es)?\b|'
    r'\bchicken\s+of\s+the\s+woods\b|\b(?:hamburger|burger|hot ?dog|sausage)\s+(?:buns?|rolls?)\b|'
    r'\bgoldfish\b|\bswedish\s+fish\b|\bcelery\s+ribs?\b|\bribs?\s+(?:of\s+)?celery\b|'
    r'\bpork\s+rinds?\b|\bsea\s+salt\b|\bham\s*hock\s+broth\b|\bmince(?:d)?\s+(?:garlic|onion|ginger|shallot|herb)',
    I)
MEATLESS_RE = re.compile(r'\b(?:vegan|vegetarian|meatless|veggie|plant[- ]based|imitation|faux|mock|'
                         r'meat[- ]?free|soy|tofu|seitan|quorn|tempeh|vegetable|mushroom)\b', I)

ALT_RES = [re.compile(p, I) for p in (
    r'(?:^|[\s(;,])or\s+(?:use\s+|try\s+)?(.+)$',
    r'\b(?:you\s+)?(?:may|can|could)\s+(?:also\s+)?(?:use|sub(?:stitute)?|swap(?:\s+in)?)\s+(.+)$',
    r'\b(?:sub(?:stitute)?|replace\s+with|swap\s+for)\s+(.+)$',
)]


def _ing():
    return T.load()


_SUBS = {}


def subs_by_target():
    if not _SUBS:
        ing, entries = V.load()
        by = {}
        for e in entries:
            by.setdefault(e['target'], []).append(e)
        _SUBS['by'] = by
    return _SUBS['by']


def flags_from_words(text):
    """Diet flags implied by meat/fish words in free text (for items the parser left
    unresolved); empty when the text is meatless or the word is not meat."""
    if not text:
        return set()
    t = NOT_MEAT_RE.sub(' ', text)
    if MEATLESS_RE.search(t):
        return set()
    out = set()
    for rx, fl in MEAT_WORDS:
        if rx.search(t):
            out |= set(fl)
    return out


GENERIC_MEAT_SLUGS = {'meat'}


def item_flags(item):
    slug = item.get('slug')
    if slug in GENERIC_MEAT_SLUGS:
        # "crab brown and white meat" resolves to the generic `meat` (red); a named animal wins
        words = flags_from_words(re.sub(r'\bmeat\b', ' ', item.get('raw_name') or '', flags=I))
        if words:
            return words
    if slug:
        return set(T.flags_of(_ing(), slug))
    return flags_from_words(item.get('raw_name'))


# openrecipes lost the names on some records: "1 cup 1 cup", "12 whole 12 whole".
NAMELESS_LINE_RE = re.compile(
    r'\s*(?P<a>[\d½¼¾⅓⅔/.\s-]*\s*(?:cups?|whole|cloves?|packages?|pinch(?:es)?|teaspoons?|tablespoons?|'
    r'ounces?|pounds?|sprigs?|containers?|box(?:es)?|cans?|jars?|slices?|pieces?|bunch(?:es)?|dash(?:es)?|'
    r'heads?|stalks?|quarts?|pints?|grams?|g|kg|ml|liters?|lbs?|oz|tsp|tbsp|small|medium|large)?'
    r'(?:,\s*weight)?)\s+(?P=a)\s*', I)


def is_nameless_line(line):
    return bool(line) and bool(NAMELESS_LINE_RE.fullmatch(line))


def offends(flags, preset):
    return bool(set(V.DIETS[preset]) & set(flags))


def _clean_alt(text):
    text = re.split(r'\b(?:but|if|for\s+(?:a|the)\b|to\s+make\b|when\b)', text, maxsplit=1, flags=I)[0]
    return text.strip(' ,;.()')


def alternatives(item):
    """Alternative ingredients written in the item's note: [(text, slug|None, flags)]."""
    out = []
    note = item.get('note') or ''
    for part in re.split(r'[;]', note):
        if re.search(r"\bnot\b|\bno\b|n't\b|\bnever\b|\bavoid\b", part, I):
            continue  # "NOT in brine or water"
        for rx in ALT_RES:
            m = rx.search(part)
            if not m:
                continue
            txt = _clean_alt(m.group(1))
            if not txt:
                continue
            if MEATLESS_RE.search(txt) and re.search(r'\b(?:vegan|vegetarian|meatless|veggie|plant[- ]based|meat[- ]?free)\b', txt, I):
                out.append((txt, None, set()))
                break
            slug, _ = resolve(txt)
            if not slug:
                # an alternative we cannot read ("or unsmoked depending on your preference") is
                # never taken as a diet-safe way out
                continue
            out.append((txt, slug, set(T.flags_of(_ing(), slug))))
            break
    return out


# ------------------------------------------------------------------ dish contexts

CONTEXT_RES = {
    'soup': r'\b(?:soups?|stews?|chowders?|chil[ie]s?|bisques?|potage|gumbo|pho|ramen|broth)\b',
    'braise': r'\b(?:brais\w*|stew\w*|slow[- ]cook\w*|crock[- ]?pot|casserole|curr(?:y|ies)|pot roast|'
              r'pressure[- ]cook\w*|tagine|simmer\w*)\b',
    'sauce': r'\b(?:sauces?|gravy|ragu|bolognese|reduce\w*)\b',
    'stir_fry': r'\b(?:stir[- ]?fr\w*|wok)\b',
    'frying': r'\b(?:(?:re)?fr(?:y|ied|ies|ying)|saut[ée]\w*|pan[- ]fr\w*|deep[- ]fr\w*|sear\w*|brown(?:ed)? (?:the|in))\b',
    'baking': r'\b(?:bak(?:e|ed|es|ing)(?! (?:soda|powder))|oven|pastry|doughs?|biscuits?|cookies?|cakes?|'
              r'breads?|muffins?|pies?|tortillas?|rolls|scones?|tarts?|crusts?)\b',
    'marinade': r'\bmarinat\w*\b',
    'dressing': r'\b(?:dressing|vinaigrette|salads?)\b',
    'dessert': r'\b(?:desserts?|cakes?|cookies?|puddings?|pies?|ice cream|mousse|jell(?:y|o)|sweets?|fudge|candy)\b',
    'beverage': r'\b(?:drinks?|smoothies?|cocktails?|shakes?|juices?|punch|lemonade)\b',
}
CONTEXT_RES = {k: re.compile(v, I) for k, v in CONTEXT_RES.items()}


# Ingredient hints for a dish with no usable steps: a wok sauce with noodles or rice is a
# stir-fry; flour with a raising agent is baking.
STIR_FRY_SAUCES = {'oyster_sauce', 'hoisin_sauce', 'stir_fry_sauce', 'black_bean_sauce', 'chili_garlic_sauce'}
STIR_FRY_STARCH_RE = re.compile(r'noodle|rice', I)
LEAVENING = {'baking_powder', 'baking_soda', 'yeast', 'instant_yeast', 'active_dry_yeast', 'fresh_yeast'}


def dish_contexts(raw, items=()):
    """Substitution contexts (ingest.subs.validate.CONTEXTS) the dish fits, read from the title,
    category, steps and a few ingredient hints. The title is used here only to pick a
    substitution's context, never to decide diet."""
    text = ' '.join([raw.get('title') or '', raw.get('category') or ''] + list(raw.get('steps') or []))
    out = {k for k, rx in CONTEXT_RES.items() if rx.search(text)}
    slugs = {it.get('slug') for it in items if it.get('slug')}
    if slugs & STIR_FRY_SAUCES and any(STIR_FRY_STARCH_RE.search(s) for s in slugs):
        out.add('stir_fry')
    if slugs & LEAVENING and any('flour' in s for s in slugs):
        out.add('baking')
    return out


def _fits(entry, contexts, item_optional):
    cs = set(entry.get('contexts') or [])
    if 'any' in cs:
        return True
    if item_optional and 'garnish' in cs:
        return True
    return bool(cs & contexts)


def best_substitution(slug, preset, contexts, item_optional=False):
    if not slug:
        return None
    ing = _ing()
    by = subs_by_target()
    targets = T.ancestors(ing, slug)
    cands = []
    for depth, t in enumerate(targets):
        for e in by.get(t, []):
            if e.get('quality', 0) < MIN_QUALITY:
                continue
            if not V.diet_safe(V.substitute_flags(ing, e), preset):
                continue
            if not _fits(e, contexts, item_optional):
                continue
            # on a tie, prefer the general swap ("vegetable stock") over a context-specific one
            specific = 'any' not in (e.get('contexts') or [])
            cands.append((-e['quality'], depth, specific, e['id'], e))
    if not cands:
        return None
    cands.sort(key=lambda c: c[:4])
    return cands[0][4]


def _sub_text(entry):
    ing = _ing()
    names = []
    for c in entry.get('substitute') or []:
        rec = ing.get(c.get('slug')) or {}
        names.append(rec.get('name') or c.get('slug'))
    return ' + '.join(names)


# ------------------------------------------------------------------ steps scan

_STEP_VERBS = (r'add|place|put|brown|fry|saute|sauté|cook|boil|simmer|roast|bake|stuff|season|rub|'
               r'coat|dip|cut|slice|shred|wrap|arrange|lay|sear|grill|return|toss|combine|mix')
_STEP_MEAT = (r'chicken|pork|beef|ham|bacon|sausages?|turkey|lamb|veal|shrimps?|prawns?|fish|salmon|'
              r'tuna|crab|steaks?|meatballs|giblets')
STEP_MEAT_RE = re.compile(
    rf'\b(?:{_STEP_VERBS})\b(?:\s+(?:the|in|into|with|all|a|your|some|cooked|diced|cubed|sliced|'
    rf'chopped|shredded|browned|boneless|skinless|raw|leftover|remaining|reserved))*\s+'
    rf'({_STEP_MEAT})\b(?!\s*(?:broth|stock|bouillon|soup|fat|drippings|juices|seasoning|flavou?r|'
    rf'base|gravy|sauce|mixture|marinade)\b)(?![^.;]{{0,25}}\bor\b)', I)
_SKIP_STEP_RE = re.compile(r'\b(?:serve|serving|goes well|excellent|delicious|great|good)\s+(?:it\s+)?'
                           r'(?:with|for|over|alongside)|\bnotes?\s*:|\bvariation|\bif (?:desired|you like|'
                           r'you want|using)\b|\boptional', I)


def unlisted_step_meats(raw, items):
    """Meats that steps add but no ingredient line names. [(word, slug, flags)]."""
    ing_text = ' '.join(raw.get('ingredients') or []).lower()
    out = {}
    for step in raw.get('steps') or []:
        for sent in re.split(r'(?<=[.!?])\s+', step):
            if _SKIP_STEP_RE.search(sent):
                continue
            for m in STEP_MEAT_RE.finditer(sent):
                word = m.group(1).lower()
                if re.search(rf'\b{re.escape(word.rstrip("s"))}s?\b(?!\s*(?:broth|stock|bouillon|soup|'
                             rf'flavou?r|seasoning|base|gravy))', ing_text):
                    continue
                fl = flags_from_words(word)
                if not fl:
                    continue
                slug, _ = resolve(word)
                out.setdefault(word, (word, slug, fl if not slug else set(T.flags_of(_ing(), slug)) or fl))
    return list(out.values())


# ------------------------------------------------------------------ main

OMIT_RE = re.compile(r'(?:^|[;,(]\s*)(?:optional(?!\s+to\s)|to serve|for serving|to garnish|for garnish|'
                     r'garnish|if desired|if you like|if using)\b', I)


def _is_optional(item):
    """The line itself says the item can be left out. The parser's `optional` flag alone is not
    enough: "2 whole sea bass (optional to keep head on)" is not an optional fish."""
    note = item.get('note') or ''
    name = item.get('raw_name') or ''
    return bool(OMIT_RE.search(note) or OMIT_RE.search(name))


def tag_diet(raw, items):
    """items: parsed items (dicts from ingest.parse.parser.parse_line), in line order.
    Returns {preset: {'status', 'swaps', 'blockers'}} plus a `reason` when unknown."""
    all_lines = raw.get('ingredients') or []
    lines = [l for l in all_lines if l and l.strip()]
    items = [it for it in items if not (isinstance(it.get('line'), int) and it['line'] < len(all_lines)
                                        and is_nameless_line(all_lines[it['line']]))]
    readable = [it for it in items if it.get('slug') or flags_from_words(it.get('raw_name'))]
    if not lines or not items or not readable:
        reason = 'no ingredient lines' if not lines else 'no ingredient could be read'
        return {p: {'status': 'unknown', 'swaps': [], 'blockers': [], 'reason': reason} for p in PRESETS}
    contexts = dish_contexts(raw, items)
    extra = unlisted_step_meats(raw, items)
    out = {}
    for p in PRESETS:
        swaps, blockers = [], []
        for it in items:
            fl = item_flags(it)
            if not offends(fl, p):
                continue
            name = it.get('raw_name') or it.get('slug')
            way = None
            for txt, slug, afl in alternatives(it):
                if not offends(afl, p):
                    way = {'item': name, 'slug': it.get('slug'), 'use': txt, 'use_slug': slug,
                           'via': 'alternative'}
                    break
            opt = _is_optional(it)
            if way is None:
                e = best_substitution(it.get('slug'), p, contexts, opt)
                if e is not None:
                    way = {'item': name, 'slug': it.get('slug'), 'use': _sub_text(e),
                           'use_slug': [c['slug'] for c in e['substitute']], 'via': 'substitution',
                           'sub_id': e['id'], 'quality': e['quality']}
            if way is None and opt:
                way = {'item': name, 'slug': it.get('slug'), 'use': None, 'via': 'omit'}
            if way is None:
                blockers.append({'item': name, 'slug': it.get('slug')})
            else:
                swaps.append(way)
        for word, slug, fl in extra:
            if not offends(fl, p):
                continue
            e = best_substitution(slug, p, contexts)
            if e is not None:
                swaps.append({'item': word, 'slug': slug, 'use': _sub_text(e),
                              'use_slug': [c['slug'] for c in e['substitute']], 'via': 'substitution',
                              'sub_id': e['id'], 'quality': e['quality'], 'from_steps': True})
            else:
                blockers.append({'item': word, 'slug': slug, 'from_steps': True})
        status = 'no' if blockers else ('adaptable' if swaps else 'ok')
        out[p] = {'status': status, 'swaps': swaps if status == 'adaptable' else [],
                  'blockers': blockers}
    return out
