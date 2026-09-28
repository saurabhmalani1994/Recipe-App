"""Rank the scanned recipes and pick the corpus: dedupe -> score -> select (brief S8 #2-#5).

Reads the finished scan (ingest/curate/scan.py) and writes, under <out>:
  selection.tsv   the chosen recipes: source, line, key, quality, rating, rating_count,
                  cluster_size, reason. The corpus build reads it (build_corpus --select).
  drops.json      {source: {reason: [count, first example]}} for every scanned line that is not
                  selected: the scan's structural drops plus curate_junk_<flag>,
                  curate_duplicate and curate_below_cut. The build copies it into build_drops.
  pool.tsv.gz     the ranked pool (leaders that passed the junk filters), for the eval draw.
  stats.json      the numbers the report quotes.
and ingest/curate/CURATE_REPORT.md.

Run: python3 -m ingest.curate.rank [--target 80000] [--out DIR] [--draw-eval] [--compare PREV_OUT_DIR]
"""
import argparse
import gzip
import json
import os
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import curate as CUR  # noqa: E402
from ingest.curate import dedupe as D  # noqa: E402
from ingest.curate import scan as SC  # noqa: E402
from ingest.curate import score as Q  # noqa: E402
from ingest.curate import select as SEL  # noqa: E402
from ingest.curate import textpass as TP  # noqa: E402
from ingest.curate.features import HARD_JUNK, TEXT_FIELDS  # noqa: E402

OUT = '/home/user/recipe-data/derived/curate'
REPORT = os.path.join(HERE, 'CURATE_REPORT.md')
EVAL_DIR = os.path.join(HERE, 'eval')
EVAL_SEED = 82              # S8 drew owner_grade.md with seed 8; S8b draws owner_grade_2.md
EVAL_NAME = 'owner_grade_2'
EVAL_PER_BAND = 15
TUNING_KEY = os.path.join(EVAL_DIR, 'owner_grade_key.json')   # the graded 60, never redrawn
FIELDS = ('key', 'source', 'line', 'domain', 'title', 'ntitle', 'slugs', 'n_lines', 'resolved', 'qty', 'n_steps',
          'step_chars', 'max_step', 'time_source', 'total_min', 'course', 'cuisine', 'veg', 'nrm', 'image',
          'servings', 'rating', 'rating_count', 'rating_source', 'junk') + TEXT_FIELDS


def log(*a, **_):
    print(*a, flush=True)


def load(scan_dir, text_dir=TP.OUT):
    """The scan's records; a record made before S8b gets its text fields from textpass."""
    recs = []
    t0 = time.time()
    intern = sys.intern
    text = None
    missing = 0
    for i, r in enumerate(SC.iter_records(scan_dir, FIELDS)):
        r['slugs'] = tuple(intern(s) for s in r['slugs'])
        r['domain'] = intern(r['domain'])
        r['source'] = intern(r['source'])
        if r['style'] is None:
            if text is None:
                log('  backfilling text features (textpass)')
                text = TP.load(scan_dir, text_dir, log=log)
            t = text.get((r['source'], r['line']))
            if t is None:
                missing += 1   # counted, never silent; scored as if no marker was found
                t = {'style': (), 'n_rich': 0, 'n_short': 0, 'trunc': None, 'n_frag': 0}
            r.update(t)
        else:
            r['style'] = tuple(r['style'])
        recs.append(r)
        if i and i % 250_000 == 0:
            log(f'  loaded {i:,} records ({time.time() - t0:.0f}s)')
    if missing:
        log(f'  {missing:,} records had no text features')
    load.missing_text = missing
    return recs


# Brief S10: the sources taken whole (select.EDITORIAL_SOURCES, the cuisine sites among them) have
# no score cut to keep out a recipe the app cannot read. One whose ingredient lines mostly do not
# resolve to a slug is dropped as curate_junk_unparsed: measured on the S10 scan, that is the
# Hindi-language pages of archanaskitchen (393) and hebbarskitchen (22), the French-language
# pages of myparisiankitchen (370 of 394), and pardonyourfrench pages whose ingredient list the
# site serves as one run-together line (51). A recipe that cannot be matched cannot be offered
# (R10's reason).
WHOLE_MIN_RESOLVED = 0.5


