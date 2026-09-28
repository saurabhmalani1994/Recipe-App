"""Course tagger (brief S9a #2, ruling R9): one course per recipe from a small set of
deterministic rules over the title, the source's own category and tags, and ingredient signals.

tag_course(raw, items=None) -> {'course': one of COURSES, 'rule': which rule decided}
  raw    one record in the schema/raw_recipe.md shape
  items  its parsed ingredient items (ingest.tag.tagger.parse_items); parsed here when not given

Order, first hit wins:
  1 head   the dish word of the title's head phrase. The title is cut before " with ", " for ",
           " in ", " on ", " a la ", a colon, an en dash or a bracket ("Jerk sauce (for any
           meat)" -> "jerk sauce"), then read right to left for the first dish word, trying
           longer phrases before single words ("ice cream sandwiches" is dessert, not a
           sandwich). Some dish words depend on the ingredients: a pie, tart, casserole, salad or
           pastry is main with a meat or fish protein; bites, balls, pastries and biscuits are
           dessert when sweet.
  2 title  the same search over the whole title, when the head phrase had no dish word.
  3 category  the source's own category field (bbcgoodfood, foodcom, themealdb).
  4 tags   the source's own tags, for sources whose tags are course-like (not recipenlg or
           openrecipes, whose tags are ingredient names or free keywords).
  5 ingredients  meat or fish protein -> main; sweet with flour or chocolate -> dessert; yeast
           and flour -> baking; mostly alcohol and juice with no heat -> drink; else main.

The labelling conventions the rules aim at are in ingest/build/gold/score_course.py.
"""
import os
import re
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.taxonomy import taxonomy as T  # noqa: E402

COURSES = ('main', 'side', 'dessert', 'breakfast', 'snack', 'drink', 'sauce_condiment', 'baking')

# ---- dish words ------------------------------------------------------------------------------
# A value is a course, or a callable(features) -> course for words whose course depends on the
# ingredients. Keys are lower-case; a key with a space is a two-word phrase.


def _sweet_else(other):
    return lambda f: 'dessert' if f['sweet'] else other


def _protein_else(other):
    return lambda f: 'main' if f['protein'] else other


def _pie(f):
    if f['protein']:
        return 'main'
    return 'dessert' if f['sweet'] or not f['savoury'] else 'main'


def _biscuits(f):
    return 'dessert' if f['sweet'] else 'baking'


_DRINK = ('coffee', 'tea', 'latte', 'cappuccino', 'espresso', 'smoothie', 'smoothies', 'shake',
          'milkshake', 'lemonade', 'limeade', 'punch', 'cocktail', 'cocktails', 'martini',
          'margarita', 'margaritas', 'mojito', 'sangria', 'kahlua', 'liqueur', 'cordial', 'juice',
          'eggnog', 'nog', 'toddy', 'spritz', 'fizz', 'julep', 'daiquiri', 'colada', 'soda',
          'chai', 'cooler', 'cider', 'wassail', 'frappe', 'frappuccino', 'lassi', 'horchata',
          'mocha', 'bellini', 'mimosa', 'negroni', 'sour', 'slush', 'slushie', 'float', 'drink',
          'drinks', 'beverage', 'hot chocolate', 'hot cocoa', 'iced tea', 'mulled wine',
          'bloody mary', 'old fashioned', 'tonic', 'grog', 'shots', 'shooter', 'shooters')
_SAUCE = ('sauce', 'sauces', 'dressing', 'vinaigrette', 'marinade', 'salsa', 'pesto', 'chutney',
          'relish', 'jam', 'preserves', 'marmalade', 'pickles', 'pickle', 'pickled', 'ketchup',
          'mayonnaise', 'mayo', 'aioli', 'gravy', 'rub', 'seasoning', 'spice mix', 'spice blend',
          'icing', 'frosting', 'glaze', 'syrup', 'curd', 'chimichurri', 'condiment', 'butter',
          'compote', 'coulis', 'ganache', 'topping', 'harissa', 'masala paste', 'curry paste',
          'stock', 'broth', 'bouillon', 'tapenade', 'gremolata', 'sambal', 'raita', 'tzatziki',
          'mustard', 'jelly', 'confit', 'caramel', 'butterscotch sauce', 'whipped cream',
          'buttercream', 'filling', 'spread', 'oil', 'vinegar', 'blend', 'mix')
