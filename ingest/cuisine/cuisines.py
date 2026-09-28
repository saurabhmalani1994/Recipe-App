"""Load and validate `cuisines.yaml`: the fixed canonical cuisine list and each source's
label map.

Usage:
  python3 -m ingest.cuisine.cuisines      summary line; exit 1 on any error
"""
import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
CUISINES_PATH = os.path.join(HERE, 'cuisines.yaml')
SITES_PATH = os.path.join(os.path.dirname(HERE), 'fetch', 'sites.yaml')

_CACHE = {}


def load(path=CUISINES_PATH):
    """Return the parsed yaml dict: {canonical, regional_sublabels, label_map}. Cached."""
    key = os.path.abspath(path)
    if key not in _CACHE:
        with open(path, encoding='utf-8') as fh:
            _CACHE[key] = yaml.safe_load(fh) or {}
    return _CACHE[key]


def canonical_labels(path=CUISINES_PATH):
    return list(load(path).get('canonical') or [])


def label_map(source, path=CUISINES_PATH):
    """{raw source label: canonical label} for one source. {} if the source has no map."""
    return dict((load(path).get('label_map') or {}).get(source) or {})


def site_ids(path=SITES_PATH):
    """{site id: its cuisine_label} for every entry of ingest/fetch/sites.yaml. Cached."""
    key = ('sites', os.path.abspath(path))
    if key not in _CACHE:
        with open(path, encoding='utf-8') as fh:
            data = yaml.safe_load(fh) or {}
        _CACHE[key] = {s['id']: s.get('cuisine_label') for s in data.get('sites') or []}
    return _CACHE[key]


def site_label(raw_label, path=CUISINES_PATH):
    """{'cuisine': canonical, 'sub': sub-label or None} for a cuisine site's label, or None."""
    got = (load(path).get('site_labels') or {}).get(raw_label)
    return {'cuisine': got['cuisine'], 'sub': got.get('sub')} if got else None


def to_canonical(source, raw_label, path=CUISINES_PATH):
    """The canonical label for one raw source label, or None if unmapped/blank. A cuisine site
    (ingest/fetch/sites.yaml) maps through site_labels; every other source through its label_map."""
    if not raw_label:
        return None
    if source in site_ids():
        got = site_label(raw_label, path)
        return got['cuisine'] if got else None
    return label_map(source, path).get(raw_label)


def validate(data):
    errors = []
    canon = data.get('canonical')
    if not isinstance(canon, list) or not canon:
        errors.append('canonical: missing or empty')
        canon = []
    if len(set(canon)) != len(canon):
        errors.append('canonical: repeated label')
    if 'unknown' in canon:
        errors.append('canonical: "unknown" is the below-threshold output, not a label to map to')
    lm = data.get('label_map')
    if not isinstance(lm, dict) or not lm:
        errors.append('label_map: missing or empty')
        lm = {}
    for source, mapping in lm.items():
        if not isinstance(mapping, dict) or not mapping:
            errors.append(f'label_map[{source!r}]: missing or empty')
            continue
        for raw, canon_label in mapping.items():
            if canon_label not in canon:
                errors.append(
                    f'label_map[{source!r}][{raw!r}]: {canon_label!r} not in canonical')
    sub = data.get('regional_sublabels') or {}
    for parent in sub:
        if parent not in canon:
            errors.append(f'regional_sublabels[{parent!r}]: parent not in canonical')
    for raw, got in (data.get('site_labels') or {}).items():
        c = (got or {}).get('cuisine')
        if c not in canon:
            errors.append(f'site_labels[{raw!r}]: {c!r} not in canonical')
        elif got.get('sub') and got['sub'] not in (sub.get(c) or []):
            errors.append(f'site_labels[{raw!r}]: sub {got["sub"]!r} not in regional_sublabels[{c!r}]')
    return errors


def unmapped_sites(data=None, sites=None):
    """Site ids from sites.yaml whose cuisine_label has no site_labels entry (must be empty)."""
    data = load() if data is None else data
    sites = site_ids() if sites is None else sites
    known = data.get('site_labels') or {}
    return sorted(s for s, lab in sites.items() if lab not in known)


def main(argv):
    try:
        data = load()
    except Exception as exc:  # noqa: BLE001
        print(f'FAIL: {exc}')
        return 1
    errors = validate(data) + [f'sites.yaml {s!r}: cuisine_label not in site_labels' for s in unmapped_sites(data)]
    if errors:
        for e in errors:
            print(f'FAIL: {e}')
        return 1
    n_sources = len(data.get('label_map') or {})
    n_values = sum(len(v) for v in (data.get('label_map') or {}).values())
    print(f'OK: {len(canonical_labels())} canonical labels, '
          f'{n_sources} sources mapped, {n_values} raw label values total')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
