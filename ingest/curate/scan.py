"""The curation scan: every raw line of every source -> one features record (brief S8 #6).

Runs the build's own drop checks and derivation (curate.drop_reason, build_corpus.derive) on
every line, so the ranking sees exactly the tags corpus.db will carry, and writes
ingest/curate/features.features() for each recipe that passes.

Sharded and resumable: each source is cut into SHARD-line shards; a shard is written to
<out>/<source>.<start>.jsonl.gz plus a .meta.json holding its drop counts, and a shard whose
meta exists is never redone. Line counts are pinned in <out>/manifest.json the first time a
source is seen (bbcgoodfood is still being appended to). Shards run on a process pool, in the
foreground, and the run stops handing out shards once `--budget` seconds would be exceeded,
so each invocation fits under a hard timeout; rerun until it prints "scan complete".

Every line is accounted for: meta counts lines, recipes written, and drops by reason with
the first example (rule 11); a per-recipe 5 s alarm turns a hung tagger into a counted
`tag_timeout`, an exception into `tag_error`.

Run: python3 -m ingest.curate.scan [--budget 520] [--workers 4] [--out DIR] [--refresh-grown]
     [--refresh SOURCE[,SOURCE]]
--refresh-grown drops the pinned count and every shard of a source whose raw file now has a
different line count (a crawl that has since appended), so the next run rescans it at its new
size; --refresh does the same for the named sources (a raw file rewritten at the same length, or
a change to the drop checks that only touches those sources). Both print what they dropped.
"""
import argparse
import gzip
import json
import os
import signal
import sys
import time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import curate  # noqa: E402
from ingest.build import sample as S  # noqa: E402
from ingest.build import video as VIDEO  # noqa: E402

OUT = '/home/user/recipe-data/derived/curate/scan'
SHARD = 20000
PER_RECIPE_TIMEOUT_S = 5
EST_SHARD_S = 150.0   # used until the first shard of this run finishes

_W = {}


class _Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise _Timeout()


def _init_worker(raw_root, ratings_path):
    from ingest.build.build_corpus import derive
    from ingest.cuisine.classifier import load_model
    from ingest.curate import features as F
    from ingest.fetch.fetch_foodcom_ratings import load as load_ratings
    _W.update(raw_root=raw_root, derive=derive, model=load_model(), F=F,
              ratings=load_ratings(ratings_path) if ratings_path else load_ratings())
    signal.signal(signal.SIGALRM, _alarm)


def shard_paths(out, source, start):
    base = os.path.join(out, f'{source}.{start:08d}')
    return base + '.jsonl.gz', base + '.meta.json'


def scan_lines(lines, derive, model, F, ratings, drops, raw_root=S.RAW):
    """Yield features records for (line_no, text) pairs; count every drop into `drops`
    ({reason: [count, first example]})."""
    for n, line in lines:
        try:
            raw = json.loads(line)
        except ValueError:
            raw = None
        VIDEO.attach(raw, raw_root)   # R17, as the build does
        reason = curate.drop_reason(raw)
        ex = (raw or {}).get('id') if isinstance(raw, dict) else f'line {n}'
        if reason:
            _count(drops, reason, ex)
            continue
        signal.alarm(PER_RECIPE_TIMEOUT_S)
        try:
            rec = F.features(raw, derive(raw, model), ratings)
        except _Timeout:
            _count(drops, 'tag_timeout', ex)
            continue
        except Exception as e:  # counted with the message, never silent
            _count(drops, 'tag_error', f'{ex}: {type(e).__name__}: {e}'[:200])
            continue
        finally:
            signal.alarm(0)
        rec['line'] = n
        yield rec


def _count(drops, reason, ex):
    if reason in drops:
        drops[reason][0] += 1
    else:
        drops[reason] = [1, str(ex)]


def run_shard(task):
    source, start, end, offset, out = task
    t0 = time.time()
    data, meta = shard_paths(out, source, start)
    path = S.raw_path(source, _W['raw_root'])
    drops = {}
    written = 0

    def lines():
        with open(path, 'rb') as fh:
            fh.seek(offset)
            n = start
            for b in fh:
                if n >= end:
                    break
                yield n, b.decode('utf-8', errors='replace')
                n += 1

    tmp = data + '.part'
    with gzip.open(tmp, 'wt', encoding='utf-8', compresslevel=1) as fh:
        for rec in scan_lines(lines(), _W['derive'], _W['model'], _W['F'], _W['ratings'], drops, _W['raw_root']):
            fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n')
            written += 1
    os.replace(tmp, data)
    m = {'source': source, 'start': start, 'end': end, 'lines': end - start, 'written': written,
         'drops': drops, 'seconds': round(time.time() - t0, 1)}
    with open(meta + '.part', 'w', encoding='utf-8') as fh:
        json.dump(m, fh, sort_keys=True)
    os.replace(meta + '.part', meta)
    return m


def manifest(out, raw_root, shard=SHARD):
    path = os.path.join(out, 'manifest.json')
    man = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            man = json.load(fh)
    changed = False
    for src in S.sources(raw_root):
        if src not in man:
            man[src] = count_with_offsets(S.raw_path(src, raw_root), shard)
            changed = True
    if changed:
        with open(path + '.part', 'w', encoding='utf-8') as fh:
            json.dump(man, fh, sort_keys=True, indent=1)
        os.replace(path + '.part', path)
    return man