_BREAKFAST = ('pancake', 'pancakes', 'waffle', 'waffles', 'french toast', 'porridge', 'oatmeal',
              'oats', 'granola', 'muesli', 'crepe', 'crepes', 'crêpes', 'omelet', 'omelette',
              'scrambled eggs', 'breakfast', 'brunch', 'hash browns', 'toast', 'eggs benedict',
              'shakshuka', 'bircher', 'overnight oats', 'hotcakes', 'flapjacks')
_DESSERT = ('cake', 'cakes', 'cupcake', 'cupcakes', 'cookie', 'cookies', 'brownie', 'brownies',
            'blondies', 'cheesecake', 'fudge', 'candy', 'candies', 'truffle', 'truffles',
            'ice cream', 'sorbet', 'sherbet', 'gelato', 'mousse', 'trifle', 'cobbler', 'crisp',
            'crumble', 'pavlova', 'meringue', 'meringues', 'macaroons', 'macarons', 'biscotti',
            'shortbread', 'bars', 'squares', 'traybake', 'doughnuts', 'donuts', 'doughnut',
            'roulade', 'lamingtons', 'tiramisu', 'parfait', 'sundae', 'custard', 'flan',
            'pudding', 'dessert', 'desserts', 'treat', 'treats', 'chocolates', 'chocolate',
            'toffee', 'brittle', 'praline', 'pralines', 'bonbons', 'dumpling', 'panna cotta',
            'cheesecakes', 'eclairs', 'profiteroles', 'strudel', 'baklava', 'cannoli', 'churros',
            'snickerdoodles', 'gingerbread', 'crumb cake', 'coffee cake', 'jello', 'jell-o',
            'congealed salad', 'pretzel salad', 'fluff', 'delight', 'dream', 'bark', 'clusters',
            'popsicles', 'lollies', 'semifreddo', 'granita', 'souffle', 'soufflé', 'mess',
            'fool', 'crunch', 'kisses', 'drops', 'snowballs', 'haystacks', 'sticks',
            'tartlets', 'turnovers', 'galette', 'cobblers', 'crisps', 'pie', 'pies', 'tart',
            'tarts', 'torte', 'gateau', 'sponge', 'bundt', 'muffin cake', 'biscuits', 'biscuit',
            'bites', 'balls', 'pastries', 'pastry cream', 'upside-down cake', 'dumplings',
            'ice cream sandwiches', 'ice cream sandwich', 'ice cream cake', 'ice cream pie')
_BAKING = ('bread', 'breads', 'loaf', 'loaves', 'rolls', 'buns', 'bun', 'muffins', 'muffin',
           'scones', 'scone', 'dough', 'pastry', 'crust', 'focaccia', 'bagels', 'bagel',
           'crackers', 'cornbread', 'brioche', 'naan', 'flatbread', 'flatbreads', 'tortillas',
           'challah', 'baguette', 'sourdough', 'ciabatta', 'pretzels', 'croissants', 'babka',
           'popovers', 'breadsticks', 'crumpets', 'english muffins', 'soda bread', 'noodles',
           'pasta dough', 'pizza dough', 'pie crust', 'shortcrust', 'puff pastry', 'biscuit dough')
_SNACK = ('dip', 'dips', 'puffs', 'canapes', 'canapés', 'crostini', 'bruschetta', 'nachos',
          'wings', 'chips', 'popcorn', 'trail mix', 'snack', 'snacks', 'appetizer', 'appetizers',
          'starter', 'deviled eggs', 'devilled eggs', 'spring rolls', 'egg rolls', 'fritters',
          'tempura', 'hummus', 'houmous', 'guacamole', 'labneh', 'pate', 'pâté', 'samosas',
          'samosa', 'pakora', 'pakoras', 'bhajis', 'potstickers', 'dumplings', 'nuts', 'pecans',
          'almonds', 'walnuts', 'cashews', 'peanuts', 'party mix', 'chex mix', 'crab puffs',
          'cheese balls', 'cheese ball', 'sliders', 'skewers', 'poppers', 'rumaki', 'spread',
          'salsa dip', 'cheese straws', 'tapas', 'mezze', 'crudites', 'pinwheels', 'nibbles',
          'squid', 'calamari', 'edamame', 'croquettes', 'arancini', 'empanadas', 'quesadillas')
