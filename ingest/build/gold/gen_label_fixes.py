"""Compute the cuisine and course label fixes from brief S10b, against the built S10 corpus
(/home/user/recipe-data/out/corpus.db, read-only -- this never writes to it), and emit a
per-key override TSV the orchestrator applies directly to a corpus.db copy with UPDATE
statements, so a full rebuild isn't needed to test the fix (brief S10b #3). A full rebuild
picks the same fixes up on its own, since they're in ingest/cuisine/lexicon.py and
ingest/build/course.py; this script (and its output) is only for testing the effect on the
existing build without waiting on one.

Cuisine (#1): a title marker (ingest/cuisine/lexicon.py, now including demonyms and "general
tso") overrides the classifier -- but never a site label, which stays highest precedence. Only
recipes whose current cuisine_source is 'classifier' (or NULL) are candidates; corpus.db has no
raw cuisine_label or title-vs-source distinction stored beyond that column, so a site-label row
is left alone by construction (recall: to_canonical(source, raw_label) already won for it at
build time, before the classifier ever ran).

Course (#2): the new modifier rules (summer rolls/spring rolls/dumplings never baking,
"breakfast X", jello/pudding salads) are re-run against every recipe's raw record, since course
is deterministic and recomputing it needs only the title/ingredients/steps the tagger already
takes -- no model file.

Run: python3 -m ingest.build.gold.gen_label_fixes > ingest/build/gold/label_fixes.tsv
Apply (orchestrator, on a writable copy):
  UPDATE recipes SET cuisine=?, cuisine_confidence=1.0, cuisine_source='classifier' WHERE key=?
  UPDATE recipes SET course=? WHERE key=?
  (one UPDATE per changed field per row; field is column 2 of the TSV)
"""
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402
from ingest.build.course import tag_course  # noqa: E402
from ingest.cuisine.cuisines import title_cuisine  # noqa: E402
from ingest.tag.tagger import parse_items  # noqa: E402

CORPUS_DB = os.environ.get('CORPUS_DB', '/home/user/recipe-data/out/corpus.db')


def _raw_index(keys_needed):
    """{key: raw record} for exactly the keys asked for, streaming each source file once."""
    by_source = {}
    for key in keys_needed:
        src = key.split(':', 1)[0]
        by_source.setdefault(src, set()).add(key)
    out = {}
    for src, keys in by_source.items():
        path = S.raw_path(src)
        if not os.path.exists(path):
            continue
        remaining = set(keys)
        with open(path, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                if not remaining:
                    break
                try:
                    raw = json.loads(line)
                except ValueError:
                    continue
                rid = raw.get('id')
                if rid in remaining:
                    out[rid] = raw
                    remaining.discard(rid)
    return out


def main():
    con = sqlite3.connect(f'file:{CORPUS_DB}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT key, source, title, cuisine, cuisine_source, course FROM recipes").fetchall()
    con.close()

    n_cuisine_candidates = 0
    n_cuisine_changed = 0
    n_course_checked = 0
    n_course_changed = 0
    cuisine_fixes = []
    course_keys_needed = [r['key'] for r in rows]
    raw_by_key = _raw_index(course_keys_needed)

    fixes = []  # (key, field, old, new, rule/title)
    for r in rows:
        if r['cuisine_source'] != 'source_label':
            n_cuisine_candidates += 1
            new_c = title_cuisine(r['title'])
            if new_c and new_c != r['cuisine']:
                n_cuisine_changed += 1
                fixes.append((r['key'], 'cuisine', r['cuisine'] or '', new_c, r['title']))
                cuisine_fixes.append((r['key'], r['cuisine'], new_c, r['title']))

        raw = raw_by_key.get(r['key'])
        if raw is None:
            continue
        n_course_checked += 1
        try:
            items = parse_items(raw)
            new_course = tag_course(raw, items)['course']
        except Exception:  # noqa: BLE001
            continue
        if new_course != r['course']:
            n_course_changed += 1
            fixes.append((r['key'], 'course', r['course'], new_course, r['title']))

    for key, field, old, new, title in fixes:
        print('\t'.join([key, field, old, new, title.replace('\t', ' ')]))

    print(f'# cuisine: {n_cuisine_candidates} classifier/none rows checked, '
          f'{n_cuisine_changed} changed by a title marker', file=sys.stderr)
    print(f'# course: {n_course_checked} rows checked, {n_course_changed} changed', file=sys.stderr)


if __name__ == '__main__':
    main()