def count_with_offsets(path, shard=SHARD):
    """{'lines': n, 'shard': shard, 'offsets': [byte offset of line 0, shard, 2*shard, ...]}."""
    offsets = []
    n = pos = 0
    with open(path, 'rb') as fh:
        for b in fh:
            if n % shard == 0:
                offsets.append(pos)
            pos += len(b)
            n += 1
    return {'lines': n, 'shard': shard, 'offsets': offsets}


def refresh(out, raw_root, sources=None, grown=False, log=print):
    """Forget the named sources, and with `grown` every source whose raw line count changed:
    their manifest entries and shard files go, so run() rescans them. Returns
    {source: (pinned lines, lines now)}."""
    path = os.path.join(out, 'manifest.json')
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as fh:
        man = json.load(fh)
    now = {}
    todo = set(sources or ())
    for src in sorted(man):
        p = S.raw_path(src, raw_root)
        if grown or src in todo:
            now[src] = S.count_lines(p) if os.path.exists(p) else 0
        if grown and now[src] != man[src]['lines']:
            todo.add(src)
    dropped = {}
    for src in sorted(todo & set(man)):
        m = man.pop(src)
        for i in range(len(m['offsets'])):
            for f in shard_paths(out, src, i * m['shard']):
                if os.path.exists(f):
                    os.remove(f)
        dropped[src] = (m['lines'], now.get(src))
        log(f'refresh: {src} pinned at {m["lines"]:,} lines, now {now.get(src, 0):,}; shards dropped', flush=True)
    with open(path + '.part', 'w', encoding='utf-8') as fh:
        json.dump(man, fh, sort_keys=True, indent=1)
    os.replace(path + '.part', path)
    return dropped


def all_shards(man, out):
    """[(source, start, end, byte offset, out)] for every shard, in (source, start) order."""
    tasks = []
    for src in sorted(man):
        m = man[src]
        for i, off in enumerate(m['offsets']):
            start = i * m['shard']
            tasks.append((src, start, min(m['lines'], start + m['shard']), off, out))
    return tasks


def pending(tasks):
    return [t for t in tasks if not os.path.exists(shard_paths(t[-1], t[0], t[1])[1])]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--raw', default=S.RAW)
    ap.add_argument('--ratings', default=None)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--budget', type=float, default=520.0, help='seconds; no shard starts that would overrun it')
    ap.add_argument('--refresh-grown', action='store_true', help='rescan every source whose line count changed')
    ap.add_argument('--refresh', default='', help='comma-separated sources to rescan')
    args = ap.parse_args(argv)
    if args.refresh_grown or args.refresh:
        refresh(args.out, args.raw, [x for x in args.refresh.split(',') if x], args.refresh_grown)
    run(args.out, args.raw, args.ratings, args.workers, args.budget)
    return 0


def run(out=OUT, raw=S.RAW, ratings=None, workers=4, budget=520.0, shard=SHARD, log=print):
    """Scan every pending shard that fits in `budget` seconds. Returns the number of shards left."""
    os.makedirs(out, exist_ok=True)
    man = manifest(out, raw, shard)
    tasks = all_shards(man, out)
    todo = pending(tasks)
    log(f'scan: {len(tasks)} shards, {len(tasks) - len(todo)} done, {len(todo)} to do, '
        f"{sum(m['lines'] for m in man.values()):,} lines", flush=True)
    if not todo:
        log('scan complete', flush=True)
        return 0
    t0 = time.time()
    est = EST_SHARD_S
    done = 0
    with Pool(workers, initializer=_init_worker, initargs=(raw, ratings)) as pool:
        inflight = []
        it = iter(todo)
        stop = False

        def submit():
            nonlocal stop
            if stop:
                return
            if time.time() - t0 + est > budget:
                stop = True
                return
            t = next(it, None)
            if t is None:
                stop = True
                return
            inflight.append(pool.apply_async(run_shard, (t,)))

        for _ in range(workers):
            submit()
        while inflight:
            inflight[0].wait()
            r = inflight.pop(0)
            m = r.get()
            done += 1
            est = max(est * 0.5 + m['seconds'] * 0.5, m['seconds']) if done == 1 else 0.7 * est + 0.3 * m['seconds']
            nd = sum(v[0] for v in m['drops'].values())
            log(f"  {m['source']} {m['start']:>8,}-{m['end']:>8,}: {m['written']:,} written, {nd:,} dropped, "
                f"{m['seconds']:.0f}s  [{len(tasks) - len(todo) + done}/{len(tasks)} shards, "
                f"{time.time() - t0:.0f}s]", flush=True)
            submit()
    left = len(pending(tasks))
    log(f'scan {"complete" if not left else "paused"}: {left} shards left, {time.time() - t0:.0f}s', flush=True)
    return left


def iter_records(out=OUT, fields=None):
    """Every features record of a finished scan, in (source, line) order."""
    man = json.load(open(os.path.join(out, 'manifest.json'), encoding='utf-8'))
    for src, start, *_ in all_shards(man, out):
        data, _meta = shard_paths(out, src, start)
        with gzip.open(data, 'rt', encoding='utf-8') as fh:
            for line in fh:
                rec = json.loads(line)
                yield rec if fields is None else {k: rec.get(k) for k in fields}


def iter_meta(out=OUT):
    man = json.load(open(os.path.join(out, 'manifest.json'), encoding='utf-8'))
    for src, start, *_ in all_shards(man, out):
        with open(shard_paths(out, src, start)[1], encoding='utf-8') as fh:
            yield json.load(fh)


if __name__ == '__main__':
    sys.exit(main())