_SIDE = ('slaw', 'coleslaw', 'potatoes', 'potato', 'mash', 'mashed potatoes', 'fries', 'rice',
         'pilaf', 'pilau', 'beans', 'vegetables', 'veggies', 'veg', 'greens', 'stuffing',
         'puree', 'purée', 'gratin', 'orzo', 'couscous', 'polenta', 'grits', 'remoulade',
         'side', 'sides', 'side dish', 'asparagus', 'broccoli', 'carrots', 'spinach', 'cabbage',
         'courgettes', 'zucchini', 'squash', 'sprouts', 'cauliflower', 'corn', 'peas', 'kale',
         'mushrooms', 'eggplant', 'aubergine', 'tomatoes', 'onions', 'leeks', 'parsnips',
         'beets', 'beetroot', 'yams', 'sweet potatoes', 'fried rice', 'risotto', 'dal', 'dhal',
         'succotash', 'ratatouille', 'hash', 'wedges', 'chips and', 'roast potatoes',
         'salad', 'salads')
_MAIN = ('soup', 'soups', 'stew', 'stews', 'chili', 'chilli', 'chowder', 'bisque', 'gumbo',
         'curry', 'casserole', 'lasagna', 'lasagne', 'spaghetti', 'pasta', 'rigatoni', 'penne',
         'fettuccine', 'linguine', 'macaroni', 'mac', 'ziti', 'ravioli', 'tortellini', 'gnocchi',
         'pizza', 'burger', 'burgers', 'sandwich', 'sandwiches', 'wrap', 'wraps', 'tacos', 'taco',
         'burritos', 'burrito', 'enchiladas', 'fajitas', 'quiche', 'pot pie', 'potpie',
         'meatballs', 'meat balls', 'meatloaf', 'roast', 'steak', 'steaks', 'chops', 'ribs',
         'chicken', 'beef', 'pork', 'lamb', 'veal', 'turkey', 'duck', 'ham', 'sausage',
         'sausages', 'bacon', 'fish', 'salmon', 'tuna', 'cod', 'haddock', 'tilapia', 'trout',
         'bass', 'herrings', 'herring', 'halibut', 'shrimp', 'prawns', 'prawn', 'scallops',
         'lobster', 'crab', 'mussels', 'clams', 'oysters', 'seafood', 'stir fry', 'stir-fry',
         'noodle', 'japchae', 'pad thai', 'ramen', 'pho', 'kabse', 'kabsa', 'biryani', 'paella',
         'jambalaya', 'tagine', 'goulash', 'stroganoff', 'scallopini', 'scaloppine', 'piccata',
         'marsala', 'parmesan', 'parmigiana', 'alfredo', 'carbonara', 'bolognese', 'satay',
         'kebabs', 'kebab', 'kabobs', 'tikka', 'masala', 'korma', 'vindaloo', 'rendang',
         'fricassee', 'rissoles', 'patties', 'cutlets', 'schnitzel', 'bistek', 'adobo',
         'teriyaki', 'bourguignon', 'burgundy', 'cassoulet', 'chili con carne', 'frittata',
         'hotpot', 'hot pot', 'pie filling', 'dinner', 'supper', 'main', 'torte', 'strata',
         'stuffed peppers', 'enchilada', 'bake', 'pot roast', 'gado gado', 'salmon cakes',
         'crab cakes', 'fish cakes', 'crab salad', 'tuna salad', 'chicken salad',
         'mac n cheese', "mac 'n' cheese", 'mac and cheese', 'macaroni and cheese', 'pilaf with',
         'wings dinner', 'mole', 'tofu', 'tempeh', 'seitan', 'lentils', 'chickpeas', 'pitas',
         'pollo', 'carne', 'cerdo', 'wellington', 'shepherd', 'cottage pie', 'fish pie')

