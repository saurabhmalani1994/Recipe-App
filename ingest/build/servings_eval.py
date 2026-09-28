"""Eval and calibration for the servings estimator (brief S15, ingest/build/servings.py).

Run:
  python3 -m ingest.build.servings_eval           the eval: bar, confusion by course, 10 misses
  python3 -m ingest.build.servings_eval --fit     print the calibration tables, fitted on the fit half
                                                  of the wide set
  python3 -m ingest.build.servings_eval --wide    the eval on the wider raw set (for information)

The set (the brief's population): the recipes of the curated corpus
(/home/user/recipe-data/out/corpus.db) whose source states servings (recipes.servings not NULL:
1,034 of 80,000; bbcgoodfood 847, foodcom 140, foodwishes 47), re-read from their raw records.
--wide instead takes every raw bbcgoodfood, foodcom and foodwishes record that passes the build's
drops and states a head count (about 2,100). The stated value is hidden (the estimator runs with
use_source=False, so it never reads the yield string or a servings field) and estimated from the
title, ingredients and steps.

Split: md5(key) even -> the fit half (the calibration tables are fitted on it), odd -> the
held-out half. The bar is judged on the held-out half; the whole set is reported beside it.

THE BAR (written before the first run, from the brief): an estimate is a hit when it is within
+-1 of the stated servings or within +-30% of it. PASS needs hits on >= 70% of the held-out
recipes overall AND >= 70% within every course. A recipe the estimator leaves NULL is a miss.
"""
import argparse
import collections
import hashlib
import json
import os
import sqlite3
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402
from ingest.build import servings as SV  # noqa: E402
from ingest.build.course import tag_course  # noqa: E402
from ingest.build.curate import drop_reason, parse_servings  # noqa: E402
from ingest.nutrition import estimate as NUT  # noqa: E402
from ingest.tag.tagger import parse_items  # noqa: E402
from ingest.taxonomy import taxonomy as T  # noqa: E402

EVAL_SOURCES = ('bbcgoodfood', 'foodcom', 'foodwishes')
CORPUS = '/home/user/recipe-data/out/corpus.db'
BAR = 0.70


def hit(est, truth):
    return est is not None and (abs(est - truth) <= 1 or abs(est - truth) <= 0.3 * truth)


def held_out(key):
    return int(hashlib.md5(key.encode()).hexdigest(), 16) % 2 == 1


def corpus_truth(path=CORPUS):
    """{key: servings} for the curated corpus's recipes whose source states servings."""
    con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    got = dict(con.execute('SELECT key, servings FROM recipes WHERE servings IS NOT NULL'))
    con.close()
    return got


def load_set(raw_root=S.RAW, keys=None):
    """[(raw, items, course, stated servings)]: the raw records whose id is in `keys`, or with
    keys None every record of EVAL_SOURCES that passes the drops and states a head count."""
    ing = T.load()
    out = []
    for src in EVAL_SOURCES:
        path = S.raw_path(src, raw_root)
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as fh:
            for line in fh:
                try:
                    raw = json.loads(line)
                except ValueError:
                    continue
                if drop_reason(raw) or (keys is not None and raw['id'] not in keys):
                    continue
                truth = parse_servings(raw.get('yield_text'))
                if not truth:
                    continue
                items = parse_items(raw)
                for it in items:
                    it['_slug'] = it.get('slug') if it.get('slug') in ing else None
                out.append((raw, items, tag_course(raw, items)['course'], truth))
    return out, ing


