"""Draw the recipes for the course gold set (brief S9a #2) from the 5k build sample.

Run: python3 ingest/build/gold/draw_course_gold.py > /tmp/candidates.jsonl

Pool: the SAMPLE_QUOTAS selection (ingest/build/sample.py) minus the recipes the build drops
(no steps, no ingredients, openrecipes lines with lost names), so every gold recipe is one that
reaches corpus.db. 150 are drawn with seed 9 and written in draw order: the first 100 become
course_gold.jsonl (the bar) and the last 50 course_holdout.jsonl. Labels are added by hand,
before the tagger exists; this script only prints the raw records.

--blind draws 50 more (seed 10) from the same pool minus the 150, for course_blind.jsonl: labelled
after the tagger was frozen and scored once, since the holdout's titles were seen while the
tagger's word lists were written.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402
from ingest.build.curate import drop_reason  # noqa: E402

SEED = 9
N = 150
BLIND_SEED = 10
BLIND_N = 50


def main():
    pool = []
    for src in S.sources():
        quota = S.SAMPLE_QUOTAS.get(src)
        if not quota:
            continue
        path = S.raw_path(src)
        limit = S.count_lines(path)
        for _, line in S.select(path, limit, quota):
            try:
                raw = json.loads(line)
            except ValueError:
                continue
            if drop_reason(raw) is None:
                pool.append(raw)
    first = random.Random(SEED).sample(pool, N)
    if '--blind' in sys.argv[1:]:
        seen = {r['id'] for r in first}
        rest = [r for r in pool if r['id'] not in seen]
        drawn = random.Random(BLIND_SEED).sample(rest, BLIND_N)
    else:
        drawn = first
    for raw in drawn:
        print(json.dumps(raw, ensure_ascii=False))
    print(f'pool {len(pool)}, drew {len(drawn)}', file=sys.stderr)


if __name__ == '__main__':
    main()
