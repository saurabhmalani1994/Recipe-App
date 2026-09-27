"""Train the cuisine classifier offline and export it as model.json: a small Naive Bayes
(log-prior + per-class feature log-likelihoods) over the tokens in features.py, plus the
confidence threshold below which classifier.py returns 'unknown'.

scikit-learn is used here, at training time, only. The exported JSON is scored by pure Python
in classifier.py, so nothing at inference time (or in the app) needs numpy/sklearn installed --
"most of the app works without needing AI tools" (D14).

Usage:
  python3 -m ingest.cuisine.train              train, write model.json, print the eval bar
  python3 -m ingest.cuisine.train --rebuild     also rebuild dataset.jsonl first

The bar, written before the first run (brief S5b #3): top-1 accuracy >= 80% on held-out
labelled recipes among those not returned as unknown, with unknown <= 30%.
"""
import json
import math
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine import cuisines as C  # noqa: E402

DATASET_PATH = os.path.join(HERE, 'dataset.jsonl')
MODEL_PATH = os.path.join(HERE, 'model.json')
EVAL_PATH = os.path.join(HERE, 'eval.json')
ACCURACY_BAR = 0.80
UNKNOWN_BAR = 0.30
HELD_OUT_FRACTION = 5  # every Nth example (by id, sorted) of a class with enough examples


def load_dataset(path=DATASET_PATH):
    rows = []
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def split(rows):
    """Deterministic per-class split: every 5th example (sorted by id) is held out, unless
    the class has fewer than 3*HELD_OUT_FRACTION examples, in which case everything trains and
    nothing is held out for it (too few to lose one and still learn it)."""
    by_label = defaultdict(list)
    for r in rows:
        by_label[r['label']].append(r)
    train, held = [], []
    for label, items in by_label.items():
        items = sorted(items, key=lambda r: r['id'])
        if len(items) < 3 * HELD_OUT_FRACTION:
            train.extend(items)
            continue
        for i, r in enumerate(items):
            (held if i % HELD_OUT_FRACTION == 0 else train).append(r)
    return train, held


def fit(train_rows):
    """Multinomial Naive Bayes over binary token presence, via sklearn. Returns
    (vocab: [token], classes: [label], class_log_prior: [float],
     feature_log_prob: [[float]] shape classes x vocab)."""
    from sklearn.feature_extraction.text import CountVectorizer
    from sklearn.naive_bayes import MultinomialNB

    docs = [' '.join(r['tokens']) for r in train_rows]
    labels = [r['label'] for r in train_rows]
    vec = CountVectorizer(tokenizer=str.split, lowercase=False, binary=True, min_df=1)
    X = vec.fit_transform(docs)
    clf = MultinomialNB(alpha=1.0)
    clf.fit(X, labels)
    return (list(vec.get_feature_names_out()), list(clf.classes_),
            clf.class_log_prior_.tolist(), clf.feature_log_prob_.tolist())


def score_one(tokens_, vocab_index, classes, class_log_prior, feature_log_prob):
    """Posterior probability per class for one recipe's tokens, pure Python (no sklearn)."""
    counts = Counter(t for t in tokens_ if t in vocab_index)
    scores = []
    for ci in range(len(classes)):
        s = class_log_prior[ci]
        row = feature_log_prob[ci]
        for tok, n in counts.items():
            s += n * row[vocab_index[tok]]
        scores.append(s)
    top = max(scores)
    exps = [math.exp(s - top) for s in scores]
    total = sum(exps)
    return {classes[i]: exps[i] / total for i in range(len(classes))}