def fit(rows, ing, sn):
    """Print the calibration tables of ingest/build/servings.py, fitted on the fit half of `rows`
    (main() passes the wide set, so the fit half has about 1,000 recipes; the held-out half of the
    corpus set is never in it)."""
    fit_rows = [r for r in rows if not held_out(r[0]['id'])]
    kc, gr, pan, heads = (collections.defaultdict(list) for _ in range(4))
    first = []   # (deciding kind, its raw value or total, course, truth)
    line_g = []
    for raw, items, course, truth in fit_rows:
        heads[course].append(truth)
        per_line = collections.defaultdict(float)
        for it in items:
            if it.get('_slug'):
                g = NUT.item_grams(it, ing[it['_slug']])
                if g and g > 0:
                    per_line[it['line']] += g
        line_g += per_line.values()
        k = SV.total_kcal(items, ing, sn)
        if k:
            kc[course].append(k / truth)
        g = SV.total_grams(items, ing)
        if g:
            gr[course].append(g / truth)
        p = SV.pan_servings(SV._texts(raw, False), course)
        area = p[0] * SV.PAN_SQIN_PER_SERVING.get(course, 10.0) if p and p[1] is None else None
        if area:
            pan[course].append(area / truth)
        sig, _ = SV.signals(raw, items, course, ing, sn, use_yield=False)
        if sig:
            kind, value = sig[0]
            total = {'energy': k, 'mass': g, 'pan': area}.get(kind)
            first.append((kind, value, total, course, truth))
    med = statistics.median
    kcal = {c: int(round(med(v), -1)) for c, v in sorted(kc.items())}
    grams = {c: int(round(med(v))) for c, v in sorted(gr.items())}
    sqin = {c: round(med(v), 1) for c, v in sorted(pan.items()) if len(v) >= 5}
    priors = {c: max(range(1, 25), key=lambda k: (sum(hit(k, t) for t in v), -k)) for c, v in sorted(heads.items())}
    print(f'fit half: {len(fit_rows)} recipes')
    print('TYPICAL_LINE_G =', int(round(med(line_g))), f'(n {len(line_g)} weighed lines)')
    print('KCAL_PER_SERVING =', kcal, '(n', {c: len(v) for c, v in sorted(kc.items())}, ')')
    print('GRAMS_PER_SERVING =', grams, '(n', {c: len(v) for c, v in sorted(gr.items())}, ')')
    print('PAN_SQIN_PER_SERVING =', sqin, '(n', {c: len(v) for c, v in sorted(pan.items())},
          '; a course with under 5 pans keeps its default)')
    print('COURSE_PRIOR =', priors, '(median', {c: med(v) for c, v in sorted(heads.items())}, ')')
    table = {'energy': (kcal, 400), 'mass': (grams, 200), 'pan': (sqin, 10.0)}
    for kind in SV.KINDS:
        got = []
        for k, value, total, course, truth in first:
            if k != kind:
                continue
            if kind in table and total:
                t, dflt = table[kind]
                value = total / t.get(course, SV.PAN_SQIN_PER_SERVING.get(course, dflt) if kind == 'pan' else dflt)
            got.append((value, course, truth))
        if not got:
            continue
        prior_only = sum(hit(SV._clamp(priors.get(c, SV.DEFAULT_PRIOR)), t) for v, c, t in got)
        scores = [(sum(hit(SV._clamp(SV.shrink(v, c, kind, r, priors)), t) for v, c, t in got), r)
                  for r in SV.ZONE_GRID]
        top = max(h for h, _ in scores)
        tol = max(1, 0.02 * len(got))
        r = 1.0 if kind == 'head' else min(r for h, r in scores if h > top - tol)
        print(f'ZONE[{kind!r}] = {r}  ({dict((r, h) for h, r in scores)[r]}/{len(got)} fit-half hits where it decides; '
              f'best in grid {top}; signal as is (r=1): {scores[0][0]}; course prior only: {prior_only})')
        print('    hits by r: ' + ' '.join(f'{r}:{h}' for h, r in scores))


_BUCKETS = (('1', 1, 1), ('2', 2, 2), ('3-4', 3, 4), ('5-6', 5, 6), ('7-9', 7, 9), ('10-14', 10, 14),
            ('15+', 15, 10 ** 6))


def _bucket(v):
    if v is None:
        return 'none'
    return next(name for name, lo, hi in _BUCKETS if lo <= v <= hi)


