"""A curated lexicon of dish names and demonyms unambiguous enough to label a recipe's
cuisine from its title alone -- the judgement call a person would make skimming titles
(brief S5b-2 #1b). Used two ways:

  - build_dataset.py: silver-labels recipenlg/openrecipes titles for training (capped per
    class, marker words stripped from that row's own features to avoid leakage).
  - hand_check.py: the new 300-recipe hand-checked eval set (brief S5b-2 #2) is drawn from
    the *surplus* recipenlg/openrecipes titles the cap left out of training, matched by this
    same lexicon -- so it is deliberately not independent of the lexicon, but it is
    independent of anything the model actually trained on.

Deliberately excludes generic ingredient/style words that name no single cuisine on their own
(see build S5b's report: "italian sausage", "french fries", "american cheese", "swiss chard",
"spanish onion" must NOT count) by only listing dish names and demonyms, never bare ingredient
adjectives. Longer, more specific markers are listed before shorter ones they contain (checked
in this order, first match wins).
"""
import re

# (marker phrase, canonical label). A trailing/leading space on a short marker (e.g. "pho ",
# "dal ") avoids matching it as a substring of an unrelated longer word.
MARKERS = [
    ('pad thai', 'thai'), ('tom yum', 'thai'), ('green curry', 'thai'), ('thai basil', 'thai'),
    ('massaman', 'thai'), ('panang curry', 'thai'), ('larb', 'thai'),
    ('pho ', 'vietnamese'), ('banh mi', 'vietnamese'), ('vietnamese', 'vietnamese'),
    ('bun cha', 'vietnamese'), ('goi cuon', 'vietnamese'),
    ('kimchi', 'korean'), ('bibimbap', 'korean'), ('bulgogi', 'korean'), ('korean', 'korean'),
    ('gochujang', 'korean'), ('japchae', 'korean'), ('tteokbokki', 'korean'),
    ('sushi', 'japanese'), ('ramen', 'japanese'), ('teriyaki', 'japanese'), ('miso', 'japanese'),
    ('tempura', 'japanese'), ('udon', 'japanese'), ('yakitori', 'japanese'), ('katsu', 'japanese'),
    ('donburi', 'japanese'), ('okonomiyaki', 'japanese'), ('yakisoba', 'japanese'),
    ('kung pao', 'chinese'), ('lo mein', 'chinese'), ('chow mein', 'chinese'),
    ('szechuan', 'chinese'), ('sichuan', 'chinese'), ('sweet and sour', 'chinese'),
    ('fried rice', 'chinese'), ('dim sum', 'chinese'), ('wonton', 'chinese'),
    ('mapo tofu', 'chinese'), ('congee', 'chinese'), ('char siu', 'chinese'),
    ('satay', 'indonesian_malaysian'), ('rendang', 'indonesian_malaysian'),
    ('nasi goreng', 'indonesian_malaysian'), ('laksa', 'indonesian_malaysian'),
    ('gado gado', 'indonesian_malaysian'), ('nasi lemak', 'indonesian_malaysian'),
    ('adobo', 'filipino'), ('lumpia', 'filipino'), ('pancit', 'filipino'),
    ('sinigang', 'filipino'), ('sisig', 'filipino'),
    ('tikka masala', 'indian'), ('biryani', 'indian'), ('vindaloo', 'indian'),
    ('saag', 'indian'), ('paneer', 'indian'), ('tandoori', 'indian'), ('masala', 'indian'),
    ('samosa', 'indian'), ('dal ', 'indian'), ('chana', 'indian'), ('korma', 'indian'),
    ('naan', 'indian'), ('chutney', 'indian'), ('raita', 'indian'), ('dosa', 'indian'),
    ('falafel', 'middle_eastern'), ('hummus', 'middle_eastern'), ('shawarma', 'middle_eastern'),
    ('tabbouleh', 'middle_eastern'), ('baba ganoush', 'middle_eastern'),
    ('muhammara', 'middle_eastern'), ('fattoush', 'middle_eastern'), ('labneh', 'middle_eastern'),
    ('fesenjan', 'persian'), ('tahdig', 'persian'), ('persian', 'persian'), ('ghormeh', 'persian'),
    ('doner', 'turkish'), ('baklava', 'turkish'), ('kofta', 'turkish'), ('turkish', 'turkish'),
    ('borek', 'turkish'), ('lahmacun', 'turkish'), ('menemen', 'turkish'),
    ('moussaka', 'greek'), ('tzatziki', 'greek'), ('souvlaki', 'greek'), ('greek salad', 'greek'),
    ('spanakopita', 'greek'), ('gyro', 'greek'), ('dolma', 'greek'), ('pastitsio', 'greek'),
    ('carbonara', 'italian'), ('bolognese', 'italian'), ('risotto', 'italian'),
    ('lasagna', 'italian'), ('lasagne', 'italian'), ('tiramisu', 'italian'),
    ('bruschetta', 'italian'), ('parmigiana', 'italian'), ('minestrone', 'italian'),
    ('cacio e pepe', 'italian'), ('osso buco', 'italian'), ('caprese', 'italian'),
    ('gnocchi', 'italian'), ('focaccia', 'italian'), ('panzanella', 'italian'),
    ('ratatouille', 'french'), ('quiche', 'french'), ('coq au vin', 'french'),
    ('creme brulee', 'french'), ('croissant', 'french'), ('bechamel', 'french'),
    ('cassoulet', 'french'), ('nicoise', 'french'), ('confit', 'french'), ('gratin', 'french'),
    ('paella', 'spanish'), ('gazpacho', 'spanish'), ('tortilla espanola', 'spanish'),
    ('churro', 'spanish'), ('sangria', 'spanish'), ('patatas bravas', 'spanish'),
    ('tapas', 'spanish'), ('chorizo hash', 'spanish'),
    ('taco', 'mexican'), ('burrito', 'mexican'), ('enchilada', 'mexican'),
    ('quesadilla', 'mexican'), ('guacamole', 'mexican'), ('tamale', 'mexican'),
    ('mole ', 'mexican'), ('fajita', 'mexican'), ('pico de gallo', 'mexican'),
    ('chilaquiles', 'mexican'), ('elote', 'mexican'), ('pozole', 'mexican'),
    ('empanada', 'latin_american'), ('feijoada', 'latin_american'), ('ceviche', 'latin_american'),
    ('arepa', 'latin_american'), ('churrasco', 'latin_american'), ('asado', 'latin_american'),
    ('chimichurri', 'latin_american'), ('tres leches', 'latin_american'),
    ('jerk chicken', 'caribbean'), ('jamaican', 'caribbean'), ('mofongo', 'caribbean'),
    ('callaloo', 'caribbean'), ('curry goat', 'caribbean'), ('roti ', 'caribbean'),
    ('tagine', 'north_african'), ('couscous', 'north_african'), ('harissa', 'north_african'),
    ('shakshuka', 'north_african'), ('moroccan', 'north_african'), ('tunisian', 'north_african'),
    ('jollof', 'east_west_african'), ('injera', 'east_west_african'), ('suya', 'east_west_african'),
    ('berbere', 'east_west_african'), ('fufu', 'east_west_african'), ('egusi', 'east_west_african'),
    ('goulash', 'german_central_eu'), ('schnitzel', 'german_central_eu'),
    ('pierogi', 'german_central_eu'), ('sauerbraten', 'german_central_eu'),
    ('sauerkraut', 'german_central_eu'), ('bratwurst', 'german_central_eu'),
    ('borscht', 'german_central_eu'), ('spaetzle', 'german_central_eu'),
    ('strudel', 'german_central_eu'), ('smorgasbord', 'german_central_eu'),
    ('shepherd\'s pie', 'british_irish'), ('bangers and mash', 'british_irish'),
    ('fish and chips', 'british_irish'), ('irish stew', 'british_irish'),
    ('yorkshire pudding', 'british_irish'), ('scone', 'british_irish'), ('trifle', 'british_irish'),
    ('victoria sponge', 'british_irish'), ('cottage pie', 'british_irish'),
    ('gumbo', 'southern_us'), ('jambalaya', 'southern_us'), ('cajun', 'southern_us'),
    ('grits', 'southern_us'), ('cornbread', 'southern_us'), ('fried green tomato', 'southern_us'),
    ('biscuits and gravy', 'southern_us'), ('pulled pork bbq', 'southern_us'),
    ('etouffee', 'southern_us'), ('po boy', 'southern_us'), ('hush puppies', 'southern_us'),

    # -- demonyms (brief S10b #1): a plain nationality/regional adjective in the title, trusted
    # as a cuisine marker only where it names a single geography and isn't also a generic
    # ingredient-style adjective in wide use for dishes with no tie to that place -- the false
    # positives the module docstring and test_lexicon_excludes_generic_ingredient_words guard
    # against ("italian sausage", "french fries", "american cheese", "swiss chard", "spanish
    # onion"). Those five demonyms (italian, french, american, swiss, spanish) are deliberately
    # left out for that reason; "swiss" isn't canonical either way. A dish-specific marker
    # earlier in this list always wins over a bare demonym for the same cuisine, since the
    # first match found wins.
    ('general tso', 'chinese'),  # the owner's term (brief S10b #1); Chinese-American counts as
                                 # chinese, not korean -- the S10 sample's "General Tso'S Chicken
                                 # Wings" misclassification this rule fixes
    ('thai', 'thai'), ('chinese', 'chinese'), ('indian', 'indian'), ('japanese', 'japanese'),
    ('filipino', 'filipino'), ('indonesian', 'indonesian_malaysian'),
    ('malaysian', 'indonesian_malaysian'), ('singaporean', 'indonesian_malaysian'),
    ('greek', 'greek'), ('algerian', 'north_african'), ('egyptian', 'north_african'),
    ('german', 'german_central_eu'), ('polish', 'german_central_eu'),
    ('russian', 'german_central_eu'), ('hungarian', 'german_central_eu'),
    ('scandinavian', 'german_central_eu'), ('austrian', 'german_central_eu'),
    ('irish', 'british_irish'), ('scottish', 'british_irish'), ('welsh', 'british_irish'),
    ('british', 'british_irish'),
    ('brazilian', 'latin_american'), ('peruvian', 'latin_american'),
    ('argentinian', 'latin_american'), ('argentine', 'latin_american'),
    ('cuban', 'caribbean'), ('haitian', 'caribbean'), ('trinidadian', 'caribbean'),
    ('ethiopian', 'east_west_african'), ('nigerian', 'east_west_african'),
    ('ghanaian', 'east_west_african'), ('senegalese', 'east_west_african'),
    ('iranian', 'persian'), ('israeli', 'middle_eastern'), ('lebanese', 'middle_eastern'),
    ('syrian', 'middle_eastern'),
]
_norm = re.compile(r'\s+')
_word_re = re.compile(r"[a-z']+")


