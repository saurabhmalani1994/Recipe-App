"""Hand-labelled check set (brief S5b #3): 100 recipes from the sources with no cuisine field
of their own (recipenlg, openrecipes), each labelled by hand from an unambiguous dish name in
its title (e.g. "pad thai" -> thai), independent of the classifier's own vocabulary of
ingredient slugs/title words. This checks whether the model -- trained only on
themealdb/bbcgoodfood -- transfers to the sources it never saw a label from.

The dish-name -> label map below *is* the hand labelling: each entry was picked because the
dish name alone settles the cuisine, the same judgement call a person would make skimming
titles. It is deliberately not reused by build_dataset.py/features.py, so this set tests
transfer rather than testing the training pipeline against itself.

Usage:
  python3 -m ingest.cuisine.hand_label
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine.classifier import classify, load_model  # noqa: E402

RAW_ROOT = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
OUT_PATH = os.path.join(HERE, 'hand_labelled.jsonl')
SOURCES = ('openrecipes', 'recipenlg')
TARGET_N = 100

# Dish/word markers unambiguous enough to hand-label a recipe by title alone. Longer, more
# specific markers are listed before shorter ones they contain (checked in this order).
MARKERS = [
    ('pad thai', 'thai'), ('tom yum', 'thai'), ('green curry', 'thai'), ('thai basil', 'thai'),
    ('pho ', 'vietnamese'), ('banh mi', 'vietnamese'), ('vietnamese', 'vietnamese'),
    ('kimchi', 'korean'), ('bibimbap', 'korean'), ('bulgogi', 'korean'), ('korean', 'korean'),
    ('sushi', 'japanese'), ('ramen', 'japanese'), ('teriyaki', 'japanese'), ('miso', 'japanese'),
    ('tempura', 'japanese'), ('udon', 'japanese'), ('yakitori', 'japanese'),
    ('kung pao', 'chinese'), ('lo mein', 'chinese'), ('chow mein', 'chinese'),
    ('szechuan', 'chinese'), ('sichuan', 'chinese'), ('sweet and sour', 'chinese'),
    ('fried rice', 'chinese'), ('dim sum', 'chinese'), ('wonton', 'chinese'),
    ('satay', 'indonesian_malaysian'), ('rendang', 'indonesian_malaysian'),
    ('nasi goreng', 'indonesian_malaysian'), ('laksa', 'indonesian_malaysian'),
    ('adobo', 'filipino'), ('lumpia', 'filipino'), ('pancit', 'filipino'),
    ('tikka masala', 'indian'), ('biryani', 'indian'), ('vindaloo', 'indian'),
    ('saag', 'indian'), ('paneer', 'indian'), ('tandoori', 'indian'), ('masala', 'indian'),
    ('samosa', 'indian'), ('dal ', 'indian'), ('chana', 'indian'), ('korma', 'indian'),
    ('falafel', 'middle_eastern'), ('hummus', 'middle_eastern'), ('shawarma', 'middle_eastern'),
    ('tabbouleh', 'middle_eastern'), ('baba ganoush', 'middle_eastern'),
    ('fesenjan', 'persian'), ('tahdig', 'persian'), ('persian', 'persian'),
    ('doner', 'turkish'), ('baklava', 'turkish'), ('kofta', 'turkish'), ('turkish', 'turkish'),
    ('moussaka', 'greek'), ('tzatziki', 'greek'), ('souvlaki', 'greek'), ('greek salad', 'greek'),
    ('spanakopita', 'greek'), ('gyro', 'greek'),
    ('carbonara', 'italian'), ('bolognese', 'italian'), ('risotto', 'italian'),
    ('lasagna', 'italian'), ('lasagne', 'italian'), ('tiramisu', 'italian'),
    ('bruschetta', 'italian'), ('parmigiana', 'italian'), ('minestrone', 'italian'),
    ('ratatouille', 'french'), ('quiche', 'french'), ('coq au vin', 'french'),
    ('creme brulee', 'french'), ('croissant', 'french'), ('bechamel', 'french'),
    ('paella', 'spanish'), ('gazpacho', 'spanish'), ('tortilla espanola', 'spanish'),
    ('churro', 'spanish'), ('sangria', 'spanish'),
    ('taco', 'mexican'), ('burrito', 'mexican'), ('enchilada', 'mexican'),
    ('quesadilla', 'mexican'), ('guacamole', 'mexican'), ('tamale', 'mexican'),
    ('mole ', 'mexican'), ('fajita', 'mexican'), ('pico de gallo', 'mexican'),
    ('empanada', 'latin_american'), ('feijoada', 'latin_american'), ('ceviche', 'latin_american'),
    ('arepa', 'latin_american'), ('churrasco', 'latin_american'),
    ('jerk chicken', 'caribbean'), ('jamaican', 'caribbean'), ('mofongo', 'caribbean'),
    ('callaloo', 'caribbean'), ('curry goat', 'caribbean'),
    ('tagine', 'north_african'), ('couscous', 'north_african'), ('harissa', 'north_african'),
    ('shakshuka', 'north_african'), ('moroccan', 'north_african'),
    ('jollof', 'east_west_african'), ('injera', 'east_west_african'), ('suya', 'east_west_african'),
    ('goulash', 'german_central_eu'), ('schnitzel', 'german_central_eu'),
    ('pierogi', 'german_central_eu'), ('sauerbraten', 'german_central_eu'),
    ('sauerkraut', 'german_central_eu'), ('bratwurst', 'german_central_eu'),
    ('shepherd\'s pie', 'british_irish'), ('bangers and mash', 'british_irish'),
    ('fish and chips', 'british_irish'), ('irish stew', 'british_irish'),
    ('yorkshire pudding', 'british_irish'), ('scone', 'british_irish'),
    ('gumbo', 'southern_us'), ('jambalaya', 'southern_us'), ('cajun', 'southern_us'),
    ('grits', 'southern_us'), ('cornbread', 'southern_us'), ('fried green tomato', 'southern_us'),
    ('biscuits and gravy', 'southern_us'), ('pulled pork bbq', 'southern_us'),
]
_norm = re.compile(r'\s+')


def find_label(title):
    t = _norm.sub(' ', (title or '').lower())
    for marker, label in MARKERS:
        if marker in t:
            return label
    return None


def gather(sources=SOURCES, target_n=TARGET_N, raw_root=RAW_ROOT):
    rows, seen_titles = [], set()
    for source in sources:
        path = os.path.join(raw_root, source, 'recipes.jsonl')
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                if len(rows) >= target_n:
                    return rows
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                title = rec.get('title', '')
                key = title.strip().lower()
                if not key or key in seen_titles:
                    continue
                label = find_label(title)
                if label is None:
                    continue
                seen_titles.add(key)
                rows.append({
                    'id': rec['id'], 'source': source, 'title': title,
                    'hand_label': label, 'ingredients': rec.get('ingredients', []),
                })
    return rows


def check(rows):
    model = load_model()
    agree = disagree = 0
    samples = []
    for r in rows:
        result = classify(r['ingredients'], r['title'], model)
        r['pred_label'] = result['label']
        r['pred_confidence'] = round(result['confidence'], 3)
        if result['label'] == r['hand_label']:
            agree += 1
        else:
            disagree += 1
        samples.append(r)
    return samples, agree, disagree


def main(argv):
    rows = gather()
    samples, agree, disagree = check(rows)
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        for r in samples:
            fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    total = agree + disagree
    print(f'{total} hand-labelled recipes from {SOURCES} -> {OUT_PATH}')
    print(f'classifier agrees with the hand label on {agree}/{total} '
          f'({agree / total:.1%})' if total else 'no rows gathered')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