def unparsed_whole(r):
    return r['source'] in SEL.EDITORIAL_SOURCES and (r['resolved'] or 0) < WHOLE_MIN_RESOLVED


def hard_flag(r):
    for f in HARD_JUNK:
        if f in r['junk']:
            return f
    return None


def time_band(m):
    if m is None:
        return 'unknown'
    if m <= 30:
        return '<=30'
    if m <= 60:
        return '31-60'
    if m <= 120:
        return '61-120'
    return '>120'


def spearman(xs, ys):
    from scipy.stats import spearmanr
    r = spearmanr(xs, ys)
    return float(r.statistic), float(r.pvalue)


def run(scan_dir=SC.OUT, out=OUT, target=SEL.TARGET, draw_eval=False, report=REPORT, eval_dir=EVAL_DIR,
        compare=None, text_dir=TP.OUT):
    """`compare`: a directory holding an earlier run's selection.tsv and pool.tsv.gz; the stats
    and the report then say how many selected recipes changed and which moved most."""
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    log('loading scan records')
    recs = load(scan_dir, text_dir)
    log(f'{len(recs):,} records ({time.time() - t0:.0f}s)')

    rated = [r for r in recs if r['rating_source'] and r['rating_count']]
    mean_rating = (sum(r['rating'] for r in rated) / len(rated)) if rated else None

    base = {}
    for r in recs:
        # an excluded source never leads a cluster, so it cannot hide an eligible copy
        base[r['key']] = -1.0 if hard_flag(r) else (-0.5 if r['source'] in SEL.EXCLUDED_SOURCES else Q.quality(r))
    log(f'clustering ({time.time() - t0:.0f}s)')
    cl = D.cluster(((r['key'], r['ntitle'], r['slugs']) for r in recs), base)
    log(f'clustered ({time.time() - t0:.0f}s)')

    drops = defaultdict(dict)

    def drop(src, reason, ex):
        d = drops[src]
        if reason in d:
            d[reason][0] += 1
        else:
            d[reason] = [1, ex]

    for m in SC.iter_meta(scan_dir):
        for reason, (c, ex) in sorted(m['drops'].items()):
            d = drops[m['source']]
            if reason in d:
                d[reason][0] += c
            else:
                d[reason] = [c, ex]

    flag_counts = Counter()
    pool = []
    by_key = {}
    for r in recs:
        for f in r['junk']:
            flag_counts[(r['source'], f)] += 1
        # R16 on the title, for records scanned before the build's drop checked it (their labels
        # and tags are not in the scan record; the build re-checks all three on what it reads)
        if CUR.is_israeli(r['title']):
            drop(r['source'], 'excluded_israeli', r['key'])
            continue
        hf = hard_flag(r)
        cid, size, leader = cl[r['key']]
        if hf:
            drop(r['source'], f'curate_junk_{hf}', r['key'])
            continue
        if unparsed_whole(r):
            drop(r['source'], 'curate_junk_unparsed', r['key'])
            continue
        if r['source'] in SEL.EXCLUDED_SOURCES:
            drop(r['source'], 'curate_excluded_source', r['key'])
            continue
        if not leader:
            drop(r['source'], 'curate_duplicate', r['key'])
            continue
        r['cluster_size'] = size
        r['score'] = Q.quality(r, copies=size - 1)
        r['content'] = Q.quality(r, without=('rating', 'pop'))
        pool.append(r)
        by_key[r['key']] = r
    log(f'pool {len(pool):,} ({time.time() - t0:.0f}s)')

    keys, reasons = SEL.select(pool, target=target)
    chosen = set(keys)
    for r in pool:
        if r['key'] not in chosen:
            drop(r['source'], 'curate_below_cut', r['key'])
    sel = sorted((by_key[k] for k in keys), key=lambda r: (r['source'], r['line']))
    log(f'selected {len(sel):,} ({time.time() - t0:.0f}s)')

    with open(os.path.join(out, 'selection.tsv'), 'w', encoding='utf-8') as fh:
        fh.write('source\tline\tkey\tquality\trating\trating_count\tcluster_size\treason\n')
        for r in sel:
            fh.write(f"{r['source']}\t{r['line']}\t{r['key']}\t{r['score']}\t"
                     f"{'' if r['rating'] is None else r['rating']}\t{r['rating_count'] or ''}\t"
                     f"{r['cluster_size']}\t{reasons[r['key']]}\n")
    with open(os.path.join(out, 'drops.json'), 'w', encoding='utf-8') as fh:
        json.dump({s: dict(sorted(v.items())) for s, v in sorted(drops.items())}, fh, indent=1, sort_keys=True)
    ranked = sorted(pool, key=lambda r: (-r['score'], r['key']))
    with gzip.open(os.path.join(out, 'pool.tsv.gz'), 'wt', encoding='utf-8') as fh:
        fh.write('rank\tkey\tsource\tline\tscore\tcontent\tcluster_size\tselected\ttitle\n')
        for i, r in enumerate(ranked):
            fh.write(f"{i}\t{r['key']}\t{r['source']}\t{r['line']}\t{r['score']}\t{r['content']}\t"
                     f"{r['cluster_size']}\t{int(r['key'] in chosen)}\t{r['title']}\n")

    # ---- the proxy: content score vs Food.com rating ----
    joined = [r for r in pool if r['rating_source'] and (r['rating_count'] or 0) >= 3]
    rho = p = None
    per_term = {}
    if len(joined) > 10:
        y = [Q.bayes_rating(r['rating'], r['rating_count']) for r in joined]
        rho, p = spearman([r['content'] for r in joined], y)
        ts = [Q.terms(r, r['cluster_size'] - 1) for r in joined]
        for k in Q.WEIGHTS:
            if k != 'rating':
                per_term[k] = round(spearman([t[k] for t in ts], y)[0], 4)
        per_term['copies (cluster size - 1)'] = round(spearman([r['cluster_size'] - 1 for r in joined], y)[0], 4)
    tuning = tuning_eval(recs, cl, ranked)
    moved = compare_runs(compare, ranked, chosen) if compare else None
    fc_urls = [r for r in recs if r['source'] == 'recipenlg' and r['domain'] == 'food.com']
    fc_joined = sum(1 for r in fc_urls if r['rating_source'] == 'foodcom_interactions')

    # ---- stats ----
    n_scanned = sum(m['lines'] for m in SC.iter_meta(scan_dir))
    stats = {
        'lines_scanned': n_scanned,
        'records': len(recs),
        'pool': len(pool),
        'selected': len(sel),
        'mean_rating_joined': mean_rating,
        'foodcom_join': {'recipenlg_foodcom_urls': len(fc_urls), 'joined': fc_joined,
                         'rate': fc_joined / len(fc_urls) if fc_urls else None,
                         'rated_records_all_sources': len(rated)},
        'proxy': {'n': len(joined), 'spearman_content_vs_bayes_rating': rho, 'p': p, 'per_term': per_term},
        'clusters': {'multi_member': sum(1 for r in pool if r['cluster_size'] > 1),
                     'duplicates_dropped': sum(v.get('curate_duplicate', [0])[0] for v in drops.values()),
                     'largest': sorted(((r['cluster_size'], r['title']) for r in pool), reverse=True)[:10]},
        'junk_flags': {f'{s}.{f}': c for (s, f), c in sorted(flag_counts.items())},
        'reasons': dict(Counter(reasons.values())),
        'by_source': dict(Counter(r['source'] if r['source'] != 'recipenlg' else f"recipenlg:{r['domain']}"
                                  for r in sel).most_common(40)),
        'by_source_top': dict(Counter(r['source'] for r in sel)),
        'by_cuisine': dict(Counter(r['cuisine'] or '(none)' for r in sel).most_common()),
        'pool_by_cuisine': dict(Counter(r['cuisine'] or '(none)' for r in pool).most_common()),
        'by_course': dict(Counter(r['course'] for r in sel).most_common()),
        'by_veg': dict(Counter(r['veg'] for r in sel).most_common()),
        'by_nrm': dict(Counter(r['nrm'] for r in sel).most_common()),
        'by_time': dict(Counter(time_band(r['total_min']) for r in sel).most_common()),
        'mix': SEL.mix_shares(sel),
        'pool_mix': SEL.mix_shares(pool),
        'floors_r18': getattr(SEL.select, 'floor_stats', None),
        'size': getattr(SEL.select, 'size_stats', None),
        'editorial_by_source': dict(sorted(Counter(r['source'] for r in sel
                                                   if reasons[r['key']] == 'editorial').items())),
        'score_cut': min((r['score'] for r in sel if reasons[r['key']] == 'score'), default=None),
        'top10': [(r['score'], r['key'], r['title']) for r in ranked[:10]],
        'bottom_kept': [(r['score'], r['key'], r['title'])
                        for r in sorted(sel, key=lambda r: (r['score'], r['key']))[:5]],
        'drops': {s: dict(sorted(v.items())) for s, v in sorted(drops.items())},
        'score_quantiles_pool': [ranked[int(q * (len(ranked) - 1))]['score']
                                 for q in (0, .01, .05, .25, .5, .75, .95, .99, 1)] if ranked else [],
        'weights': Q.WEIGHTS,
        'style': style_stats(sel, pool),
        'fresh_mean': {'selected': _mean(Q.fresh_term(r['slugs'], r['n_short'], r['n_lines'], r['course']) for r in sel),
                       'pool': _mean(Q.fresh_term(r['slugs'], r['n_short'], r['n_lines'], r['course']) for r in pool)},
        'trunc_pool': dict(Counter(r['trunc'] for r in pool if r['trunc'])),
        'trunc_selected': dict(Counter(r['trunc'] for r in sel if r['trunc'])),
        'text_backfill_missing': getattr(load, 'missing_text', 0),
        'ceiling': {'cuisines': list(SEL.CEILING_CUISINES), 'ceiling': SEL.CEILING,
                    'selected': sum(1 for r in sel if r['cuisine'] in SEL.CEILING_CUISINES),
                    'pool': sum(1 for r in pool if r['cuisine'] in SEL.CEILING_CUISINES)},
        'tuning': tuning,
        'compare': moved,
    }
    with open(os.path.join(out, 'stats.json'), 'w', encoding='utf-8') as fh:
        json.dump(stats, fh, indent=1, sort_keys=True, default=str)
    if report:
        with open(report, 'w', encoding='utf-8') as fh:
            fh.write(report_md(stats))
    log(f'wrote {out}/selection.tsv, drops.json, pool.tsv.gz, stats.json and {report} ({time.time() - t0:.0f}s)')
    if draw_eval:
        from ingest.curate.eval import draw
        exclude = [k['key'] for k in json.load(open(TUNING_KEY, encoding='utf-8'))] if os.path.exists(TUNING_KEY) else []
        draw.draw(ranked, scan_dir, eval_dir, seed=EVAL_SEED, per_band=EVAL_PER_BAND, name=EVAL_NAME, exclude=exclude)
        log(f'wrote {eval_dir}/{EVAL_NAME}.md')
    return stats