# words whose course depends on the ingredients
_DEPENDENT = {
    'pie': _pie, 'pies': _pie, 'tart': _pie, 'tarts': _pie, 'tartlets': _pie, 'galette': _pie,
    'turnovers': _pie, 'torte': _pie, 'strudel': _pie, 'dumpling': _pie, 'dumplings': _pie,
    'casserole': _protein_else('side'), 'salad': _protein_else('side'),
    'salads': _protein_else('side'), 'bake': _protein_else('side'),
    'bites': _sweet_else('snack'), 'balls': _sweet_else('snack'), 'puffs': _sweet_else('snack'),
    'pastries': _sweet_else('snack'), 'sticks': _sweet_else('snack'),
    'biscuits': _biscuits, 'biscuit': _biscuits, 'fritters': _sweet_else('snack'),
    'crisp': _sweet_else('snack'), 'crisps': _sweet_else('snack'), 'bars': _sweet_else('snack'),
    'squares': _sweet_else('snack'), 'bread': lambda f: 'baking', 'rice': _protein_else('side'),
    'fried rice': _protein_else('side'), 'noodles': lambda f: 'main' if f['protein'] or f['cooked_sauce'] else 'baking',
    'potatoes': _protein_else('side'), 'potato': _protein_else('side'),
    'beans': _protein_else('side'), 'mushrooms': _protein_else('side'),
    'hash': _protein_else('side'), 'wedges': _protein_else('side'), 'spread': _sweet_else('snack'),
    'chocolate': lambda f: 'dessert', 'filling': _sweet_else('sauce_condiment'),
    'toast': lambda f: 'breakfast' if f['sweet'] else 'side', 'nuts': lambda f: 'snack',
    'sour': lambda f: 'drink' if f['alcohol'] else None, 'float': lambda f: 'drink' if f['liquid'] else None,
    'tea': lambda f: 'drink', 'mix': lambda f: None, 'blend': lambda f: None,
    'oil': lambda f: None if f['protein'] else 'sauce_condiment',
    'vinegar': lambda f: 'sauce_condiment', 'butter': lambda f: 'sauce_condiment',
    'mustard': lambda f: 'sauce_condiment', 'jelly': lambda f: 'sauce_condiment',
    'squid': lambda f: 'snack', 'lentils': _protein_else('main'), 'chickpeas': _protein_else('main'),
}

LEXICON = {}
for _course, _words in (('drink', _DRINK), ('sauce_condiment', _SAUCE), ('breakfast', _BREAKFAST),
                        ('baking', _BAKING), ('snack', _SNACK), ('side', _SIDE), ('main', _MAIN),
                        ('dessert', _DESSERT)):
    for _w in _words:
        # the first list a word appears in wins, so the order above is the tie-break; the
        # phrases that need an ingredient check are overridden by _DEPENDENT below
        LEXICON.setdefault(_w, _course)
LEXICON.update(_DEPENDENT)

# ---- title handling --------------------------------------------------------------------------
_CUT_RE = re.compile(r'\s+(?:with|for|in|on|over|a la|à la|served|en|con|au|alla|topped)\s+|\s*[:(\[–—|]\s*|'
                     r'\s+-\s+(?=[a-z]+\s+[a-z])', re.I)
_WORD_RE = re.compile(r"[a-zà-ÿ]+(?:[-'’][a-zà-ÿ]+)*", re.I)
_NOISE_RE = re.compile(r'\b(?:recipe|recipes|ii|iii|iv|easy|best|quick|simple|homemade|my|mom\'?s|'
                       r'grandma\'?s|the|a|an|version|style|perfect|classic|healthy)\b', re.I)


def _words(text):
    text = text.replace('’', "'").lower()
    text = _NOISE_RE.sub(' ', text)
    return _WORD_RE.findall(text)


