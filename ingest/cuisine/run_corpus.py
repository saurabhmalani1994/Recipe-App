"""Run the trained classifier over a sample of the raw corpus (brief S5b #5) and report the
label distribution and the unknown rate, by source. Writes run_report.json next to this file.

Sampling: every Nth recipe within each source's own recipes.jsonl (file order), so the sample
spans the whole file instead of just its head, stopping once TOTAL_TARGET rows are read across
all sources. `corpus.db` and any diet/equipment fields are out of scope for this slice (brief);
this reads the raw per-source jsonl directly.

Usage:
  python3 -m ingest.cuisine.run_corpus
"""
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine.classifier import classify, load_model  # noqa: E402

RAW_ROOT = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')
OUT_PATH = os.path.join(HERE, 'run_report.json')
TOTAL_TARGET = 20_000
# Every source with a recipes.jsonl from S1, weighted roughly by how much of the corpus it is
# (recipenlg and openrecipes dominate the real corpus; themealdb/bbcgoodfood/foodwishes are
# tiny and sampled in full instead of a fraction of ~0).
SOURCE_QUOTAS = {
    'recipenlg': 10_000, 'openrecipes': 6_000, 'foodcom': 1_228, 'bbcgoodfood': 1_200,
    'themealdb': 790, 'foodwishes': 300, 'github_openrecipe': 2, 'github_recipegen': 5,
}


def iter_every_nth(path, quota):
    """Yield up to `quota` records, spread evenly across the file (every Nth line)."""
    total = 0
    with open(path, encoding='utf-8') as fh:
        for _ in fh:
            total += 1
    if total == 0:
        return
    step = max(1, total // quota)
    n = kept = 0
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            if kept >= quota:
                break
            if n % step == 0:
                line = line.strip()
                if line:
                    try:
                        yield json.loads(line)
                        kept += 1
                    except json.JSONDecodeError:
                        pass
            n += 1


def run(raw_root=RAW_ROOT, quotas=SOURCE_QUOTAS, total_target=TOTAL_TARGET):
    model = load_model()
    by_source = {}
    overall = Counter()
    remaining = total_target
    for source, quota in quotas.items():
        if remaining <= 0:
            break
        quota = min(quota, remaining)
        path = os.path.join(raw_root, source, 'recipes.jsonl')
        if not os.path.exists(path):
            by_source[source] = {'n': 0, 'error': 'file missing'}
            continue
        labels = Counter()
        n = unknown = 0
        for rec in iter_every_nth(path, quota):
            result = classify(rec.get('ingredients'), rec.get('title'), model)
            labels[result['label']] += 1
            overall[result['label']] += 1
            n += 1
            if result['label'] == 'unknown':
                unknown += 1
        remaining -= n
        by_source[source] = {
            'n': n, 'unknown': unknown,
            'unknown_rate': round(unknown / n, 4) if n else None,
            'labels': dict(labels.most_common()),
        }
    total_n = sum(v['n'] for v in by_source.values())
    return {
        'total_recipes': total_n,
        'label_distribution': dict(overall.most_common()),
        'unknown_rate_overall': round(overall.get('unknown', 0) / total_n, 4) if total_n else None,
        'by_source': by_source,
    }


def main(argv):
    report = run()
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=2)
    print(f"classified {report['total_recipes']} recipes -> {OUT_PATH}")
    print(f"overall unknown rate: {report['unknown_rate_overall']:.1%}")
    print('label distribution:')
    for label, n in report['label_distribution'].items():
        print(f'  {label:22s} {n}')
    print('unknown rate by source:')
    for source, v in report['by_source'].items():
        rate = v.get('unknown_rate')
        print(f"  {source:20s} n={v['n']:<7} unknown={rate if rate is not None else 'n/a'}")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