def find_label(title):
    """(canonical label, matched marker) for the first marker found in `title`, or
    (None, None) if none match. A trailing space is padded onto the title too, so a marker
    with its own trailing space guard ("roti ", "pho ", "dal ", "mole ") still matches a title
    that ends in that word (brief S10b #1: "roti" alone was matching inside "rotisserie" and
    "rotini" before the guard was added -- the padding keeps a plain "Roti"/"Chana Dal" title
    matching once it was)."""
    t = _norm.sub(' ', (title or '').lower()) + ' '
    for marker, label in MARKERS:
        if marker in t:
            return label, marker
    return None, None


# Ruling R20 (brief S19): the markers that are demonyms (a nationality, or the owner's
# "General Tso"), as against dish markers. A demonym in the title always overrides the
# classifier; a dish marker only fills in when the classifier is unknown.
DEMONYMS = frozenset(m for m, _ in MARKERS[MARKERS.index(('general tso', 'chinese')):]) | {
    'vietnamese', 'korean', 'persian', 'turkish', 'jamaican', 'moroccan', 'tunisian'}
# Ingredient names that carry a demonym but name no cuisine ("Greek yogurt" goes in parfaits;
# "German chocolate cake" is American). Blanked out of the title before the demonym check.
DEMONYM_INGREDIENTS = (
    'greek yogurt', 'greek yoghurt', 'greek-style yogurt', 'greek style yogurt', 'german chocolate',
    'irish cream', 'persian cucumber', 'japanese eggplant', 'chinese eggplant', 'chinese cabbage',
    'chinese five spice', 'chinese 5 spice', 'chinese five-spice', 'thai chili', 'thai chile',
    'thai chilies', 'thai chiles', 'indian corn', 'korean chili flakes')
_DEMONYM_RE = [(re.compile(r"(?<![a-z])" + re.escape(m) + r"(?![a-z])"), m, lab)
               for m, lab in MARKERS if m in DEMONYMS]


def find_demonym(title):
    """(canonical label, demonym) for the first demonym in `title`, matched as a whole word
    ("Indiana" is not "indian"), after DEMONYM_INGREDIENTS are blanked out; else (None, None)."""
    t = _norm.sub(' ', (title or '').lower())
    for phrase in DEMONYM_INGREDIENTS:
        t = t.replace(phrase, ' ')
    for rx, marker, label in _DEMONYM_RE:
        if rx.search(t):
            return label, marker
    return None, None


def find_dish(title):
    """(canonical label, marker) for the first dish marker (not a demonym) in `title`, else
    (None, None). The same substring rules as find_label."""
    t = _norm.sub(' ', (title or '').lower()) + ' '
    for marker, label in MARKERS:
        if marker not in DEMONYMS and marker in t:
            return label, marker
    return None, None


def marker_words(marker):
    """The lowercase word tokens making up one marker, for stripping from that row's own
    title features (leakage guard, brief S5b-2 #2)."""
    if not marker:
        return set()
    return set(_word_re.findall(marker.lower()))