def _lookup(words, feats):
    """Right to left, three- then two-word phrase before one word; returns (course, word) or (None, None)."""
    for i in range(len(words) - 1, -1, -1):
        cands = []
        if i >= 2:
            cands.append(' '.join(words[i - 2:i + 1]))
        if i >= 1:
            cands.append(words[i - 1] + ' ' + words[i])
        cands.append(words[i])
        for c in cands:
            v = LEXICON.get(c)
            if v is None:
                continue
            got = v(feats) if callable(v) else v
            if got:
                return got, c
    return None, None


def head_phrase(title):
    parts = _CUT_RE.split(title or '', maxsplit=1)
    return parts[0] if parts and parts[0].strip() else (title or '')


# ---- source categories and tags --------------------------------------------------------------
# lower-cased source category (or one comma-separated part of it) -> course
CATEGORY_MAP = {
    # bbcgoodfood
    'dessert': 'dessert', 'treat': 'dessert', 'side dish': 'side', 'dinner': 'main',
    'main course': 'main', 'supper': 'main', 'lunch': 'main', 'condiment': 'sauce_condiment',
    'drink': 'drink', 'cocktails': 'drink', 'snack': 'snack', 'starter': 'snack',
    'canapes': 'snack', 'buffet': 'snack', 'breakfast': 'breakfast', 'brunch': 'breakfast',
    'soup': 'main', 'afternoon tea': 'dessert', 'mocktails': 'drink', 'smoothie': 'drink',
    # foodcom
    'pie': 'dessert', 'bar cookie': 'dessert', 'drop cookies': 'dessert', 'candy': 'dessert',
    'cheesecake': 'dessert', 'frozen desserts': 'dessert', 'gelatin': 'dessert',
    'beverages': 'drink', 'smoothies': 'drink', 'shakes': 'drink', 'punch beverage': 'drink',
    'breads': 'baking', 'quick breads': 'baking', 'yeast breads': 'baking', 'scones': 'baking',
    'sourdough breads': 'baking', 'bread machine': 'baking',
    'sauces': 'sauce_condiment', 'salad dressings': 'sauce_condiment',
    'chutneys': 'sauce_condiment', 'jellies': 'sauce_condiment', 'spreads': 'sauce_condiment',
    'lunch/snacks': 'snack', 'chicken breast': 'main', 'meat': 'main', 'chicken': 'main',
    'whole chicken': 'main', 'pork': 'main', 'poultry': 'main', 'beef': 'main', 'lamb': 'main',
    'lamb/sheep': 'main', 'goat': 'main', 'seafood': 'main', 'fish': 'main', 'crab': 'main',
    'tuna': 'main', 'chicken thigh & leg': 'main', 'meatloaf': 'main', 'stew': 'main',
    'one dish meal': 'main', 'pasta': 'main', 'vegetable': 'side', 'potato': 'side',
    'rice': 'side', 'beans': 'side', 'breakfast eggs': 'breakfast',
    # themealdb
    'side': 'side',
}
# sources whose `tags` are course-like words, not ingredient names or free keywords
TAG_SOURCES = ('bbcgoodfood', 'foodcom', 'themealdb')
TAG_MAP = {
    'dips': 'snack', 'dip': 'snack', 'dessert': 'dessert', 'desserts': 'dessert',
    'sidedish': 'side', 'side dish': 'side', 'side dishes': 'side', 'soup': 'main',
    'breakfast': 'breakfast', 'brunch': 'breakfast', 'drink': 'drink', 'drinks': 'drink',
    'cocktail': 'drink', 'cocktails': 'drink', 'beverages': 'drink', 'starter': 'snack',
    'canapés': 'snack', 'canapes': 'snack', 'appetizer': 'snack', 'lunch/snacks': 'snack',
    'snack': 'snack', 'baking': None, 'condiment': 'sauce_condiment', 'sauce': 'sauce_condiment',
    'main dish': 'main', 'main course': 'main', 'one dish meal': 'main',
}
# the order a multi-valued category is resolved in (a bbc "Dinner, Side dish" is main)
CATEGORY_PRIORITY = ('drink', 'sauce_condiment', 'breakfast', 'main', 'side', 'snack', 'baking',
                     'dessert')


