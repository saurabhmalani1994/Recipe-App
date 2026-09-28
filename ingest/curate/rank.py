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

Run: python3 -m ingest.curate.rank [--target 80000] [--out DIR] [--draw-eval]
"""
import argparse
import gzip
import json
import math
import os
import random
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.curate import dedupe as D  # noqa: E402
from ingest.curate import scan as SC  # noqa: E402
from ingest.curate import score as Q  # noqa: E402
from ingest.curate import select as SEL  # noqa: E402
from ingest.curate.features import HARD_JUNK, JUNK_FLAGS  # noqa: E402

OUT = '/home/user/recipe-data/derived/curate'
REPORT = os.path.join(HERE, 'CURATE_REPORT.md')
EVAL_DIR = os.path.join(HERE, 'eval')
EVAL_SEED = 8
FIELDS = ('key', 'source', 'line', 'domain', 'title', 'ntitle', 'slugs', 'n_lines', 'resolved', 'qty', 'n_steps',
          'step_chars', 'max_step', 'time_source', 'total_min', 'course', 'cuisine', 'veg', 'nrm', 'image',
          'servings', 'rating', 'rating_count', 'rating_source', 'junk')


def log(*a):
    print(*a, flush=True)


def load(scan_dir):
    recs = []
    t0 = time.time()
    intern = sys.intern
    for i, r in enumerate(SC.iter_records(scan_dir, FIELDS)):
        r['slugs'] = tuple(intern(s) for s in r['slugs'])
        r['domain'] = intern(r['domain'])
        r['source'] = intern(r['source'])
        recs.append(r)
        if i and i % 250_000 == 0:
            log(f'  loaded {i:,} records ({time.time() - t0:.0f}s)')
    return recs


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


def run(scan_dir=SC.OUT, out=OUT, target=SEL.TARGET, draw_eval=False, report=REPORT, eval_dir=EVAL_DIR):
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    log('loading scan records')
    recs = load(scan_dir)
    log(f'{len(recs):,} records ({time.time() - t0:.0f}s)')

    rated = [r for r in recs if r['rating_source'] and r['rating_count']]
    mean_rating = (sum(r['rating'] for r in rated) / len(rated)) if rated else None

    base = {}
    for r in recs:
        base[r['key']] = -1.0 if hard_flag(r) else Q.quality(r)
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
        hf = hard_flag(r)
        cid, size, leader = cl[r['key']]
        if hf:
            drop(r['source'], f'curate_junk_{hf}', r['key'])
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
        'score_cut': min((r['score'] for r in sel if reasons[r['key']] == 'score'), default=None),
        'top10': [(r['score'], r['key'], r['title']) for r in ranked[:10]],
        'bottom_kept': [(r['score'], r['key'], r['title'])
                        for r in sorted(sel, key=lambda r: (r['score'], r['key']))[:5]],
        'drops': {s: dict(sorted(v.items())) for s, v in sorted(drops.items())},
        'score_quantiles_pool': [ranked[int(q * (len(ranked) - 1))]['score'] for q in (0, .01, .05, .25, .5, .75, .95, .99, 1)][::-1] if ranked else [],
    }
    with open(os.path.join(out, 'stats.json'), 'w', encoding='utf-8') as fh:
        json.dump(stats, fh, indent=1, sort_keys=True, default=str)
    if report:
        with open(report, 'w', encoding='utf-8') as fh:
            fh.write(report_md(stats))
    log(f'wrote {out}/selection.tsv, drops.json, pool.tsv.gz, stats.json and {report} ({time.time() - t0:.0f}s)')
    if draw_eval:
        from ingest.curate.eval import draw
        draw.draw(ranked, scan_dir, eval_dir, seed=EVAL_SEED)
        log(f'wrote {eval_dir}/owner_grade.md')
    return stats


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
    ap.add_argument('--draw-eval', action='store_true')
    args = ap.parse_args(argv)
    run(args.scan, args.out, args.target, args.draw_eval)
    return 0


if __name__ == '__main__':
    sys.exit(main())
