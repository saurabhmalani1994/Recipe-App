"""Per-recipe checks and small derivations the corpus build needs before tagging.

drop_reason(raw)      the reason a raw record cannot enter corpus.db, or None. Only structural
                      drops, ruling R10 (with R17's Food Wishes exception) and R16 live here;
                      dedupe and the quality cut are S8's.
is_israeli(...)       R16: the record presents as Israeli cuisine (label, title or tags).
names_lost(lines)     True when an openrecipes record's ingredient names were lost in the source
                      ("2 cups 2 cups": the amount was written twice and the name dropped).
parse_servings(text)  integer servings from a yield string, or None when it is not a head count.
quality_score(...)    a 0..1 score from completeness and rating, stored on every recipe of a
                      build without a selection (the 5k sample). A build from a curation
                      selection (build_corpus --select) stores ingest/curate/score.py's score.
"""
import re

# Drop reasons, in the order they are checked. Every one is counted by the build (rule 11).
DROP_REASONS = (
    'bad_json',             # the line is not a JSON object
    'no_id',                # the record has no id
    'duplicate_id',         # the id was already written earlier in this source
    'no_title',             # empty or missing title
    'no_ingredients',       # no ingredient lines (schema/raw_recipe.md flags these)
    'no_steps',             # R10: a recipe without steps cannot be cooked (R17: a Food Wishes
                            # recipe with a video_url is kept; its method is the video)
    'excluded_israeli',     # R16 (D19): labelled Israeli, or "Israeli" in the title or tags
    'ingredient_names_lost',  # R10: openrecipes lines like "2 cups 2 cups"
    'tag_error',            # the parser or a tagger raised; the message is logged
    'tag_timeout',          # tagging took longer than the per-recipe limit
    'selection_mismatch',   # a selected line no longer holds the selected id (the raw file changed)
    # Curation (brief S8, ingest/curate/rank.py), counted when the build reads a selection:
    'curate_junk_ad_or_link',        # a link, "click here", "read more at", an ad
    'curate_junk_see_above',         # a component that lives in another recipe or a book page
    'curate_junk_title_is_ingredient',  # the whole title is one raw ingredient ("Chicken")
    'curate_junk_bad_title',         # over 120 characters, or under 3 letters
    'curate_duplicate',              # a near-duplicate of a better copy (same title, slug Jaccard >= 0.8)
    'curate_below_cut',              # passed everything, ranked below the selection
    'curate_excluded_source',        # R11: a source the selection never takes (foodcom, S8b)
)

_DOUBLED_RE = re.compile(r'^\s*(.+?)\s+\1\s*$')
NAMES_LOST_SHARE = 0.5


def _line_doubled(line):
    return bool(_DOUBLED_RE.match(line or ''))


def names_lost(lines):
    """At least half of the non-blank lines are an amount written twice with no name."""
    lines = [ln for ln in (lines or []) if ln and ln.strip()]
    if not lines:
        return False
    doubled = sum(1 for ln in lines if _line_doubled(ln))
    return doubled / len(lines) >= NAMES_LOST_SHARE


def _nonblank(xs):
    return [x for x in (xs or []) if isinstance(x, str) and x.strip()]


_ISRAELI_RE = re.compile(r'\bisrael(?:i)?\b', re.I)   # the fetchers' R16 check (fetch_sites.py)

# R17: the only source whose step-less recipes are kept, when they carry a video_url.
VIDEO_METHOD_SOURCES = ('foodwishes',)


def is_israeli(title=None, cuisine_label=None, tags=None):
    """R16 (D19): "Israeli" (or "Israel") in the cuisine label, the title or a tag. Taken as the
    ruling words it: an "israeli couscous" tag counts too."""
    tags = [t for t in (tags or []) if isinstance(t, str)] if isinstance(tags, list) else []
    hay = ' '.join(x for x in [title, cuisine_label] + tags if isinstance(x, str))
    return bool(_ISRAELI_RE.search(hay))


def video_method(raw):
    """R17: a step-less recipe whose method is a video (Food Wishes, with a video_url)."""
    return raw.get('source') in VIDEO_METHOD_SOURCES and bool(raw.get('video_url'))


def drop_reason(raw):
    """Why `raw` cannot enter corpus.db (one of DROP_REASONS), or None. Does not check
    duplicates or tagging, which need the build's state. A Food Wishes record gets its
    video_url from ingest/build/video.py before this runs (R17)."""
    if not isinstance(raw, dict):
        return 'bad_json'
    if not raw.get('id'):
        return 'no_id'
    if not (raw.get('title') or '').strip():
        return 'no_title'
    if not _nonblank(raw.get('ingredients')):
        return 'no_ingredients'
    if not _nonblank(raw.get('steps')) and not video_method(raw):
        return 'no_steps'
    if is_israeli(raw.get('title'), raw.get('cuisine_label'), raw.get('tags')):
        return 'excluded_israeli'
    if raw.get('source') == 'openrecipes' and names_lost(raw.get('ingredients')):
        return 'ingredient_names_lost'
    return None


_NUM = r'(\d+(?:\.\d+)?)'
_SERVES_RE = [
    re.compile(rf'\b(?:serves|serving|servings|feeds|portions?|for)\s*:?\s*(?:about\s+|up to\s+)?{_NUM}'
               rf'(?:\s*(?:-|–|to|or)\s*{_NUM})?', re.I),
    re.compile(rf'^\s*{_NUM}(?:\s*(?:-|–|to|or)\s*{_NUM})?\s*(?:servings?|serves|portions?|people|persons?)\b',
               re.I),
    re.compile(rf'^\s*{_NUM}\s*$'),
]
MAX_SERVINGS = 100


def parse_servings(text):
    """Servings from a yield string: "Serves 4" -> 4, "4-6 servings" -> 4 (the low end, so a
    scaled recipe never comes out short), "8" -> 8. "Makes 12 muffins" is a yield, not a head
    count, and gives None; yield_text keeps it."""
    if not text:
        return None
    text = str(text)
    for rx in _SERVES_RE:
        m = rx.search(text)
        if m:
            v = float(m.group(1))
            if 0 < v <= MAX_SERVINGS:
                return int(v) if v >= 1 else 1
            return None
    return None


RATING_PRIOR = 0.7   # a source rating is shrunk toward this share of the scale
RATING_WEIGHT = 5    # ... with the weight of this many ratings
RATING_SCALE = 5.0   # every rated source in raw/ uses a 5-point scale


def quality_score(resolved_share, has_image, has_time, has_servings, rating=None, rating_count=None):
    """0..1, three decimals. Weights: 0.4 share of ingredient lines resolved to a slug, 0.1 each
    for an image, a time and a servings figure, 0.3 the rating term. The rating term is a
    Bayesian average of rating/5 shrunk toward 0.7 with the weight of 5 ratings, and 0.5 when the
    source has no rating (so an unrated recipe is not ranked below a poorly rated one)."""
    if rating is not None and rating_count:
        r = max(0.0, min(1.0, float(rating) / RATING_SCALE))
        n = max(0, int(rating_count))
        term = (RATING_PRIOR * RATING_WEIGHT + r * n) / (RATING_WEIGHT + n)
    else:
        term = 0.5
    s = (0.4 * max(0.0, min(1.0, resolved_share)) + 0.1 * bool(has_image) + 0.1 * bool(has_time)
         + 0.1 * bool(has_servings) + 0.3 * term)
    return round(s, 3)