def _mean(xs):
    xs = list(xs)
    return round(sum(xs) / len(xs), 4) if xs else None


def style_stats(sel, pool):
    def count(rows):
        c = Counter()
        any_ = 0
        for r in rows:
            m = Q.style_markers(r['style'], r['n_rich'], r['n_lines'], r['course'])
            any_ += bool(m)
            c.update(m)
        return {'any': any_, 'by_marker': dict(c.most_common())}
    return {'selected': count(sel), 'pool': count(pool)}


def tuning_eval(recs, cl, ranked):
    """The graded 60 (the tuning set) under this score: mean grade by tertile of the score,
    Spearman rho against the grade, and each recipe's percentile in the ranked pool."""
    gpath = os.path.join(EVAL_DIR, 'owner_grade.md')
    if not (os.path.exists(TUNING_KEY) and os.path.exists(gpath)):
        return None
    from ingest.curate.eval import draw
    key = json.load(open(TUNING_KEY, encoding='utf-8'))
    grades = draw.read_grades(open(gpath, encoding='utf-8').read())
    want = {k['key']: k for k in key if k['n'] in grades}
    pos = {r['key']: i for i, r in enumerate(ranked)}
    rows = []
    for r in recs:
        k = want.get(r['key'])
        if k is None:
            continue
        size = cl[r['key']][1]
        rows.append({'n': k['n'], 'grade': grades[k['n']], 'old_band': k['band'], 'old_score': k['score'],
                     'score': Q.quality(r, copies=size - 1), 'title': r['title'],
                     'pct': round(pos[r['key']] / len(ranked), 4) if r['key'] in pos else None})
    if len(rows) < 3:
        return None
    by_new = sorted(rows, key=lambda x: (-x['score'], x['n']))
    t = len(rows) // 3
    tert = [by_new[:t], by_new[t:len(rows) - t], by_new[len(rows) - t:]]
    old = {}
    for x in rows:
        old.setdefault(x['old_band'], []).append(x['grade'])
    return {
        'n': len(rows),
        'old_band_means': {b: round(sum(v) / len(v), 3) for b, v in old.items()},
        'new_tertile_means': {name: round(sum(x['grade'] for x in g) / len(g), 3)
                              for name, g in zip(('top', 'middle', 'bottom'), tert) if g},
        'spearman_old': round(spearman([x['old_score'] for x in rows], [x['grade'] for x in rows])[0], 4),
        'spearman_new': round(spearman([x['score'] for x in rows], [x['grade'] for x in rows])[0], 4),
        'in_new_bands': {name: [x['grade'] for x in rows if x['pct'] is not None and lo <= x['pct'] < hi]
                         for name, (lo, hi) in (('top5', (0, .05)), ('middle5', (.475, .525)),
                                                ('bottom5', (.95, 1.01)))},
        'rows': by_new,
    }


