"""Name normalization shared by the taxonomy index and the parser.

Both sides of a lookup go through `norm_name`, so a quirk of the singularizer (molasses ->
molass) is harmless: it happens identically to the taxonomy synonym and to the recipe line.
"""
import re
import unicodedata

_CJK_RE = re.compile(r'[぀-ヿ㐀-䶿一-鿿가-힯]')
_PUNCT_RE = re.compile(r"[^\w\s぀-ヿ㐀-䶿一-鿿가-힯]")
_WS_RE = re.compile(r'\s+')

# Words that end in s but are not plurals, or whose plural rule is irregular.
_KEEP = {
    'molasses', 'hummus', 'couscous', 'asparagus', 'swiss', 'brussels', 'grass', 'bass',
    'glass', 'citrus', 'octopus', 'cress', 'watercress', 'swiss', 'jus', 'gras', 'lemongrass',
    'bouillabaisse', 'anise', 'harissa', 'chives', 'hibiscus', 'haggis', 'series', 'species',
    'grits', 'oats', 'greens', 'hops', 'bitters', 'schnapps', 'sweets', 'less', 'plus', 'this',
    'is', 'has', 'was', 'mais', 'masses', 'tapas', 'paris', 'french', 'kansas', 'texas',
    'christmas', 'bus', 'gas', 'yes', 'dress', 'press', 'pastis', 'ras', 'raas', 'dhal',
    'chickpeas', 'peas', 'lentils', 'beans', 'sprouts', 'noodles', 'olives', 'capers', 'nuts',
    'seeds', 'flakes', 'crumbs', 'chips', 'fries', 'leaves', 'cloves', 'tomatoes', 'potatoes',
}
_IRREGULAR = {
    'leaves': 'leaf', 'loaves': 'loaf', 'halves': 'half', 'calves': 'calf', 'knives': 'knife',
    'shelves': 'shelf', 'chilies': 'chili', 'chillies': 'chilli', 'cookies': 'cookie',
    'brownies': 'brownie', 'pies': 'pie', 'veggies': 'veggie', 'smoothies': 'smoothie',
    'calories': 'calorie', 'ties': 'tie', 'goodies': 'goodie', 'sweeties': 'sweetie',
    'zombies': 'zombie', 'rotis': 'roti', 'chapatis': 'chapati', 'chapattis': 'chapatti',
    'naans': 'naan', 'potatoes': 'potato', 'tomatoes': 'tomato', 'mangoes': 'mango',
    'avocadoes': 'avocado', 'cloves': 'clove', 'olives': 'olive', 'chives': 'chive',
    'endives': 'endive', 'preserves': 'preserve', 'peas': 'pea', 'chickpeas': 'chickpea',
    'lentils': 'lentil', 'beans': 'bean', 'sprouts': 'sprout', 'noodles': 'noodle',
    'capers': 'caper', 'nuts': 'nut', 'seeds': 'seed', 'flakes': 'flake', 'crumbs': 'crumb',
    'chips': 'chip', 'fries': 'fry', 'oats': 'oat', 'greens': 'green', 'grits': 'grit',
    'sweets': 'sweet', 'mice': 'mouse', 'geese': 'goose', 'teeth': 'tooth', 'feet': 'foot',
    'dates': 'date', 'grapes': 'grape', 'limes': 'lime', 'cubes': 'cube', 'slices': 'slice',
    'sauces': 'sauce', 'juices': 'juice', 'spices': 'spice', 'pieces': 'piece',
    'rinds': 'rind', 'wedges': 'wedge', 'sausages': 'sausage', 'cabbages': 'cabbage',
    'oranges': 'orange', 'apples': 'apple', 'purees': 'puree', 'pastes': 'paste',
    'breasts': 'breast', 'hearts': 'heart', 'shallots': 'shallot', 'courgettes': 'courgette',
    'aubergines': 'aubergine', 'baguettes': 'baguette', 'omelettes': 'omelette',
    'artichokes': 'artichoke', 'tortillas': 'tortilla', 'blades': 'blade', 'eggs': 'egg',
    'anchovies': 'anchovy', 'strawberries': 'strawberry', 'berries': 'berry',
}


