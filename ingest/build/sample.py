"""Deterministic, streamed per-source selection of raw recipe lines for a corpus build.

A source is read once to count its lines, then once more to yield every `stride`-th line
(stride = lines // quota) until `quota` lines are taken, so a sample spans the whole file instead
of its head. `quota=None` takes every line. Only the first `limit` lines are ever read, where
`limit` is the line count taken when the source was first opened; a source that is still being
fetched (bbcgoodfood grows while its crawler runs) therefore yields the same lines on a resumed
build. Nothing is held in memory beyond the current line.
"""
import os

RAW = os.environ.get('RECIPE_RAW_DATA_ROOT', '/home/user/recipe-data/raw')

# The 5k sample (brief S9a #3). Weighted toward the big open datasets, since the curated corpus
# will be mostly recipenlg and openrecipes; the small scraped sources are over-represented so each
# is exercised; hf_cuisine_type carries no steps, so its share exists to prove the R10 drop path.
SAMPLE_QUOTAS = {
    'recipenlg': 2100,
    'openrecipes': 1100,
    'bbcgoodfood': 600,
    'foodcom': 450,
    'themealdb': 350,
    'foodwishes': 243,
    'hf_cuisine_type': 150,
    'github_openrecipe': 2,
    'github_recipegen': 5,
}


def raw_path(source, raw_root=RAW):
    return os.path.join(raw_root, source, 'recipes.jsonl')


def sources(raw_root=RAW):
    """Every source directory with a recipes.jsonl, sorted (the build order)."""
    if not os.path.isdir(raw_root):
        return []
    return sorted(d for d in os.listdir(raw_root) if os.path.exists(raw_path(d, raw_root)))


def count_lines(path):
    n = 0
    with open(path, 'rb') as fh:
        for _ in fh:
            n += 1
    return n


def stride_for(limit, quota):
    if quota is None or quota >= limit:
        return 1
    return max(1, limit // quota)


def load_selection(path):
    """A curation selection (ingest/curate/rank.py selection.tsv) as
    {source: {line_no: {'key', 'quality', 'rating', 'rating_count'}}}."""
    out = {}
    with open(path, encoding='utf-8') as fh:
        head = next(fh).rstrip('\n').split('\t')
        for row in fh:
            r = dict(zip(head, row.rstrip('\n').split('\t')))
            out.setdefault(r['source'], {})[int(r['line'])] = {
                'key': r['key'], 'quality': float(r['quality']),
                'rating': float(r['rating']) if r['rating'] else None,
                'rating_count': int(r['rating_count']) if r['rating_count'] else None}
    return out


def select_lines(path, limit, lines, start=0):
    """Yield (line_no, text) for the line numbers in `lines` (a set), in file order, from `start`
    and below `limit`. Streams the file; nothing else is held."""
    if not lines:
        return
    last = max(lines)
    with open(path, encoding='utf-8', errors='replace') as fh:
        for n, line in enumerate(fh):
            if n >= limit or n > last:
                break
            if n >= start and n in lines:
                yield n, line


def select(path, limit, quota, start=0):
    """Yield (line_no, text) for the selected lines of `path`, line_no counted from 0.

    `start` skips every line before it (a resumed build passes the line after the last one it
    committed). The selection itself does not depend on `start`, so a resume yields exactly the
    lines a clean run would have yielded from that point on."""
    step = stride_for(limit, quota)
    cap = limit if quota is None else min(limit, quota * step)
    taken_before = 0 if start <= 0 else (start + step - 1) // step
    taken = taken_before
    with open(path, encoding='utf-8', errors='replace') as fh:
        for n, line in enumerate(fh):
            if n >= cap or (quota is not None and taken >= quota):
                break
            if n < start or n % step:
                continue
            taken += 1
            yield n, line
