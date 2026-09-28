"""Near-duplicate clustering (brief S8 #2).

Two recipes are the same dish when their normalized titles are equal (features.norm_title:
lowercased, singular, filler words like "easy" and "best" removed) and their ingredient slug
sets have Jaccard similarity >= JACCARD. Within one title, recipes are visited best first and
each joins the first cluster whose leader (its best member) it matches, else starts a new one
(leader clustering: deterministic, and every member is within the threshold of its leader).
An empty normalized title never clusters.

cluster(records, base) -> {key: (cluster id, cluster size, is_leader)}. `base` gives each
record's ranking score; ties break on the key.
"""
from collections import defaultdict

JACCARD = 0.8


def jaccard(a, b):
    if not a and not b:
        return 1.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


def cluster_group(members):
    """members: [(sort key, key, frozenset slugs)] of one title, any order. Returns
    [[key, ...], ...], each cluster best first, clusters in leader order."""
    members = sorted(members)
    clusters = []   # [(leader slugs, [keys])]
    exact = {}      # slug set -> cluster index, a shortcut for identical sets
    for _, key, fs in members:
        idx = exact.get(fs)
        if idx is None:
            n = len(fs)
            for i, (lead, keys) in enumerate(clusters):
                m = len(lead)
                # Jaccard >= t needs min/max size >= t; skip the set work when it cannot hold
                if n and m and min(n, m) < JACCARD * max(n, m):
                    continue
                if jaccard(fs, lead) >= JACCARD:
                    idx = i
                    break
        if idx is None:
            clusters.append((fs, [key]))
            exact.setdefault(fs, len(clusters) - 1)
        else:
            clusters[idx][1].append(key)
    return [keys for _, keys in clusters]


def cluster(records, base):
    """records: iterable of (key, normalized title, slugs). base: {key: score}."""
    groups = defaultdict(list)
    out = {}
    cid = 0
    for key, ntitle, slugs in records:
        if not ntitle:
            out[key] = (cid, 1, True)
            cid += 1
            continue
        groups[ntitle].append((-base[key], key, frozenset(slugs)))
    for ntitle in sorted(groups):
        for keys in cluster_group(groups[ntitle]):
            for i, k in enumerate(keys):
                out[k] = (cid, len(keys), i == 0)
            cid += 1
    return out
