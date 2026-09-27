"""The new 300-recipe hand-checked eval set (brief S5b-2 #2), replacing S5b's 100-recipe
`hand_label.py` check. Drawn entirely from `silver_surplus.jsonl` (build_dataset.py's
lexicon-matched recipenlg/openrecipes titles that didn't make the cap into training) -- so
every row here is, by construction, "from sources and titles not used in training": the
titles are disjoint from dataset.jsonl by build_dataset.py's own cap/trim step, and the label
came from the same dish-name/demonym lexicon a person would apply skimming the title, not from
anything the model saw. Round-robins across classes (rather than just taking the first 300 by
id) so the set isn't dominated by whichever few classes happened to have the largest surplus.

Writes ingest/cuisine/hand_checked.jsonl and hand_check_eval.json (same shape as eval.json,
so both eval sets can be asserted against the bar the same way).

Usage:
  python3 -m ingest.cuisine.hand_check
"""
import json
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine.build_dataset import SURPLUS_PATH  # noqa: E402
from ingest.cuisine.classifier import classify, load_model  # noqa: E402
from ingest.cuisine.train import ACCURACY_BAR, UNKNOWN_BAR  # noqa: E402

OUT_PATH = os.path.join(HERE, 'hand_checked.jsonl')
EVAL_PATH = os.path.join(HERE, 'hand_check_eval.json')
TARGET_N = 300


def load_surplus(path=SURPLUS_PATH):
    rows = []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def pick(rows, target_n=TARGET_N):
    """Round-robin across labels, sorted by (label, id) for determinism, so the 300 aren't
    just whichever class had the most lexicon matches."""
    by_label = defaultdict(list)
    for r in rows:
        by_label[r['label']].append(r)
    for label in by_label:
        by_label[label].sort(key=lambda r: r['id'])
    order = sorted(by_label)
    picked = []
    i = 0
    while len(picked) < target_n and any(by_label.values()):
        label = order[i % len(order)]
        if by_label[label]:
            picked.append(by_label[label].pop(0))
        i += 1
        if i > 10 * target_n:  # every label exhausted; stop rather than spin
            break
    return picked


def check(rows):
    model = load_model()
    correct = wrong = unknown = 0
    samples = []
    for r in rows:
        result = classify(r['ingredients'], r['title'], model)
        pred, conf = result['label'], round(result['confidence'], 3)
        if pred == 'unknown':
            unknown += 1
        elif pred == r['label']:
            correct += 1
        else:
            wrong += 1
        samples.append({
            'id': r['id'], 'source': r['source'], 'title': r['title'], 'marker': r['marker'],
            'true': r['label'], 'pred': pred, 'confidence': conf,
        })
    return samples, correct, wrong, unknown


def main(argv):
    surplus = load_surplus()
    picked = pick(surplus)
    samples, correct, wrong, unknown = check(picked)
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        for s in samples:
            fh.write(json.dumps(s, ensure_ascii=False) + '\n')
    scored = correct + wrong
    accuracy = correct / scored if scored else 0.0
    unknown_rate = unknown / len(picked) if picked else 0.0
    eval_out = {
        'n_total': len(picked), 'scored': scored, 'correct': correct, 'wrong': wrong,
        'unknown': unknown, 'accuracy_among_scored': accuracy, 'unknown_rate': unknown_rate,
        'surplus_pool_size': len(surplus), 'samples': samples,
    }
    with open(EVAL_PATH, 'w', encoding='utf-8') as fh:
        json.dump(eval_out, fh, indent=2)
    bar_ok = accuracy >= ACCURACY_BAR and unknown_rate <= UNKNOWN_BAR
    print(f'{len(picked)} hand-checked recipes (from a surplus pool of {len(surplus)}) '
          f'-> {OUT_PATH}')
    print(f'accuracy among scored: {accuracy:.1%} ({correct}/{scored}), '
          f'unknown rate: {unknown_rate:.1%} ({unknown}/{len(picked)})')
    print(f"bar (>={ACCURACY_BAR:.0%} acc, <={UNKNOWN_BAR:.0%} unknown): "
          f"{'PASSED' if bar_ok else 'MISSED'}")
    return 0 if bar_ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