def compare_runs(prev_dir, ranked, chosen):
    """How this run differs from the one in prev_dir (its selection.tsv and pool.tsv.gz)."""
    prev_sel = set()
    with open(os.path.join(prev_dir, 'selection.tsv'), encoding='utf-8') as fh:
        next(fh)
        for ln in fh:
            prev_sel.add(ln.split('\t', 3)[2])
    prev_rank = {}
    with gzip.open(os.path.join(prev_dir, 'pool.tsv.gz'), 'rt', encoding='utf-8') as fh:
        next(fh)
        for ln in fh:
            p = ln.rstrip('\n').split('\t')
            prev_rank[p[1]] = (int(p[0]), float(p[4]))
    n_prev = len(prev_rank) or 1
    n = len(ranked) or 1
    moves = []
    for i, r in enumerate(ranked):
        got = prev_rank.get(r['key'])
        if got:
            moves.append((got[0] / n_prev - i / n, r['key'], r['domain'], r['title'], got[1], r['score'],
                          round(got[0] / n_prev, 4), round(i / n, 4)))
    moves.sort(key=lambda m: (-m[0], m[1]))

    def fmt(ms):
        return [{'key': m[1], 'site': m[2], 'title': m[3], 'old_score': m[4], 'new_score': m[5],
                 'old_pct': m[6], 'new_pct': m[7]} for m in ms]
    return {'prev_selected': len(prev_sel), 'kept': len(prev_sel & chosen), 'left': len(prev_sel - chosen),
            'entered': len(chosen - prev_sel), 'up': fmt(moves[:10]), 'down': fmt(moves[::-1][:10])}


