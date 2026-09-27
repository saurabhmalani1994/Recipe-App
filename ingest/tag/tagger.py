"""Recipe taggers (slice S5a): diet, equipment, one-pot and time for one raw recipe.

tag_recipe(raw, items=None) -> tags dict
  raw    one record in the schema/raw_recipe.md shape
  items  its parsed ingredient items (ingest.parse.parser.parse_line over each line, flattened);
         parsed here when not given

Tags dict:
  diet        {vegetarian, no_red_meat, vegetarian_strict}: each {status: ok|adaptable|no|unknown,
              swaps: [{item, slug, use, use_slug, via: alternative|substitution|omit, ...}],
              blockers: [{item, slug}], reason (only when unknown)}. vegetarian_strict is kept
              internal (R7); the app offers the first two.
  equipment   sorted list from equipment.VOCAB
  equipment_alternatives  [[a, b]] pairs where the recipe says "a or b"
  stove_and_oven, one_pot, one_pan, sheet_pan_meal   bool, or None when the steps are missing
  time        {total_min, active_min, source, weeknight, reason}
  undeterminable  {equipment, time, diet}: a reason string, or None when the tag was found

CLI: python3 -m ingest.tag.tagger < recipes.jsonl  (prints one tags line per recipe)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.parse.parser import parse_line  # noqa: E402
from ingest.tag.diet import tag_diet  # noqa: E402
from ingest.tag.equipment import tag_equipment  # noqa: E402
from ingest.tag.timing import tag_time  # noqa: E402


def parse_items(raw):
    """Parsed items for every ingredient line; each item carries `line`, its line index."""
    items = []
    for n, line in enumerate(raw.get('ingredients') or []):
        try:
            got = parse_line(line)
        except Exception:  # a parser crash must not drop the recipe; the line counts as unread
            got = [{'slug': None, 'raw_name': line, 'note': None, 'optional': False,
                    'parse_error': True}]
        for it in got:
            it['line'] = n
        items += got
    return items


def tag_recipe(raw, items=None):
    if items is None:
        items = parse_items(raw)
    eq = tag_equipment(raw, items)
    diet = tag_diet(raw, items)
    time = tag_time(raw, no_cook='no_cook' in eq['equipment'])
    eq_reason = None
    if eq['status'] == 'no_steps':
        eq_reason = 'no steps'
    elif eq['status'] == 'too_short':
        eq_reason = 'steps too short or truncated'
    elif not eq['equipment']:
        eq_reason = 'no equipment cue in steps'
    return {
        'diet': diet,
        'equipment': eq['equipment'],
        'equipment_alternatives': eq['alternatives'],
        'stove_and_oven': eq['stove_and_oven'] if eq['status'] != 'no_steps' else None,
        'one_pot': eq['one_pot'],
        'one_pan': eq['one_pan'],
        'sheet_pan_meal': eq['sheet_pan_meal'],
        'time': time,
        'undeterminable': {
            'equipment': eq_reason,
            'time': time['reason'],
            'diet': diet['vegetarian'].get('reason'),
        },
    }


def main():
    for line in sys.stdin:
        if line.strip():
            raw = json.loads(line)
            print(json.dumps({'id': raw.get('id'), 'title': raw.get('title'),
                              'tags': tag_recipe(raw)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
