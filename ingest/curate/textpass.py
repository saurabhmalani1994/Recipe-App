"""Backfill the raw-text features (features.TEXT_FIELDS, brief S8b) onto a finished scan.

The S8 scan predates the style, shortcut and truncation fields. Rescanning means re-running
the tagger on 2.4M lines (about 50 minutes); these fields read only the raw text, so this pass
reads each source's pinned lines once (the scan manifest's line count, so a source that is
still being appended to gives the same lines) and writes, per source,
<out>/<source>.v<VERSION>.tsv.gz: line, style (joined by "|"), n_rich, n_short, trunc, n_frag.
A file whose version matches is reused; bump VERSION when text_features changes.

load(scan_dir, out) -> {(source, line): {field: value}}; rank.load merges it into any scan
record that lacks the fields (a scan made after S8b carries them itself).

Run: python3 -m ingest.curate.textpass [--scan DIR] [--out DIR]
"""
import argparse
import gzip
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(HERE))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.build import sample as S  # noqa: E402
from ingest.curate import features as F  # noqa: E402
from ingest.curate import scan as SC  # noqa: E402

OUT = '/home/user/recipe-data/derived/curate/text'
VERSION = 4


def path_for(out, source):
    return os.path.join(out, f'{source}.v{VERSION}.tsv.gz')


def run_source(source, n_lines, out, raw_root=S.RAW, log=print):
    """Write the text features of the first n_lines raw lines of `source`. Returns (written,
    unparsable)."""
    t0 = time.time()
    dest = path_for(out, source)
    tmp = dest + '.part'
    written = bad = 0
    with open(S.raw_path(source, raw_root), 'rb') as fh, gzip.open(tmp, 'wt', encoding='utf-8',
                                                                    compresslevel=1) as w:
        for n, b in enumerate(fh):
            if n >= n_lines:
                break
            try:
                raw = json.loads(b)
            except ValueError:
                bad += 1
                continue
            if not isinstance(raw, dict):
                bad += 1
                continue
            t = F.text_features(raw)
            w.write(f"{n}\t{'|'.join(t['style'])}\t{t['n_rich']}\t{t['n_short']}\t{t['trunc'] or ''}\t{t['n_frag']}\n")
            written += 1
            if n and n % 500_000 == 0:
                log(f'  {source} {n:,} lines ({time.time() - t0:.0f}s)', flush=True)
    os.replace(tmp, dest)
    log(f'textpass {source}: {written:,} written, {bad:,} unparsable ({time.time() - t0:.0f}s)', flush=True)
    return written, bad


def run(scan_dir=SC.OUT, out=OUT, raw_root=S.RAW, log=print):
    os.makedirs(out, exist_ok=True)
    man = json.load(open(os.path.join(scan_dir, 'manifest.json'), encoding='utf-8'))
    for src in sorted(man):
        if not os.path.exists(path_for(out, src)):
            run_source(src, man[src]['lines'], out, raw_root, log)


def load(scan_dir=SC.OUT, out=OUT, raw_root=S.RAW, log=print):
    """{(source, line): text features}, computing any source file that is missing."""
    run(scan_dir, out, raw_root, log)
    man = json.load(open(os.path.join(scan_dir, 'manifest.json'), encoding='utf-8'))
    got = {}
    intern = sys.intern
    for src in sorted(man):
        with gzip.open(path_for(out, src), 'rt', encoding='utf-8') as fh:
            for row in fh:
                n, style, rich, short, trunc, frag = row.rstrip('\n').split('\t')
                got[(src, int(n))] = {'style': tuple(intern(s) for s in style.split('|')) if style else (),
                                      'n_rich': int(rich), 'n_short': int(short),
                                      'trunc': intern(trunc) if trunc else None, 'n_frag': int(frag)}
    return got


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', default=SC.OUT)
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args(argv)
    run(args.scan, args.out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
