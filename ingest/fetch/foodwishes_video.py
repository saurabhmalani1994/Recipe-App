"""R17: the video a Food Wishes post embeds, read from the cached post HTML (brief S10 #2).

Chef John's method lives in the video for 743 of the 1,084 recipes (the 2007-2009 posts have no
written steps). Every post body in <raw-data>/foodwishes/posts/ embeds its video; the embed is,
by era, a YouTube `<object>`/`<embed>` ("youtube.com/v/<id>"), a YouTube `<iframe>`
("youtube.com/embed/<id>"), or, for about 50 early posts, Vimeo or Brightcove.

video_url(content_html)  the post's first YouTube video as a watch URL, else its first Vimeo
                         video, else None. Pure (re only), so the build can import it.
video_index(posts_dir)   {raw recipe id: video url} for every cached post that embeds one. A post
                         whose embed is neither YouTube nor Vimeo (2 Brightcove, 1 other) gets
                         its own post URL: that page is where the video plays. A post with no
                         embed at all gets nothing, so a step-less one is still dropped (R10).
post_id(filename)        the raw recipe id a cached post file belongs to.

The fetcher (fetch_foodwishes.parse_post) writes the field into new raw records; the build
(ingest/build/video.py) looks it up here for records written before the field existed, since the
raw file itself is never rewritten.
"""
import json
import os
import re

SOURCE = 'foodwishes'
_YT_RE = re.compile(r'(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=|v/)|youtu\.be/)([\w-]{11})')
_EMBED_RE = re.compile(r'<(?:iframe|embed|object)\b', re.I)
_VIMEO_RE = re.compile(r'(?:player\.vimeo\.com/video/|vimeo\.com/moogaloop\.swf\?clip_id=|vimeo\.com/)(\d{5,})')


def video_url(content_html):
    """The post's video: https://www.youtube.com/watch?v=<id> for the first YouTube embed, else
    https://vimeo.com/<id> for the first Vimeo one, else None."""
    if not content_html:
        return None
    m = _YT_RE.search(content_html)
    if m:
        return f'https://www.youtube.com/watch?v={m.group(1)}'
    m = _VIMEO_RE.search(content_html)
    if m:
        return f'https://vimeo.com/{m.group(1)}'
    return None


def post_id(filename):
    """'2007_02_calabrese-lollipops.json' -> 'foodwishes:2007/02/calabrese-lollipops' (the cache
    names a post <year>_<month>_<slug>.json; the raw id is <year>/<month>/<slug>)."""
    stem = filename[:-5] if filename.endswith('.json') else filename
    parts = stem.split('_', 2)
    if len(parts) != 3:
        return None
    return f'{SOURCE}:{parts[0]}/{parts[1]}/{parts[2]}'


def video_index(posts_dir):
    """{raw id: video url} for every cached post with a video. Unreadable files are skipped and
    returned in the second value, counted (rule 11)."""
    out = {}
    bad = 0
    if not os.path.isdir(posts_dir):
        return out, bad
    for name in sorted(os.listdir(posts_dir)):
        if not name.endswith('.json'):
            continue
        rid = post_id(name)
        try:
            with open(os.path.join(posts_dir, name), encoding='utf-8') as fh:
                entry = json.load(fh)
        except (OSError, ValueError):
            bad += 1
            continue
        html = ((entry.get('content') or {}).get('$t')) or ''
        url = video_url(html)
        if url is None and _EMBED_RE.search(html):
            url = next((ln.get('href') for ln in entry.get('link') or [] if ln.get('rel') == 'alternate'), None)
        if rid and url:
            out[rid] = url
    return out, bad