# Common misspellings and abbreviations in recipe text, mapped word by word. Applied to taxonomy
# names and recipe lines alike, so a synonym never needs to list them.
SPELLING = {
    'avacado': 'avocado', 'avocadoe': 'avocado', 'jalepeno': 'jalapeno', 'jalapeno': 'jalapeno',
    'parmesean': 'parmesan', 'parmesian': 'parmesan', 'parmasan': 'parmesan',
    'mozarella': 'mozzarella', 'mozzerella': 'mozzarella', 'mozzarela': 'mozzarella',
    'mozzeralla': 'mozzarella', 'zuchinni': 'zucchini', 'zuccini': 'zucchini',
    'zuchini': 'zucchini', 'zucchinni': 'zucchini', 'zuchinis': 'zucchini', 'brocolli': 'broccoli',
    'brocoli': 'broccoli', 'broccolli': 'broccoli', 'cinammon': 'cinnamon', 'cinamon': 'cinnamon',
    'cinnomon': 'cinnamon', 'cinnamin': 'cinnamon', 'oregeno': 'oregano', 'oregono': 'oregano',
    'corriander': 'coriander', 'boullion': 'bouillon', 'bullion': 'bouillon',
    'bouillion': 'bouillon', 'buillon': 'bouillon', 'magarine': 'margarine',
    'margerine': 'margarine', 'margarin': 'margarine', 'mayonnais': 'mayonnaise',
    'mayonaisse': 'mayonnaise', 'mayonaise': 'mayonnaise', 'mayonnase': 'mayonnaise',
    'mayo': 'mayonnaise', 'marshmellow': 'marshmallow', 'marshmellows': 'marshmallow',
    'rasberry': 'raspberry', 'rasberries': 'raspberry', 'pinapple': 'pineapple',
    'pineaple': 'pineapple', 'peacan': 'pecan', 'peacans': 'pecan', 'pecon': 'pecan',
    'vanila': 'vanilla', 'vanilla': 'vanilla', 'tobasco': 'tabasco', 'tumeric': 'turmeric',
    'worchestershire': 'worcestershire', 'worcestshire': 'worcestershire',
    'wocestershire': 'worcestershire', 'worchester': 'worcestershire', 'worcester': 'worcestershire',
    'worcestor': 'worcestershire', 'worcestershire': 'worcestershire', 'worchestire': 'worcestershire',
    'worstershire': 'worcestershire', 'tomatoe': 'tomato', 'carmel': 'caramel',
    'expresso': 'espresso', 'sherbert': 'sherbet', 'parsely': 'parsley', 'parsly': 'parsley',
    'pwdr': 'powder', 'pwd': 'powder', 'powd': 'powder', 'grnd': 'ground', 'choc': 'chocolate',
    'veg': 'vegetable', 'vegie': 'veggie', 'brocolini': 'broccolini', 'cilanto': 'cilantro',
    'cilantrol': 'cilantro', 'buttermik': 'buttermilk', 'chedder': 'cheddar', 'cheddr': 'cheddar',
    'fettucini': 'fettuccine', 'fettucine': 'fettuccine', 'fettuccini': 'fettuccine',
    'linguini': 'linguine', 'spagetti': 'spaghetti', 'spaghettti': 'spaghetti',
    'cummin': 'cumin', 'cumim': 'cumin', 'lettice': 'lettuce', 'raddish': 'radish',
    'cantelope': 'cantaloupe', 'canteloupe': 'cantaloupe', 'cantalope': 'cantaloupe',
    'banannas': 'banana', 'bannana': 'banana', 'strawberrys': 'strawberry', 'blueberrys': 'blueberry',
    'ketsup': 'ketchup', 'catchup': 'ketchup', 'yoghourt': 'yogurt', 'yougurt': 'yogurt',
    'yogourt': 'yogurt', 'jalapenos': 'jalapeno', 'chilis': 'chili', 'chillis': 'chilli',
    'chilies': 'chili', 'chiles': 'chile', 'poppyseed': 'poppy seed', 'poppyseeds': 'poppy seed',
    'sesameseed': 'sesame seed', 'pinenut': 'pine nut', 'pinenuts': 'pine nut',
    'peanutbutter': 'peanut butter', 'seasalt': 'sea salt', 'bayleaf': 'bay leaf',
    'bayleaves': 'bay leaf', 'hashbrown': 'hash brown', 'hashbrowns': 'hash brown',
    'cornflake': 'corn flake', 'cornflakes': 'corn flake', 'breadcrumb': 'bread crumb',
    'breadcrumbs': 'bread crumb', 'bread crumbs': 'bread crumb', 'cheesecloth': 'cheesecloth',
    'coarsley': 'coarsely', 'eggplants': 'eggplant', 'hotsauce': 'hot sauce',
    'fishsauce': 'fish sauce', 'soysauce': 'soy sauce', 'mushroms': 'mushroom',
    'mushrom': 'mushroom', 'muchrooms': 'mushroom', 'onoin': 'onion', 'onins': 'onion',
    'garlick': 'garlic', 'galic': 'garlic', 'tomatos': 'tomato', 'potatos': 'potato',
    'potatoe': 'potato', 'brussel': 'brussels', 'jell': 'jell', 'bisquik': 'bisquick',
    'confectioner': 'confectioners', 'confectionary': 'confectioners',
    'confectionery': 'confectioners', 'buttter': 'butter', 'suger': 'sugar', 'sugars': 'sugar',
    'flower': 'flower', 'vinager': 'vinegar', 'vinegars': 'vinegar', 'vinigar': 'vinegar',
    'cornstartch': 'cornstarch', 'cornstach': 'cornstarch', 'corstarch': 'cornstarch',
    'bakng': 'baking', 'bicarb': 'bicarb', 'tspn': 'tsp',
}


