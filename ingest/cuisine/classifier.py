"""Deterministic cuisine classifier: scores a recipe's ingredient lines + title against
model.json (a Naive Bayes trained offline by train.py) and returns the top canonical label
with its confidence, or 'unknown' below the trained threshold.

Pure Python at inference time -- no numpy/sklearn import here -- so it runs anywhere the app
does (D14: "most of the app to work without needing AI tools"; this is not an AI tool call,
it is a lookup against a ~1MB trained table).

Usage:
  python3 -m ingest.cuisine.classifier "Chicken Tikka Masala" "1 lb chicken thigh" "2 tbsp garam masala"
"""
import json
import math
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
from ingest.cuisine.features import tokens  # noqa: E402

MODEL_PATH = os.path.join(HERE, 'model.json')
UNKNOWN = 'unknown'

_MODEL_CACHE = {}


def load_model(path=MODEL_PATH):
    key = os.path.abspath(path)
    if key not in _MODEL_CACHE:
        with open(path, encoding='utf-8') as fh:
            model = json.load(fh)
        model['_vocab_index'] = {t: i for i, t in enumerate(model['vocab'])}
        _MODEL_CACHE[key] = model
    return _MODEL_CACHE[key]


def _posterior(model, toks):
    counts = Counter(t for t in toks if t in model['_vocab_index'])
    classes = model['classes']
    prior = model['class_log_prior']
    flp = model['feature_log_prob']
    vidx = model['_vocab_index']
    scores = []
    for ci in range(len(classes)):
        s = prior[ci]
        row = flp[ci]
        for tok in counts:  # binary presence, matching train.py's binary=True vectorizer
            s += row[vidx[tok]]
        scores.append(s)
    top = max(scores)
    exps = [math.exp(s - top) for s in scores]
    total = sum(exps)
    return {classes[i]: exps[i] / total for i in range(len(classes))}


def classify_tokens(toks, model=None):
    """{'label': ..., 'confidence': ...} from an already-tokenized recipe (features.tokens)."""
    model = model or load_model()
    if not toks:
        return {'label': UNKNOWN, 'confidence': 0.0}
    post = _posterior(model, toks)
    label = max(post, key=post.get)
    conf = post[label]
    if conf < model['threshold']:
        return {'label': UNKNOWN, 'confidence': conf}
    return {'label': label, 'confidence': conf}


def classify(ingredient_lines, title, model=None):
    """{'label': ..., 'confidence': ...} for a recipe given its raw ingredient lines + title.
    Returns label='unknown' when the top posterior is below the trained threshold, rather
    than guessing (brief S5b #2)."""
    return classify_tokens(tokens(ingredient_lines, title), model)


def main(argv):
    if len(argv) < 1:
        print('usage: classifier.py TITLE [INGREDIENT_LINE ...]')
        return 1
    title, lines = argv[0], argv[1:]
    result = classify(lines, title)
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
