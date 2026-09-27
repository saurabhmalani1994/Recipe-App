"""Tag a seeded sample of raw recipes across all sources and write the distributions.

Run: python3 -m ingest.tag.run_corpus [--n 20000] [--seed 5]
Reads   /home/user/recipe-data/raw/<source>/recipes.jsonl
Writes  /home/user/recipe-data/derived/tags_sample.jsonl  (one {id, source, title, tags} per line;
        outside git)
        ingest/tag/COVERAGE.md  (distributions and undeterminable counts with reasons)

Sampling: every recipe of each source under 5,000 recipes, then the rest of --n split equally
across the bigger sources, drawn uniformly by line number. Sources are still being fetched by
other runs, so sizes are counted at run time and printed in COVERAGE.md. Each recipe is tagged
under a 5 s alarm; a crash or timeout is counted with its reason, never dropped silently.
"""
import argparse
import collections
import json
import os
import random
import signal
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.tag.tagger import tag_recipe  # noqa: E402

RAW = '/home/user/recipe-data/raw'
OUT = '/home/user/recipe-data/derived/tags_sample.jsonl'
COVERAGE = os.path.join(HERE, 'COVERAGE.md')
BIG_MIN = 5000   # a source with fewer recipes than this is taken whole
PER_RECIPE_TIMEOUT_S = 5


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout()


def count_lines(path):
    n = 0
    with open(path, 'rb') as fh:
        for _ in fh:
            n += 1
    return n


def sample(n_total, seed):
    rng = random.Random(seed)
    sources = sorted(d for d in os.listdir(RAW) if os.path.exists(os.path.join(RAW, d, 'recipes.jsonl')))
    sizes = {s: count_lines(os.path.join(RAW, s, 'recipes.jsonl')) for s in sources}
    small = [s for s in sources if sizes[s] < BIG_MIN]
    big = [s for s in sources if sizes[s] >= BIG_MIN]
    take = {s: sizes[s] for s in small}
    rest = max(0, n_total - sum(take.values()))
    # split the rest equally across the big sources; a source smaller than its share gives the
    # difference to the others
    left = sorted(big, key=lambda s: sizes[s])
    while left:
        share = rest // len(left)
        s = left.pop(0)
        take[s] = min(sizes[s], share)
        rest -= take[s]
    picked = []
    for s in sources:
        want = take[s]
        idx = set(range(sizes[s])) if want >= sizes[s] else set(rng.sample(range(sizes[s]), want))
        with open(os.path.join(RAW, s, 'recipes.jsonl'), encoding='utf-8') as fh:
            for n, line in enumerate(fh):
                if n in idx:
                    picked.append((s, line))
    return picked, sizes, take


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=20000)
    ap.add_argument('--seed', type=int, default=5)
    args = ap.parse_args(argv)
    t0 = time.time()
    picked, sizes, take = sample(args.n, args.seed)
    signal.signal(signal.SIGALRM, _alarm)
    C = collections.Counter
    stats = collections.defaultdict(C)
    failed = C()
    n_ok = 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as out:
        for src, line in picked:
            try:
                raw = json.loads(line)
            except ValueError:
                failed['bad json'] += 1
                continue
            signal.alarm(PER_RECIPE_TIMEOUT_S)
            try:
                tags = tag_recipe(raw)
            except Timeout:
                failed['timeout'] += 1
                continue
            except Exception as e:  # counted, never silent
                failed[f'crash: {type(e).__name__}'] += 1
                continue
            finally:
                signal.alarm(0)
            n_ok += 1
            out.write(json.dumps({'id': raw.get('id'), 'source': src, 'title': raw.get('title'),
                                  'tags': tags}, ensure_ascii=False) + '\n')
            stats['source'][src] += 1
            for p in ('vegetarian', 'no_red_meat', 'vegetarian_strict'):
                d = tags['diet'][p]
                stats[f'diet.{p}'][d['status']] += 1
                for s in d['swaps']:
                    stats[f'swap.{p}'][f"{s['slug'] or s['item']} -> {s['use'] or 'leave out'} ({s['via']})"] += 1
                if d['status'] == 'no':
                    for b in d['blockers']:
                        stats[f'blocker.{p}'][b['slug'] or f"(unresolved) {b['item']}"] += 1
            for e in tags['equipment']:
                stats['equipment'][e] += 1
            for g in tags['equipment_alternatives']:
                stats['alternatives'][' or '.join(g)] += 1
            for k in ('stove_and_oven', 'one_pot', 'one_pan', 'sheet_pan_meal'):
                stats[k][str(tags[k])] += 1
            tm = tags['time']
            stats['time.source'][str(tm['source'])] += 1
            stats['weeknight'][str(tm['weeknight'])] += 1
            for k, reason in tags['undeterminable'].items():
                if reason:
                    stats[f'undet.{k}'][reason] += 1
                    stats[f'undet.{k}.by_source'][src] += 1
            if not tags['equipment']:
                stats['no_equipment'][tags['undeterminable']['equipment'] or 'none found'] += 1
    elapsed = time.time() - t0
    write_coverage(stats, failed, n_ok, len(picked), sizes, take, elapsed, args)
    print(f'tagged {n_ok} of {len(picked)} recipes in {elapsed:.0f}s; failed {sum(failed.values())} '
          f'{dict(failed)}; wrote {OUT} and {COVERAGE}')
    return 0