def evaluate(rows, ing, sn, log=print):
    res = []
    for raw, items, course, truth in rows:
        res.append((raw, course, truth, SV.estimate(raw, items, course, ing, sn, use_source=False)))

    def acc(sub):
        return sum(hit(e['servings'], t) for _, _, t, e in sub), len(sub)

    ho = [r for r in res if held_out(r[0]['id'])]
    lines = []
    for name, sub in (('held-out', ho), ('all', res)):
        h, n = acc(sub)
        lines.append(f'{name}: {h}/{n} hits ({h / max(1, n):.1%})')
    base = sum(hit(SV.COURSE_PRIOR.get(c, SV.DEFAULT_PRIOR), t) for _, c, t, _ in ho)
    lines.append(f'baseline, the course prior alone (no recipe evidence): {base}/{len(ho)} held-out hits '
                 f'({base / max(1, len(ho)):.1%})')
    h, n = acc(ho)
    passed = n > 0 and h / n >= BAR
    lines.append('\nby course (held-out | all): hits/n; misses on all split into under (estimate too low), '
                 'over (too high), none (no estimate)')
    by = collections.defaultdict(list)
    for r in res:
        by[r[1]].append(r)
    for c in sorted(by, key=lambda c: -len(by[c])):
        hh, nn = acc([r for r in by[c] if held_out(r[0]['id'])])
        ha, na = acc(by[c])
        miss = [(t, e['servings']) for _, _, t, e in by[c] if not hit(e['servings'], t)]
        under = sum(1 for t, e in miss if e is not None and e < t)
        over = sum(1 for t, e in miss if e is not None and e > t)
        none = sum(1 for t, e in miss if e is None)
        ok = nn > 0 and hh / nn >= BAR
        passed = passed and ok
        lines.append(f'  {c:16s} {hh:4d}/{nn:<4d} ({hh / max(1, nn):5.1%}) | {ha:4d}/{na:<4d} ({ha / max(1, na):5.1%})  '
                     f'under {under:3d}  over {over:3d}  none {none:3d}  {"ok" if ok else "BELOW BAR"}')
    lines.append('\nby tier (all): hits/n')
    bt = collections.defaultdict(list)
    for r in res:
        bt[r[3]['servings_source']].append(r)
    for t in sorted(bt, key=str):
        h, n = acc(bt[t])
        lines.append(f'  {str(t):8s} {h}/{n} ({h / max(1, n):.1%})')
    names = [b[0] for b in _BUCKETS] + ['none']
    lines.append('\nconfusion by course (all; rows = stated servings, columns = estimate)')
    for c in sorted(by, key=lambda c: -len(by[c])):
        lines.append(f'  {c:>16s}  ' + ' '.join(f'{x:>5s}' for x in names))
        m = collections.Counter((_bucket(t), _bucket(e['servings'])) for _, _, t, e in by[c])
        for tb in names[:-1]:
            row = [m[(tb, eb)] for eb in names]
            if sum(row):
                lines.append(f'    stated {tb:>7s}  ' + ' '.join(f'{x:5d}' for x in row))
    misses = [r for r in ho if not hit(r[3]['servings'], r[2])]
    misses.sort(key=lambda r: hashlib.md5(r[0]['id'].encode()).hexdigest())
    lines.append('\n10 held-out misses, verbatim (key | title | course | stated yield | estimate, tier, yield_count)')
    for raw, c, t, e in misses[:10]:
        lines.append(f'  {raw["id"]} | {raw["title"]} | {c} | {raw.get("yield_text")!r} | '
                     f'{e["servings"]} {e["servings_source"]} {e["yield_count"]!r}')
    lines.append(f'\nBAR (>= {BAR:.0%} hits held-out, overall and every course): {"PASSED" if passed else "FAILED"}')
    log('\n'.join(lines))
    return passed, res


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fit', action='store_true')
    ap.add_argument('--wide', action='store_true')
    ap.add_argument('--raw', default=S.RAW)
    args = ap.parse_args(argv)
    keys = None if (args.wide or args.fit) else set(corpus_truth())
    rows, ing = load_set(args.raw, keys)
    sn = NUT.load_slug_nutrients()
    print(f'eval set ({"wide" if keys is None else "corpus"}): {len(rows)} recipes with a stated head count'
          f'{"" if keys is None else f" of {len(keys)} in the corpus"}; '
          f'{sum(held_out(r[0]["id"]) for r in rows)} held out')
    if args.fit:
        fit(rows, ing, sn)
        return 0
    passed, _ = evaluate(rows, ing, sn)
    return 0 if passed else 1


if __name__ == '__main__':
    sys.exit(main())
