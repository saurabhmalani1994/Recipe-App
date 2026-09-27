"""Feature extraction shared by training (dataset.py/train.py) and inference (classifier.py):
turn a recipe's raw ingredient lines and title into the same token set either side of training,
so the model file and this module never drift apart.

Two token families, kept in one namespace so a single bag-of-words model can score them
together:
  slug:<canonical ingredient slug>   from ingest.parse.parser over each ingredient line
  word:<title token>                 lowercased, punctuation-stripped, stopword-filtered
"""
import os
import re
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
from ingest.parse.parser import parse_line  # noqa: E402

_WORD_RE = re.compile(r"[a-z']+")
# Generic recipe/course words that name no cuisine on their own; keeping them out of the
# vocabulary avoids them soaking up weight that belongs to actual cuisine words.
_STOPWORDS = {
    'a', 'an', 'the', 'and', 'or', 'with', 'in', 'of', 'for', 'style', 'recipe', 'recipes',
    'easy', 'quick', 'best', 'homemade', 'classic', 'traditional', 'authentic', 'simple',
    'delicious', 'perfect', 'ii', 'iii', 'i', 'to', 'on', 'my', 'no', 'bake', 'baked', 'roast',
    'roasted', 'grilled', 'fried', 'sauce', 'salad', 'soup', 'stew', 'cake', 'pie', 'bread',
}


def ingredient_slugs(ingredient_lines):
    """Deduplicated canonical slugs the parser resolves out of a recipe's ingredient lines."""
    slugs = []
    seen = set()
    for line in ingredient_lines or []:
        try:
            items = parse_line(line)
        except Exception:  # noqa: BLE001 -- a parser bug must never take the classifier down
            items = []
        for it in items:
            slug = it.get('slug')
            if slug and slug not in seen:
                seen.add(slug)
                slugs.append(slug)
    return slugs


def title_words(title, exclude_words=None):
    """Deduplicated, stopword-filtered lowercase word tokens from a recipe title.
    `exclude_words`, if given, is a set of additional lowercase words to drop -- used to strip
    a silver label's own marker words out of the features of the row it labelled, so the
    model can't just learn "the word that produced the label predicts the label"
    (brief S5b-2 #2, no leakage)."""
    exclude = exclude_words or ()
    words = []
    seen = set()
    for w in _WORD_RE.findall((title or '').lower()):
        if len(w) < 3 or w in _STOPWORDS or w in seen or w in exclude:
            continue
        seen.add(w)
        words.append(w)
    return words


def tokens(ingredient_lines, title, exclude_words=None):
    """The full feature token list for one recipe: slug:* then word:* tokens. See
    `title_words` for `exclude_words`."""
    return [f'slug:{s}' for s in ingredient_slugs(ingredient_lines)] + \
           [f'word:{w}' for w in title_words(title, exclude_words)]