def _from_category(raw):
    cat = raw.get('category')
    if not cat:
        return None
    parts = [p.strip().lower() for p in str(cat).split(',') if p.strip()]
    got = {CATEGORY_MAP[p] for p in parts if p in CATEGORY_MAP}
    for c in CATEGORY_PRIORITY:
        if c in got:
            return c
    return None


def _from_tags(raw):
    if raw.get('source') not in TAG_SOURCES:
        return None
    got = []
    for t in raw.get('tags') or []:
        c = TAG_MAP.get(str(t).strip().lower())
        if c:
            got.append(c)
    for c in CATEGORY_PRIORITY:
        if c in got:
            return c
    return None


# ---- ingredient features ---------------------------------------------------------------------
PROTEIN_FLAGS = {'red_meat', 'poultry', 'fish', 'shellfish'}
SWEET_CATEGORIES = {'sweetener', 'chocolate_cocoa', 'dessert_sweet'}
NOT_SWEET = {'vanilla_extract', 'vanilla'}
SAVOURY_CATEGORIES = {'aromatic', 'protein', 'stock', 'chile', 'vegetable', 'legume'}
_HEAT_RE = re.compile(r'\b(?:bake|oven|boil|simmer|fry|saut[eé]|roast|grill|broil|microwave|'
                      r'heat|cook)\w*', re.I)
_SAUCE_COOK_RE = re.compile(r'\b(?:sauce|stir[- ]fry|saut[eé]|skillet|wok)\b', re.I)


def features(raw, items):
    ing = T.load()
    protein = sweet = savoury = alcohol = liquid = flour = yeast = 0
    for it in items:
        slug = it.get('slug')
        rec = ing.get(slug) if slug else None
        if not rec or it.get('optional'):
            continue
        flags = set(rec.get('flags') or [])
        cat = rec.get('category')
        if flags & PROTEIN_FLAGS and 'explicit_meat' in flags and cat == 'protein':
            protein += 1
        if cat in SWEET_CATEGORIES and slug not in NOT_SWEET:
            sweet += 1
        if cat in SAVOURY_CATEGORIES:
            savoury += 1
        if cat == 'alcohol':
            alcohol += 1
        if cat in ('beverage', 'alcohol') or slug in ('milk', 'water'):
            liquid += 1
        if cat == 'flour_thickener':
            flour += 1
        if cat == 'leavener' and 'yeast' in slug:
            yeast += 1
    steps = ' '.join(raw.get('steps') or [])
    return {
        'protein': protein > 0,
        'sweet': sweet >= 2 or (sweet >= 1 and savoury == 0),
        'savoury': savoury > 0,
        'alcohol': alcohol > 0,
        'liquid': liquid > 0,
        'n_alcohol': alcohol,
        'n_sweet': sweet,
        'flour': flour > 0,
        'yeast': yeast > 0,
        'heat': bool(_HEAT_RE.search(steps)),
        'cooked_sauce': bool(_SAUCE_COOK_RE.search(steps)),
        'n_items': len(items),
    }


def _from_ingredients(f):
    if f['protein']:
        return 'main'
    if f['alcohol'] and not f['heat'] and f['n_items'] <= 8:
        return 'drink'
    if f['yeast'] and f['flour']:
        return 'baking'
    if f['sweet'] and (f['flour'] or f['n_sweet'] >= 2):
        return 'dessert'
    return 'main'


def tag_course(raw, items=None):
    if items is None:
        from ingest.tag.tagger import parse_items
        items = parse_items(raw)
    f = features(raw, items)
    title = raw.get('title') or ''
    course, _ = _lookup(_words(head_phrase(title)), f)
    if course:
        return {'course': course, 'rule': 'head'}
    course, _ = _lookup(_words(title), f)
    if course:
        return {'course': course, 'rule': 'title'}
    course = _from_category(raw)
    if course:
        return {'course': course, 'rule': 'category'}
    course = _from_tags(raw)
    if course:
        return {'course': course, 'rule': 'tags'}
    return {'course': _from_ingredients(f), 'rule': 'ingredients'}