def strip_accents(text):
    out = []
    for ch in unicodedata.normalize('NFKD', text):
        if unicodedata.category(ch) == 'Mn':
            continue
        out.append(ch)
    return unicodedata.normalize('NFC', ''.join(out))


def singular(word):
    if word in _IRREGULAR:
        return _IRREGULAR[word]
    if word in _KEEP or len(word) <= 3 or not word.isalpha():
        return word
    if word.endswith(('ss', 'us', 'is', 'ys', 'os')) and not word.endswith('oes'):
        if word.endswith('os'):
            return word[:-1]
        return word
    if word.endswith('ies'):
        return word[:-3] + 'y'
    if word.endswith('oes'):
        return word[:-2]
    if word.endswith(('ches', 'shes', 'xes', 'sses', 'zzes')):
        return word[:-2]
    if word.endswith('s'):
        return word[:-1]
    return word


def has_cjk(text):
    return bool(_CJK_RE.search(text))


def clean_text(text):
    """Lowercase, strip accents, turn punctuation into spaces. Apostrophes are dropped."""
    t = strip_accents(text).lower()
    t = t.replace('’', '').replace("'", '').replace('`', '').replace('‘', '')
    t = t.replace('&', ' and ')
    t = _PUNCT_RE.sub(' ', t)
    t = t.replace('_', ' ')
    return _WS_RE.sub(' ', t).strip()


def norm_tokens(text):
    out = []
    for w in clean_text(text).split():
        w = SPELLING.get(w, w)
        out.extend(SPELLING.get(singular(x), singular(x)) for x in w.split())
    return out


def norm_name(text):
    """The lookup key for a name: cleaned, every word singular, joined by one space."""
    return ' '.join(norm_tokens(text))
