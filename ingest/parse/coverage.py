"""Coverage of the parser + taxonomy over real lines.

Usage:
  python3 ingest/parse/coverage.py           run over the 3000-line fixture and the cached 100k
                                             RecipeNLG sample; print summary lines; rewrite
                                             COVERAGE.md
  python3 ingest/parse/coverage.py --build   (re)build the 100k RecipeNLG line sample first

The RecipeNLG sample is every 190th ingredient line of
/home/user/recipe-data/raw/recipenlg/recipes.jsonl (a line counter over all recipes, in file
order), stopping at 100,000 lines. It is cached at SAMPLE_PATH, outside git.

Every line is counted: a line either yields items or is dropped as a header/blank line, and
every item either resolves to a slug or is listed as unresolved with a reason (rule 11).
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, ROOT)
from ingest.parse.parser import parse_line, preclean, is_header  # noqa: E402
from ingest.taxonomy.normalize import has_cjk, norm_name  # noqa: E402
from ingest.parse import units as U  # noqa: E402

FIXTURE = os.path.join(ROOT, 'ingest', 'fixtures', 'ingredient_lines_sample.txt')
RECIPENLG = '/home/user/recipe-data/raw/recipenlg/recipes.jsonl'
SAMPLE_PATH = '/home/user/recipe-data/derived/recipenlg_100k_lines.txt'
COVERAGE_MD = os.path.join(HERE, 'COVERAGE.md')
STEP = 190
TARGET = 100_000

PROSE = re.compile(
    r'\b(bake|baked|place|until|let|cover|serve|stir|preheat|remove|add|cook|mix|heat|pour|'
    r'minutes|hours|recipe|see|note|you|your|i|we|use|used|click|www|http|degrees|oven|pan|'
    r'bowl|together|then|when|well|this|that|these|will|should|would|can be|make sure)\b', re.I)
BRANDS = re.compile(r'\b(kraft|campbell|pillsbury|betty crocker|duncan hines|hellmann|'
                    r'nestle|hershey|jell|knorr|mccormick|lipton|heinz|goya|ortega|swanson|'
                    r'kellogg|nabisco|quaker|land o lakes|philadelphia|hormel|oscar mayer|'
                    r'johnsonville|velveeta|bisquick|splenda|ragu|prego|bertolli)\b', re.I)


def build_sample():
    os.makedirs(os.path.dirname(SAMPLE_PATH), exist_ok=True)
    n = kept = recipes = 0
    first_id = last_id = None
    with open(RECIPENLG, encoding='utf-8') as fh, open(SAMPLE_PATH, 'w', encoding='utf-8') as out:
        for raw in fh:
            recipes += 1
            try:
                rec = json.loads(raw)
            except json.JSONDecodeError:
                continue
            for line in rec.get('ingredients') or []:
                if n % STEP == 0:
                    out.write(line.replace('\n', ' ') + '\n')
                    kept += 1
                    last_id = rec.get('id')
                    first_id = first_id or rec.get('id')
                n += 1
                if kept >= TARGET:
                    break
            if kept >= TARGET:
                break
    print(f'sample: {kept} lines from {n} ingredient lines in {recipes} recipes '
          f'({first_id} .. {last_id}) -> {SAMPLE_PATH}')


SUBRECIPE = re.compile(
    r'^(?:the\s+)?(?:\w+\s+)?(?:filling|fillings|topping|toppings|crust|crusts|sauce|sauces|marinade|'
    r'batter|glaze|streusel|dressing|frosting|dough|garnish|garnishes|ingredients?|dumplings?|'
    r'mix|mixture|syrup|icing|base|rub|stuffing|pastry|spices?|seasonings?|remaining ingredients?|'
    r'accompaniments?|condiments?|herbs?|vegetables? of choice)(?:\s*\d+)?$', re.I)
AMOUNT_ONLY = re.compile(r'^(?:weight|fluid|whole|about|approx)?[\s\d/.,-]*(?:%s)?[\s\d/.,-]*'
                         r'(?:weight|fluid|whole|each)?$' % U.UNIT_ALT, re.I)
GENERIC = {'fat', 'meat', 'liquid', 'juice', 'seasoning', 'spice', 'spices', 'fruit', 'oil',
           'cooking fat', 'drippings', 'extract', 'flavoring', 'coloring', 'sweetener'}
# Hand-checked reasons for names the heuristic cannot place.
REASON_OVERRIDE = {
    'solo': 'brand name (Solo cake and pastry filling) with no generic synonym',
    'savory': 'ambiguous word (the herb, or "savory" as a description)',
    'none none': 'placeholder text from the source ("None")',
    'up': 'brand name split by the parser (7-Up)',
    'judge 5 25': 'Bible-verse novelty recipe, not a food',
    'a 1 original sauce': 'brand name (A.1. steak sauce) broken up by punctuation',
    'a 1 sauce': 'brand name (A.1. steak sauce) broken up by punctuation',
    'loaf': 'container word with the food missing (truncated line)',
    'roast': 'cut not named (beef or pork unknown)',
    'or': 'fragment left by a line break in the source',
    'essence': 'brand name (Emeril\'s Essence seasoning), a sub-recipe in the source',
    'leviticus 2 13': 'Bible-verse novelty recipe, not a food',
    'ready': 'fragment of a product description (line break in the source)',
    'dry': 'group label ("Dry" ingredients), not a food',
    'wet': 'group label ("Wet" ingredients), not a food',
    'gremolata': 'sub-recipe name (a garnish made in the recipe)',
    'cider': 'ambiguous (apple cider, hard cider or cider vinegar)',
}


def reason(raw_name, line):
    """Why an item did not resolve. Heuristic plus REASON_OVERRIDE; the top 50 in COVERAGE.md
    were read by hand."""
    t = (raw_name or '').strip()
    k = norm_name(t)
    if k in REASON_OVERRIDE:
        return REASON_OVERRIDE[k]
    if not t:
        return 'no name left after the amount (unit-only, duplicated or truncated line)'
    if has_cjk(t):
        return 'non-English name not in the synonyms'
    if AMOUNT_ONLY.match(t):
        return 'amount repeated where the name should be (source scraping error)'
    if not re.search(r'[a-zA-Z]{3}', t):
        return 'garbled text or stray symbols'
    if SUBRECIPE.match(t):
        return 'sub-recipe or placeholder name, defined elsewhere in the recipe'
    if k in GENERIC:
        return 'too generic to map to one ingredient'
    if len(t.split()) >= 7 or PROSE.search(t):
        return 'instruction or commentary text, not an ingredient'
    if BRANDS.search(line):
        return 'brand or product name with no generic synonym'
    return 'food or product not in the taxonomy'


def run(lines):
    st = {'lines': 0, 'dropped': 0, 'items': 0, 'resolved': 0, 'lines_all_resolved': 0}
    unresolved = Counter()
    examples = {}
    reasons = Counter()
    drop_reasons = Counter()
    for line in lines:
        st['lines'] += 1
        items = parse_line(line)
        if not items:
            st['dropped'] += 1
            txt = preclean(line)
            drop_reasons['blank or punctuation only' if not re.search(r'\w', txt)
                         else 'section header' if is_header(txt) else 'other'] += 1
            continue
        ok = True
        for it in items:
            st['items'] += 1
            if it['slug']:
                st['resolved'] += 1
            else:
                ok = False
                key = norm_name(it['raw_name'] or '') or '(empty)'
                unresolved[key] += 1
                examples.setdefault(key, line)
                reasons[reason(it['raw_name'], line)] += 1
        if ok:
            st['lines_all_resolved'] += 1
    return st, unresolved, examples, reasons, drop_reasons


def summarize(name, st):
    pct = 100 * st['resolved'] / st['items'] if st['items'] else 0
    lpct = 100 * st['lines_all_resolved'] / (st['lines'] - st['dropped']) if st['lines'] > st['dropped'] else 0
    return (f'{name}: {st["lines"]} lines, {st["dropped"]} dropped as header/blank, '
            f'{st["items"]} items, {st["resolved"]} resolved to a slug = {pct:.1f}%; '
            f'lines fully resolved {lpct:.1f}%')


def table(unresolved, examples, n=50):
    rows = ['| # | Unresolved name (normalized) | Count | Reason | Example line |',
            '|---:|---|---:|---|---|']
    for i, (k, c) in enumerate(unresolved.most_common(n), 1):
        ex = examples[k].replace('|', '\\|')
        if len(ex) > 70:
            ex = ex[:67] + '...'
        rows.append(f'| {i} | {k} | {c} | {reason(k if k != "(empty)" else "", examples[k])} | {ex} |')
    return rows


def main(argv):
    if '--build' in argv or not os.path.exists(SAMPLE_PATH):
        build_sample()
    with open(FIXTURE, encoding='utf-8') as fh:
        fixture = fh.read().split('\n')
    if fixture and fixture[-1] == '':
        fixture = fixture[:-1]
    with open(SAMPLE_PATH, encoding='utf-8') as fh:
        rnlg = [x.rstrip('\n') for x in fh]
    out = ['# Parser coverage', '',
           'Generated by `python3 ingest/parse/coverage.py`. Do not edit by hand.', '',
           'An item is resolved when the parser maps it to a taxonomy slug. Dropped lines are '
           'section headers and blank lines, which yield no items. Reasons are assigned by a '
           'heuristic in coverage.py (`reason`).', '']
    for name, lines in (('fixture (ingredient_lines_sample.txt)', fixture),
                        (f'RecipeNLG sample (every {STEP}th line, {len(rnlg)} lines)', rnlg)):
        st, unresolved, examples, reasons, drops = run(lines)
        line = summarize(name, st)
        print(line)
        out += [f'## {name}', '', f'- {line}',
                '- Dropped lines: ' + (', '.join(f'{k} {v}' for k, v in drops.most_common()) or 'none'),
                '- Unresolved items by reason: ' +
                ', '.join(f'{k} {v}' for k, v in reasons.most_common()), '',
                'Top 50 unresolved names:', ''] + table(unresolved, examples) + ['']
    with open(COVERAGE_MD, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out) + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