def _pct(c, n):
    return f'{c:,} ({c / n:.1%})' if n else str(c)


def report_md(st):
    n = st['selected']
    L = ['# Curation report (generated by `python3 -m ingest.curate.rank`)\n']
    L.append(f"Scanned {st['lines_scanned']:,} raw lines; {st['records']:,} recipes passed the build's drops; "
             f"{st['pool']:,} survived the junk filters and the dedupe (the ranked pool); {n:,} selected.\n")
    fj = st['foodcom_join']
    L.append('## Ratings join\n')
    L.append(f"recipenlg food.com URLs: {fj['recipenlg_foodcom_urls']:,}; joined to a Food.com interactions "
             f"rating: {fj['joined']:,} ({(fj['rate'] or 0):.1%}). Rated records across all sources: "
             f"{fj['rated_records_all_sources']:,}; mean rating {st['mean_rating_joined'] or 0:.3f} "
             f"(score.RATING_PRIOR = {Q.RATING_PRIOR}).\n")
    px = st['proxy']
    if px['spearman_content_vs_bayes_rating'] is not None:
        L.append(f"Proxy (BAR.md): Spearman rho between the content score and the Bayesian rating on "
                 f"{px['n']:,} pool recipes with >= 3 ratings: {px['spearman_content_vs_bayes_rating']:.4f} "
                 f"(p = {px['p']:.2g}). Per term: " +
                 ', '.join(f'{k} {v}' for k, v in px['per_term'].items()) +
                 ' (popularity includes the review count, so its rho is partly mechanical).\n')
    L.append('## Selection\n')
    L.append('Picked by: ' + ', '.join(f'{k} {v:,}' for k, v in sorted(st['reasons'].items())) +
             f". Lowest score taken on score alone: {st['score_cut']}.\n")
    L.append('Mix (selected): ' + ', '.join(f'{k} {v:.1%}' for k, v in st['mix'].items()) +
             '. In the pool: ' + ', '.join(f'{k} {v:.1%}' for k, v in st['pool_mix'].items()) + '.\n')
    for title, key in (('source', 'by_source_top'), ('site (recipenlg split by domain)', 'by_source'),
                       ('cuisine', 'by_cuisine'), ('course', 'by_course'), ('vegetarian', 'by_veg'),
                       ('no_red_meat', 'by_nrm'), ('total time (min)', 'by_time')):
        L.append(f'By {title}: ' + ', '.join(f'{k} {_pct(v, n)}' for k, v in st[key].items()) + '\n')
    L.append('Pool by cuisine (available): ' + ', '.join(f'{k} {v:,}' for k, v in st['pool_by_cuisine'].items()) + '\n')
    L.append('## Score (S8b)\n')
    L.append('Weights: ' + ', '.join(f'{k} {v}' for k, v in st['weights'].items()) + '. Formula and terms: score.py.\n')
    tu = st.get('tuning')
    if tu:
        L.append(f"Tuning set (the {tu['n']} graded recipes of owner_grade.md; the weights were set on them, so "
                 f"this is fit, not a test): mean grade by the S8 bands " +
                 ', '.join(f'{k} {v}' for k, v in tu['old_band_means'].items()) +
                 '; by tertile of this score ' + ', '.join(f'{k} {v}' for k, v in tu['new_tertile_means'].items()) +
                 f". Spearman rho score vs grade: S8 {tu['spearman_old']}, now {tu['spearman_new']}. Grades of those "
                 'that fall in the new pool bands: ' +
                 ', '.join(f'{k} {v}' for k, v in tu['in_new_bands'].items()) + '.\n')
    sy = st['style']
    L.append(f"Style markers (D17): {_pct(sy['selected']['any'], n)} of the selection carry one "
             f"({sy['pool']['any']:,} of {st['pool']:,} in the pool). Selected by marker: " +
             ', '.join(f'{k} {v:,}' for k, v in sy['selected']['by_marker'].items()) + '. Pool by marker: ' +
             ', '.join(f'{k} {v:,}' for k, v in sy['pool']['by_marker'].items()) + '.\n')
    L.append(f"Freshness term mean (D18): selected {st['fresh_mean']['selected']}, pool {st['fresh_mean']['pool']}.\n")
    L.append('Truncated methods in the pool: ' + ', '.join(f'{k} {v:,}' for k, v in st['trunc_pool'].items()) +
             '; selected: ' + (', '.join(f'{k} {v:,}' for k, v in st['trunc_selected'].items()) or 'none') + '.\n')
    fl = st.get('floors_r18')
    if fl:
        L.append(f"R18 floor bar (the pool's {fl['quantile']:.0%} quantile): {fl['bar']}. Recipes a floor "
                 'declined below it: ' + (', '.join(f'{k} {v:,}' for k, v in fl['declined_below_bar'].items())
                                          or 'none') +
                 '. Floors left short: ' + (', '.join(f'{k} {v:,}' for k, v in fl['short'].items()) or 'none') +
                 '.\n')
    sz = st.get('size')
    if sz:
        L.append(f"Size cap: corpus.db at most {sz['size_cap'] / 1e6:.0f} MB, budget {sz['byte_budget'] / 1e6:.1f} MB. "
                 f"Target {sz['target']:,}, settled at {sz['settled_target']:,}; selected {sz['selected']:,}, "
                 f"estimated {sz['est_bytes'] / 1e6:.1f} MB (tries: " +
                 '; '.join(f'{t:,} -> {n:,} at {b / 1e6:.1f} MB' for t, n, b in sz['tries']) + ').\n')
    L.append('Editorial and cuisine-site recipes taken whole: ' +
             ', '.join(f'{k} {v:,}' for k, v in st['editorial_by_source'].items()) + '.\n')
    ce = st['ceiling']
    L.append(f"Cuisine ceiling: {' + '.join(ce['cuisines'])} at most {ce['ceiling']:.0%} of the target; selected "
             f"{_pct(ce['selected'], n)} (pool {ce['pool']:,}).\n")
    cm = st.get('compare')
    if cm:
        L.append(f"Against the previous selection ({cm['prev_selected']:,}): kept {cm['kept']:,}, left "
                 f"{cm['left']:,}, entered {cm['entered']:,}.\n")
        for title, k in (('Moved up most (pool percentile, old -> new)', 'up'), ('Moved down most', 'down')):
            L.append(title + ':\n')
            for m in cm[k]:
                L.append(f"- {m['title']} ({m['site']}, `{m['key']}`): {m['old_pct']:.1%} -> {m['new_pct']:.1%}, "
                         f"score {m['old_score']} -> {m['new_score']}")
            L.append('')
    L.append('## Dedupe\n')
    c = st['clusters']
    L.append(f"Pool recipes that lead a cluster of 2+: {c['multi_member']:,}; copies dropped as duplicates: "
             f"{c['duplicates_dropped']:,}. Largest clusters: " +
             '; '.join(f'{t} ({s})' for s, t in c['largest']) + '.\n')
    L.append('## Junk flags (every scanned recipe, hard and soft)\n')
    L.append('| source.flag | count |\n|---|---:|')
    for k, v in st['junk_flags'].items():
        L.append(f'| {k} | {v:,} |')
    L.append('\n## Drops, with reasons (every scanned line not selected)\n')
    L.append('| source | reason | count | first example |\n|---|---|---:|---|')
    for s, d in st['drops'].items():
        for reason, (cnt, ex) in sorted(d.items(), key=lambda kv: -kv[1][0]):
            L.append(f'| {s} | {reason} | {cnt:,} | `{ex}` |')
    L.append('\n## Samples, verbatim\n')
    L.append('Top 10 of the pool by score:\n')
    for s, k, t in st['top10']:
        L.append(f'- {s} `{k}` {t}')
    L.append('\nBottom 5 selected:\n')
    for s, k, t in st['bottom_kept']:
        L.append(f'- {s} `{k}` {t}')
    L.append('\nPool score quantiles (max, 99%, 95%, 75%, 50%, 25%, 5%, 1%, min): ' +
             ', '.join(str(x) for x in st['score_quantiles_pool']) + '\n')
    return '\n'.join(L) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', default=SC.OUT)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--target', type=int, default=SEL.TARGET)
    ap.add_argument('--draw-eval', action='store_true', help=f'draw eval/{EVAL_NAME}.md from the new ranking')
    ap.add_argument('--compare', default=None, help="an earlier run's out dir, to count what changed")
    args = ap.parse_args(argv)
    run(args.scan, args.out, args.target, args.draw_eval, compare=args.compare)
    return 0


if __name__ == '__main__':
    sys.exit(main())
