"""Time tagger: total and active minutes, from the source's own fields when it has them, else
estimated from durations in the step text ("simmer 20 minutes"). `source` records which:
  source          total_time_min, or prep_time_min + cook_time_min, given by the source
  source_partial  only one of prep/cook given; the other part is estimated from the steps
  estimated       no source fields; step durations plus a prep allowance
  None            nothing to go on (reason given)
`weeknight` = total <= 30 minutes (None when total is unknown).

Estimation: every duration in a step counts once, the upper end of a range ("10-15 mins" = 15),
"overnight" = 8 hours. A duration is passive (bake, simmer, chill, rise, marinate, rest...) or
active (fry, stir, knead, whisk...). Storage notes ("keeps for up to a month") and "or up to
12 hrs" are skipped. Prep allowance = 3 minutes + 1 per ingredient line, capped at 25.
Active = source prep time when given, else the allowance plus the active step durations.
"""
import re

I = re.IGNORECASE
WEEKNIGHT_MAX = 30
MAX_SANE = 60 * 24 * 14   # two weeks; bigger source values are treated as missing

NUMW = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
        'eight': 8, 'nine': 9, 'ten': 10, 'fifteen': 15, 'twenty': 20, 'thirty': 30, 'forty': 40,
        'forty-five': 45, 'sixty': 60, 'a few': 3, 'a couple of': 2, 'couple of': 2, 'several': 5,
        'half an': 0.5, 'half a': 0.5}
_NUM = r'(\d+(?:\.\d+)?(?:\s+\d/\d|/\d+)?|½|¼|¾|' + '|'.join(sorted(map(re.escape, NUMW), key=len, reverse=True)) + r')'
DUR_RE = re.compile(
    rf'(?<![\w/])(?:{_NUM}\s*(?:(?:-|–|to|or)\s*{_NUM}\s*)?(?:\s|-)?(hours?|hrs?|h|minutes?|mins?|m)\b\.?'
    rf'(?:\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b)?)|(overnight)|(\d+)\s*[-–]\s*(\d+)\s*分钟|(\d+)\s*分钟|'
    rf'(\d+)\s*小时', I)
SKIP_RE = re.compile(r'\b(?:keeps?|will keep|store|stored|up to|lasts?|shelf|days?|weeks?|months?|in advance|'
                     r'ahead|the day before)\b', I)
PASSIVE_RE = re.compile(r'\b(?:bak\w*|roast\w*|simmer\w*|rest\w*|chill\w*|refrigerat\w*|fridge|marinat\w*|'
                        r'rise|rising|prove|proof\w*|soak\w*|stand\w*|cool\w*|freez\w*|set aside|leave|'
                        r'left|slow[- ]cook\w*|brais\w*|steam\w*|infuse|ferment\w*|overnight|pressure|'
                        r'on low|on high|oven|until set|to set|sit|steep\w*|boil\w*|poach\w*)\b', I)


def _num(tok):
    if tok is None:
        return None
    t = tok.strip().lower()
    if t in NUMW:
        return NUMW[t]
    t = t.replace('½', '.5').replace('¼', '.25').replace('¾', '.75')
    m = re.fullmatch(r'(\d+)\s+(\d)/(\d)', t)
    if m:
        return int(m.group(1)) + int(m.group(2)) / int(m.group(3))
    m = re.fullmatch(r'(\d+)/(\d+)', t)
    if m:
        return int(m.group(1)) / int(m.group(2)) if int(m.group(2)) else None
    try:
        return float(t)
    except ValueError:
        return None


def durations(text):
    """[(minutes, passive)] for one step's text."""
    out = []
    for sent in re.split(r'(?<=[.!?。])\s+|;', text):
        if SKIP_RE.search(sent) and not re.search(r'\bovernight\b', sent, I):
            continue
        passive = bool(PASSIVE_RE.search(sent))
        for m in DUR_RE.finditer(sent):
            g = m.groups()
            if g[4]:
                mins = 480
                passive = True
            elif g[5]:
                mins = float(g[6])
            elif g[7]:
                mins = float(g[7])
            elif g[8]:
                mins = float(g[8]) * 60
            else:
                lo, hi, unit, extra = _num(g[0]), _num(g[1]), (g[2] or '').lower(), g[3]
                v = hi if hi is not None else lo
                if v is None:
                    continue
                if unit.startswith('h'):
                    mins = v * 60 + (float(extra) if extra else 0)
                elif unit == 'm' and v > 180:
                    continue
                else:
                    mins = v
            if mins <= 0 or mins > 60 * 24 * 3:
                continue
            out.append((mins, passive))
    return out


def _sane(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and 0 < v <= MAX_SANE


def tag_time(raw, no_cook=False):
    """no_cook: the equipment tagger found no heat source; such a recipe with no durations is
    estimated at the prep allowance alone."""
    n_lines = len([l for l in raw.get('ingredients') or [] if l and l.strip()])
    prep_allow = min(25, 3 + n_lines)
    steps = [s for s in raw.get('steps') or [] if s and s.strip()]
    durs = []
    for s in steps:
        durs += durations(s)
    step_total = sum(d for d, _ in durs)
    step_active = sum(d for d, p in durs if not p)
    total_src = raw.get('total_time_min')
    prep = raw.get('prep_time_min')
    cook = raw.get('cook_time_min')
    prep = prep if _sane(prep) else None
    cook = cook if _sane(cook) else None
    total = active = None
    source = reason = None
    if _sane(total_src):
        total, source = total_src, 'source'
    elif prep is not None and cook is not None:
        total, source = prep + cook, 'source'
    elif cook is not None:
        total, source = prep_allow + cook, 'source_partial'
    elif prep is not None:
        if durs:
            total, source = prep + step_total, 'source_partial'
        else:
            total, source = prep, 'source_partial'
    elif durs:
        total, source = prep_allow + step_total, 'estimated'
    elif no_cook and steps:
        total, source = prep_allow, 'estimated'
    else:
        reason = 'no time fields and no durations in the steps' if steps else 'no time fields and no steps'
    if total is not None:
        if prep is not None:
            active = min(prep, total)
        elif source == 'estimated' or durs:
            active = min(total, prep_allow + step_active)
        else:
            active = min(total, prep_allow)
    total = int(round(total)) if total is not None else None
    active = int(round(active)) if active is not None else None
    return {'total_min': total, 'active_min': active, 'source': source,
            'weeknight': (total <= WEEKNIGHT_MAX) if total is not None else None,
            'reason': reason}
