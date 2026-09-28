"""R17 at build and scan time: give a Food Wishes raw record its video_url (brief S10 #2).

attach(raw) sets raw['video_url'] from the cached post HTML (ingest/fetch/foodwishes_video.py)
when the record lacks one, so curate.drop_reason keeps a step-less Food Wishes recipe (its method
is the video) and the build writes recipes.video_url. The raw file is only read. The index is
built once per process, lazily, from <raw root>/foodwishes/posts/, or from the default raw root's
when the given root has none (make_fixture builds from a temporary raw directory).
"""
import os

from ingest.build.sample import RAW
from ingest.fetch.foodwishes_video import SOURCE, video_index

_INDEX = {}


def index(raw_root):
    key = os.path.abspath(raw_root)
    if key not in _INDEX:
        posts = os.path.join(raw_root, SOURCE, 'posts')
        if not os.path.isdir(posts):
            posts = os.path.join(RAW, SOURCE, 'posts')
        _INDEX[key] = video_index(posts)[0]
    return _INDEX[key]


def attach(raw, raw_root):
    """Set raw['video_url'] for a Food Wishes record from its post; returns raw."""
    if isinstance(raw, dict) and raw.get('source') == SOURCE and not raw.get('video_url') and raw.get('id'):
        url = index(raw_root).get(raw['id'])
        if url:
            raw['video_url'] = url
    return raw