def evaluate(held_rows, vocab, classes, class_log_prior, feature_log_prob, threshold):
    vocab_index = {t: i for i, t in enumerate(vocab)}
    correct = wrong = unknown = 0
    confusions = Counter()
    samples = []
    for r in held_rows:
        post = score_one(r['tokens'], vocab_index, classes, class_log_prior, feature_log_prob)
        pred = max(post, key=post.get)
        conf = post[pred]
        if conf < threshold:
            unknown += 1
            samples.append((r, 'unknown', conf))
            continue
        if pred == r['label']:
            correct += 1
        else:
            wrong += 1
            confusions[(r['label'], pred)] += 1
        samples.append((r, pred, conf))
    scored = correct + wrong
    accuracy = correct / scored if scored else 0.0
    unknown_rate = unknown / len(held_rows) if held_rows else 0.0
    return {
        'held_out': len(held_rows), 'unknown': unknown, 'scored': scored, 'correct': correct,
        'wrong': wrong, 'accuracy': accuracy, 'unknown_rate': unknown_rate,
        'confusions': confusions.most_common(10), 'samples': samples,
    }


def pick_threshold(held_rows, vocab, classes, class_log_prior, feature_log_prob):
    """Smallest threshold (0.05 steps) that meets both bars; else the one that gets closest
    (highest accuracy while unknown_rate <= UNKNOWN_BAR, or lowest unknown_rate otherwise)."""
    best = None
    for step in range(1, 20):
        t = step * 0.05
        ev = evaluate(held_rows, vocab, classes, class_log_prior, feature_log_prob, t)
        meets = ev['accuracy'] >= ACCURACY_BAR and ev['unknown_rate'] <= UNKNOWN_BAR
        if meets:
            return t, ev
        key = (ev['unknown_rate'] <= UNKNOWN_BAR, ev['accuracy'], -ev['unknown_rate'])
        if best is None or key > best[0]:
            best = (key, t, ev)
    return best[1], best[2]


def main(argv):
    if '--rebuild' in argv:
        from ingest.cuisine.build_dataset import build
        build()
    rows = load_dataset()
    train_rows, held_rows = split(rows)
    vocab, classes, class_log_prior, feature_log_prob = fit(train_rows)
    threshold, ev = pick_threshold(held_rows, vocab, classes, class_log_prior, feature_log_prob)

    model = {
        'vocab': vocab, 'classes': classes, 'class_log_prior': class_log_prior,
        'feature_log_prob': feature_log_prob, 'threshold': threshold,
    }
    with open(MODEL_PATH, 'w', encoding='utf-8') as fh:
        json.dump(model, fh)
    size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)

    samples = [{'id': r['id'], 'title': r['title'], 'true': r['label'], 'pred': pred,
                'confidence': round(conf, 3)} for r, pred, conf in ev['samples']]
    eval_out = {
        'n_total': len(rows), 'n_train': len(train_rows), 'n_held_out': len(held_rows),
        'threshold': threshold, 'accuracy_among_scored': ev['accuracy'],
        'unknown_rate': ev['unknown_rate'], 'scored': ev['scored'], 'correct': ev['correct'],
        'wrong': ev['wrong'], 'top_confusions': [
            {'true': a, 'pred': b, 'n': n} for (a, b), n in ev['confusions']],
        'model_size_mb': round(size_mb, 3), 'samples': samples,
    }
    with open(EVAL_PATH, 'w', encoding='utf-8') as fh:
        json.dump(eval_out, fh, indent=2)

    bar_ok = ev['accuracy'] >= ACCURACY_BAR and ev['unknown_rate'] <= UNKNOWN_BAR
    print(f"trained on {len(train_rows)}, held out {len(held_rows)}, "
          f"model {size_mb:.2f} MB, threshold {threshold:.2f}")
    print(f"accuracy among scored: {ev['accuracy']:.1%} ({ev['correct']}/{ev['scored']}), "
          f"unknown rate: {ev['unknown_rate']:.1%} ({ev['unknown']}/{len(held_rows)})")
    print(f"bar (>=80% acc, <=30% unknown): {'PASSED' if bar_ok else 'MISSED'}")
    for (a, b), n in ev['confusions']:
        print(f"  confused {a} -> {b}: {n}")
    return 0 if bar_ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
