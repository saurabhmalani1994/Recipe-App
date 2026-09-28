"""Draw the owner-graded eval (brief S8 #5, bar in BAR.md) and score it once graded.

draw(ranked, scan_dir, out_dir, name, per_band, exclude): `per_band` recipes drawn at random from
each band of the ranked pool (top 5%, middle 5% around the median, bottom 5%), skipping the keys
in `exclude`, seeded, shuffled together, written to <name>.md with the band hidden; the answer
key goes to <name>_key.json.

Sheets:
  owner_grade.md    S8, 60 recipes (seed 8). Graded; since S8b it is the TUNING set the score
                    was reweighted on, so it can no longer test the score.
  owner_grade_2.md  S8b, 45 recipes (15 per band, seed 82), none of the 60: the fresh test.

Scoring, after the owner fills in the grades (the key is found next to the sheet):
  python3 -m ingest.curate.eval.draw --score ingest/curate/eval/owner_grade_2.md
"""
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402

PER_BAND = 20
BAND_SHARE = 0.05
MAX_STEP_CHARS = 700


def bands(n, share=BAND_SHARE):
    w = max(1, int(n * share))
    mid = n // 2
    return {'top': (0, w), 'middle': (max(0, mid - w // 2), max(0, mid - w // 2) + w), 'bottom': (n - w, n)}


def raw_line(source, line, scan_dir, raw_root=S.RAW):
    man = json.load(open(os.path.join(scan_dir, 'manifest.json'), encoding='utf-8'))[source]
    i = line // man['shard']
    with open(S.raw_path(source, raw_root), 'rb') as fh:
        fh.seek(man['offsets'][i])
        n = i * man['shard']
        for b in fh:
            if n == line:
                return json.loads(b)
            n += 1
    raise KeyError((source, line))


def render(i, raw):
    L = [f'## {i}. {raw.get("title", "").strip()}', '']
    L.append('Ingredients: ' + '; '.join(x.strip() for x in raw.get('ingredients') or [] if isinstance(x, str)))
    L.append('')
    steps = [s.strip() for s in raw.get('steps') or [] if isinstance(s, str) and s.strip()]
    text = ' '.join(f'({k}) {s}' for k, s in enumerate(steps, 1))
    if len(text) > MAX_STEP_CHARS:
        text = text[:MAX_STEP_CHARS].rsplit(' ', 1)[0] + ' [...]'
    L.append('Method: ' + text)
    L.append('')
    L.append('grade: _')
    L.append('')
    return '\n'.join(L)


def draw(ranked, scan_dir, out_dir, seed=8, per_band=PER_BAND, raw_root=S.RAW, name='owner_grade', exclude=()):
    rng = random.Random(seed)
    exclude = set(exclude)
    picks = []
    for band, (a, b) in bands(len(ranked)).items():
        idx = sorted(rng.sample([i for i in range(a, b) if ranked[i]['key'] not in exclude], per_band))
        picks += [(band, i, ranked[i]) for i in idx]
    rng.shuffle(picks)
    md = ['# Owner grade: does the quality score rank recipes that work well?', '',
          f'{len(picks)} recipes, shuffled; the score and the source are hidden. About 10 seconds each.',
          'Replace the `_` after each "grade:" with one number:', '',
          '- 2 = I would cook this as written and expect it to work',
          '- 1 = workable, but I would have to fix something (a missing amount, a vague step, an odd ratio)',
          '- 0 = broken, junk, or I would not cook it', '',
          'Long methods are cut at about 700 characters, marked [...]. The bar is in BAR.md.', '']
    key = []
    for n, (band, rank, r) in enumerate(picks, 1):
        raw = raw_line(r["source"], r["line"], scan_dir, raw_root)
        md.append(render(n, raw))
        key.append({'n': n, 'band': band, 'rank': rank, 'of': len(ranked), 'key': r['key'], 'score': r['score']})
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f'{name}.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(md))
    with open(os.path.join(out_dir, f'{name}_key.json'), 'w', encoding='utf-8') as fh:
        json.dump(key, fh, indent=1)
    return key


def key_path(md_path):
    """owner_grade_2.md -> owner_grade_2_key.json, next to the sheet."""
    return os.path.splitext(md_path)[0] + '_key.json'


_GRADE_RE = re.compile(r'^## (\d+)\.|^grade:\s*([012])\b', re.M)


def read_grades(md_text):
    """{recipe number: grade} from a filled owner_grade.md; ungraded recipes are left out."""
    out = {}
    cur = None
    for m in _GRADE_RE.finditer(md_text):
        if m.group(1):
            cur = int(m.group(1))
        elif cur is not None:
            out[cur] = int(m.group(2))
    return out


def score(grades, key):
    """The BAR.md verdict: {band: mean}, the checks, PASS/FAIL."""
    by = {}
    for k in key:
        if k['n'] in grades:
            by.setdefault(k['band'], []).append(grades[k['n']])
    mean = {b: sum(v) / len(v) for b, v in by.items() if v}
    t, m, b = mean.get('top'), mean.get('middle'), mean.get('bottom')
    checks = {
        'top_mean_ge_1.5': t is not None and t >= 1.5,
        'top_minus_bottom_ge_0.6': t is not None and b is not None and t - b >= 0.6,
        'ordered': None not in (t, m, b) and t >= m >= b,
    }
    return {'graded': sum(len(v) for v in by.values()), 'mean': mean, 'checks': checks,
            'verdict': 'PASS' if all(checks.values()) else 'FAIL'}


def main(argv):
    if len(argv) == 2 and argv[0] == '--score':
        grades = read_grades(open(argv[1], encoding='utf-8').read())
        key = json.load(open(key_path(argv[1]), encoding='utf-8'))
        print(json.dumps(score(grades, key), indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