def _table(counter, total, head, limit=None):
    rows = [f'| {head} | count | share |', '|---|---:|---:|']
    for k, v in counter.most_common(limit):
        rows.append(f'| {k} | {v} | {v / total * 100:.1f}% |')
    return '\n'.join(rows)


def write_coverage(stats, failed, n_ok, n_picked, sizes, take, elapsed, args):
    L = []
    L.append('# Tagger coverage (generated by `python3 -m ingest.tag.run_corpus`)\n')
    L.append(f'Sample: {n_picked} raw recipes, seed {args.seed}; every recipe of each source under '
             f'{BIG_MIN}, the rest split equally across the bigger sources, drawn uniformly. '
             f'Tagged {n_ok}; failed {sum(failed.values())} {dict(failed) if failed else ""}. '
             f'Run time {elapsed:.0f} s.\n')
    L.append('| source | recipes in source | sampled |\n|---|---:|---:|')
    for s in sorted(sizes):
        L.append(f'| {s} | {sizes[s]} | {take.get(s, 0)} |')
    L.append('')
    for p in ('vegetarian', 'no_red_meat', 'vegetarian_strict'):
        L.append(f'## Diet: {p}\n')
        L.append(_table(stats[f'diet.{p}'], n_ok, 'status'))
        L.append('\nTop swaps (what makes an adaptable recipe work):\n')
        L.append(_table(stats[f'swap.{p}'], n_ok, 'item -> use (via)', 15))
        L.append('\nTop blockers in `no` recipes (items with no way out):\n')
        L.append(_table(stats[f'blocker.{p}'], n_ok, 'slug', 15))
        L.append('')
    L.append('## Equipment\n')
    L.append(_table(stats['equipment'], n_ok, 'equipment'))
    L.append('\nEither/or pairs:\n')
    L.append(_table(stats['alternatives'], n_ok, 'pair', 15))
    for k in ('stove_and_oven', 'one_pot', 'one_pan', 'sheet_pan_meal'):
        L.append(f'\n{k}:\n')
        L.append(_table(stats[k], n_ok, 'value'))
    L.append('\n## Time\n')
    L.append(_table(stats['time.source'], n_ok, 'source of total'))
    L.append('\nweeknight (total <= 30 min):\n')
    L.append(_table(stats['weeknight'], n_ok, 'value'))
    L.append('\n## Undeterminable, with reasons\n')
    L.append('Recipes with no equipment found:\n')
    L.append(_table(stats['no_equipment'], n_ok, 'reason'))
    for k in ('equipment', 'time', 'diet'):
        L.append(f'\n{k} undeterminable:\n')
        L.append(_table(stats[f'undet.{k}'], n_ok, 'reason'))
        L.append('')
        L.append(_table(stats[f'undet.{k}.by_source'], n_ok, 'source'))
    with open(COVERAGE, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(L) + '\n')


if __name__ == '__main__':
    sys.exit(main())
