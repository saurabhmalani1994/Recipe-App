"""The quality score: deterministic, 0..1, from a scan features record (briefs S8 #3, S8b).

    quality = junk_factor * trunc_factor * parse_factor * (
                0.18 domain + 0.15 lines + 0.17 method + 0.10 fresh + 0.10 style
              + 0.06 parse + 0.05 quantities + 0.02 time + 0.07 rating + 0.05 popularity + 0.05 extras)

S8b reweighted it toward what the owner's 60 grades track (ingest/curate/eval/owner_grade.md,
now the TUNING set): substance (enough ingredients, a real method) alongside the domain, plus
the owner's style (D17: not convenience or heartland food) and freshness (D18). By group on
those 60 grades: ingredient lines <= 7 mean 0.16, 8-12 1.12, >= 13 1.17; method under 300
characters 0.28, 600 or more 1.24. The S8 score gave lines 0.05 and steps 0.15 with a flat
reward above 120 characters, so a two-line "Mix well" recipe from a good site ranked high.

Every term is 0..1:
  domain      DOMAIN_PRIOR of the recipe's site, by who writes and tests the recipe (below).
  lines       ingredient count, a soft ramp (LINES_RAMP): 3 or fewer 0, 4 0.15, 5 0.3, 6 0.45,
              7 0.65, 8 0.85, 9-20 1, 21-30 0.8, more 0.5 (a scraped page, not a recipe).
  method      method substance: the method's characters on a ramp from METHOD_MIN (150, and
              below 40 it is 0) to METHOD_FULL (700) = 1; halved when the method is one real
              step under 400 characters (steps that are only headers, "1st Layer:", do not
              count as steps); 0.5 for a scraped page (one step over 2,500 characters or a
              method over 8,000); 0 when the method looks cut off (trunc, below).
  fresh       freshness (D18): of the recipe's non-staple, non-seasoning ingredients (taxonomy
              is_staple false; category not spice, spice_blend, salt or basic), the share that
              is fresh: produce aisle (vegetables, fruit, fresh herbs, aromatics, fresh chiles),
              or the meat or seafood aisle (fresh meat and fish), prepared foods excluded. The
              share is full at FRESH_FULL (0.6). In the sweet courses (SWEET_COURSES), where a
              recipe is mostly flour, sugar, butter and eggs by nature, the term runs from 0.5 at
              no fresh item to 1 at FRESH_FULL_SWEET (0.25), so fresh fruit still lifts a dessert
              but desserts as a class are not pushed out of the corpus. SHORTCUT_PENALTY (0.8)
              times the share of ingredient lines bought canned, jarred, boxed, packaged or
              frozen is then taken off, floor 0. Read from the scan's resolved slug set (one
              entry per distinct ingredient), not per line.
  style       style (D17): 1 minus STYLE_STEP (0.5) per convenience or heartland marker in the
              ingredient lines (features.STYLE_MARKERS: whipped topping, Jell-O, pudding mix,
              box mixes, cream-of soup, processed cheese, canned dough, Miracle Whip, seasoning
              packets; marshmallows only in a savoury course), and one more step for a creamy
              base outside the sweet courses (a cheesecake is cream cheese by definition): 2 or
              more lines of sour cream, mayonnaise, cream cheese or salad dressing, or 1 such
              line in a recipe of 4 lines or fewer. Floor 0.
  parse       share of ingredient lines resolved to a taxonomy slug, rescaled so 50% or less
              resolved is 0 and 100% is 1: an unresolved line is a line the matcher cannot use.
  quantities  share of ingredient lines with a parsed amount.
  time        1 for a time the source gives (time_source source/source_partial), 0.6 for one
              estimated from durations in the steps, 0 when no time is known.
  rating      Bayesian average of the 5-point rating, shrunk toward RATING_PRIOR with the weight
              of RATING_C ratings, mapped 3.0 -> 0 and 5.0 -> 1. An unrated recipe gets the
              prior's value, so no rating is neither a reward nor a penalty against an average
              rated one. Ratings come from the source (foodcom) or the Food.com interactions
              join (recipenlg food.com URLs).
  popularity  log-scaled count of the recipe's near-duplicates (the dedupe cluster, other
              copies of the same dish on other sites or pages) plus its review count:
              log(1 + copies + reviews) / log(1 + POP_SATURATE), capped at 1.
  extras      0.5 for an image, 0.5 for a yield.
junk_factor: 0.5 when the title names a core ingredient no line mentions
(missing_core_ingredient), else 1. The hard junk flags never reach scoring: they are dropped.
trunc_factor: TRUNC_FACTOR (0.7) when features.truncated_method finds the method cut off (the
last step is a header such as "1st Layer:", half the steps are headers, or the method stops
on "and" / "etc"), else 1.
parse_factor: UNPARSED_FACTOR (0.8) when under 60% of the ingredient lines resolve (UNPARSED_BELOW),
else 1. The parse term alone is only 0.06 of the score, and a recipe whose lines the matcher
cannot read ("a1 cupwater", "a1/2 cupbutter") should not rank with the best on its method.

How DOMAIN_PRIOR was set: by editorial process, not by measured outcome, in five tiers.
  1.00  professional editorial, recipes developed and tested by a food desk or test kitchen:
        bbcgoodfood, foodwishes (Chef John), epicurious, bonappetit, seriouseats, foodnetwork,
        myrecipes (Cooking Light / Southern Living / Sunset archive), marthastewart,
        cookinglight, eatingwell, simplyrecipes, thekitchn, food52 (edited), saveur,
        finecooking, bbc.co.uk, nytimes, delish, smittenkitchen, budgetbytes, foodandwine,
        vegetariantimes
  0.85  brand test kitchens, edited reader recipes and published cookbooks: bettycrocker,
        pillsbury, bhg, southernliving, landolakes, mccormick, cookstr (cookbook excerpts),
        recipes-plus (a UK magazine), foodrepublic, lovefood
        and the cuisine-specialist sites of ingest/fetch/sites.yaml (brief S10): single-author
        recipe developers who test and photograph each recipe, several with published cookbooks
        (Just One Cookbook, The Woks of Life, Korean Bapsang)
  0.70  curated or moderated community: themealdb, allrecipes (user uploads, moderated and
        heavily reviewed), chowhound
  0.55  rated user uploads and blog aggregators: food.com and the foodcom source (user uploads
        whose ratings the rating term reads), yummly (blog aggregator), tastykitchen
  0.50  any other site, github recipe repos
  0.30  unmoderated user-upload dumps: cookbooks.com (typed-in community cookbooks),
        cookeatshare, cookpad, recipeland, foodgeeks, online-cookbook, recipes.sparkpeople
Style-site adjustment (D17, measured before it was set; STYLE_SITES): sites whose recipes are
mostly the convenience style sit below their editorial tier. The share of a site's scanned
recipes with at least one style marker (score.style_markers, textpass over the S8 scan):
kraftrecipes 33.1% of 42,010, cookbooks.com 28.9% of 896,341, tasteofhome 15.7% of 51,594,
against 0.5-6.2% for the editorial tier (epicurious 5.4%, myrecipes 6.2%, nytimes 0.6%,
bbcgoodfood 0.6%), allrecipes 12.6%, food.com 12.5%, and 17.8% over all recipenlg.
kraftrecipes moves 0.85 -> 0.55, tasteofhome 0.85 -> 0.70, cookbooks.com 0.30 -> 0.20.
The 28 sites recipenlg holds were all placed by hand (CURATE_REPORT.md lists the counts); parse
rate and junk rate by site were checked and do not contradict the tiers, but they barely vary
(97-99% resolved everywhere), so they could not have set them.
"""
import math

WEIGHTS = {'domain': 0.18, 'lines': 0.15, 'method': 0.17, 'fresh': 0.10, 'style': 0.10, 'parse': 0.06,
           'qty': 0.05, 'time': 0.02, 'rating': 0.07, 'pop': 0.05, 'extras': 0.05}
RATING_C = 5          # the prior's weight, in ratings
RATING_PRIOR = 4.6    # the mean star rating of the 156,980 rated scan records is 4.618 (CURATE_REPORT.md)
POP_SATURATE = 20     # copies + reviews at which popularity is 1
MISSING_CORE_FACTOR = 0.5
TRUNC_FACTOR = 0.7
UNPARSED_BELOW, UNPARSED_FACTOR = 0.6, 0.8
LINES_RAMP = {0: 0.0, 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.15, 5: 0.3, 6: 0.45, 7: 0.65, 8: 0.85}
METHOD_MIN, METHOD_FULL = 150, 700
FRESH_FULL = 0.6         # about the 75th percentile of mains and sides
FRESH_FULL_SWEET = 0.25  # about the 90th percentile of desserts (62% of desserts have no fresh item)
SHORTCUT_PENALTY = 0.8
STYLE_STEP = 0.5
# Courses where marshmallows are at home; anywhere else they are a style marker.
SWEET_COURSES = {'dessert', 'baking', 'snack', 'drink', 'breakfast'}
# Courses where a cream-cheese or sour-cream base is the dish (cheesecake, frosting), not a shortcut.
CREAMY_OK_COURSES = {'dessert', 'baking', 'drink', 'breakfast'}
SEASONING_CATEGORIES = {'spice', 'spice_blend', 'salt', 'basic'}
FRESH_AISLES = {'produce', 'meat', 'seafood'}
NOT_FRESH_CATEGORIES = {'prepared', 'pantry'}

_TIERS = {
    1.00: ['bbcgoodfood', 'foodwishes', 'epicurious.com', 'bonappetit.com', 'seriouseats.com', 'foodnetwork.com',
           'myrecipes.com', 'marthastewart.com', 'cookinglight.com', 'eatingwell.com', 'simplyrecipes.com',
           'thekitchn.com', 'food52.com', 'saveur.com', 'finecooking.com', 'bbc.co.uk', 'cooking.nytimes.com',
           'nytimes.com', 'delish.com', 'smittenkitchen.com', 'budgetbytes.com', 'foodandwine.com',
           'vegetariantimes.com'],
    0.85: ['bettycrocker.com', 'pillsbury.com', 'bhg.com', 'southernliving.com', 'landolakes.com', 'mccormick.com',
           'cookstr.com', 'recipes-plus.com', 'foodrepublic.com', 'lovefood.com'],
    0.70: ['themealdb', 'allrecipes.com', 'chowhound.com'],
    0.55: ['food.com', 'foodcom', 'yummly.com', 'tastykitchen.com'],
    0.30: ['cookeatshare.com', 'cookpad.com', 'recipes.sparkpeople.com', 'geniuskitchen.com', 'recipeland.com',
           'foodgeeks.com', 'online-cookbook.com'],
}
# The style-site adjustment (D17), measured first: see the docstring.
STYLE_SITES = {'kraftrecipes.com': 0.55, 'tasteofhome.com': 0.70, 'cookbooks.com': 0.20}
DOMAIN_PRIOR = {d: v for v, ds in _TIERS.items() for d in ds}
DOMAIN_PRIOR.update(STYLE_SITES)
SITE_PRIOR = 0.85   # the cuisine sites' tier; features.domain() is the source id for them


def _site_ids():
    import os

    import yaml
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fetch', 'sites.yaml')
    with open(path, encoding='utf-8') as fh:
        return [s['id'] for s in (yaml.safe_load(fh) or {}).get('sites') or []]


DOMAIN_PRIOR.update({s: SITE_PRIOR for s in _site_ids()})
DEFAULT_PRIOR = 0.50

_TAX = {}


def _tax():
    if not _TAX:
        from ingest.taxonomy import taxonomy as T
        ing = T.load()
        fresh, counted = set(), set()
        for slug, rec in ing.items():
            if rec.get('is_staple') or rec['category'] in SEASONING_CATEGORIES:
                continue
            counted.add(slug)
            if rec['aisle'] in FRESH_AISLES and rec['category'] not in NOT_FRESH_CATEGORIES:
                fresh.add(slug)
        _TAX.update(fresh=frozenset(fresh), counted=frozenset(counted))
    return _TAX


def domain_prior(domain):
    if domain in DOMAIN_PRIOR:
        return DOMAIN_PRIOR[domain]
    # a subdomain of a listed site ("recipes.foodnetwork.com")
    parts = (domain or '').split('.')
    for i in range(1, len(parts) - 1):
        d = '.'.join(parts[i:])
        if d in DOMAIN_PRIOR:
            return DOMAIN_PRIOR[d]
    return DEFAULT_PRIOR


def bayes_rating(rating, n, prior=RATING_PRIOR, c=RATING_C):
    if rating is None or not n:
        return prior
    return (prior * c + float(rating) * n) / (c + n)


def rating_term(rating, n, prior=RATING_PRIOR):
    return min(1.0, max(0.0, (bayes_rating(rating, n, prior) - 3.0) / 2.0))


def method_term(step_chars, max_step, n_steps=2, n_frag=0, trunc=None):
    if trunc or step_chars < 40:
        return 0.0
    if max_step > 2500 or step_chars > 8000:
        return 0.5
    t = min(1.0, max(0.0, (step_chars - METHOD_MIN) / (METHOD_FULL - METHOD_MIN)))
    if step_chars < METHOD_MIN:
        t = 0.1 * step_chars / METHOD_MIN      # a sliver above the < 40 zero, so "Mix." < "Mix and bake 1 hour."
    if (n_steps or 0) - (n_frag or 0) <= 1 and step_chars < 400:
        t *= 0.5
    return t


def lines_term(n):
    if n in LINES_RAMP:
        return LINES_RAMP[n]
    if n <= 20:
        return 1.0
    if n <= 30:
        return 0.8
    return 0.5


def fresh_term(slugs, n_short=0, n_lines=0, course=None):
    """None-safe: a record without slugs (not from a scan) is scored 0.5, neither fresh nor not."""
    if slugs is None:
        return 0.5
    tx = _tax()
    counted = [s for s in slugs if s in tx['counted']]
    share = (sum(1 for s in counted if s in tx['fresh']) / len(counted)) if counted else 0.0
    if course in SWEET_COURSES:
        t = 0.5 + 0.5 * min(1.0, share / FRESH_FULL_SWEET)
    else:
        t = min(1.0, share / FRESH_FULL)
    if n_lines:
        t -= SHORTCUT_PENALTY * min(1.0, (n_short or 0) / n_lines)
    return max(0.0, t)


def style_markers(style, n_rich=0, n_lines=0, course=None):
    """The style markers that count against a recipe (marshmallows only in a savoury course,
    plus 'creamy_base')."""
    out = [m for m in (style or ()) if m != 'marshmallow' or (course and course not in SWEET_COURSES)]
    savoury = course not in CREAMY_OK_COURSES
    if savoury and ((n_rich or 0) >= 2 or ((n_rich or 0) >= 1 and n_lines and n_lines <= 4)):
        out.append('creamy_base')
    return out


def style_term(style, n_rich=0, n_lines=0, course=None):
    return max(0.0, 1.0 - STYLE_STEP * len(style_markers(style, n_rich, n_lines, course)))


def time_term(time_source):
    return {'source': 1.0, 'source_partial': 1.0, 'estimated': 0.6}.get(time_source, 0.0)


def pop_term(copies, reviews):
    x = max(0, copies) + max(0, reviews or 0)
    return min(1.0, math.log1p(x) / math.log1p(POP_SATURATE))


def terms(f, copies=0, prior=RATING_PRIOR):
    """{term: 0..1} for a features record; `copies` = cluster size - 1. A record without the
    S8b text fields scores as having no markers and no shortcut lines."""
    return {
        'domain': domain_prior(f['domain']),
        'lines': lines_term(f['n_lines']),
        'method': method_term(f['step_chars'], f['max_step'], f.get('n_steps', 2), f.get('n_frag', 0),
                              f.get('trunc')),
        'fresh': fresh_term(f.get('slugs'), f.get('n_short', 0), f['n_lines'], f.get('course')),
        'style': style_term(f.get('style'), f.get('n_rich', 0), f['n_lines'], f.get('course')),
        'parse': max(0.0, (f['resolved'] - 0.5) / 0.5),
        'qty': f['qty'],
        'time': time_term(f['time_source']),
        'rating': rating_term(f['rating'], f['rating_count'], prior),
        'pop': pop_term(copies, f['rating_count']),
        'extras': 0.5 * bool(f['image']) + 0.5 * bool(f['servings']),
    }


def quality(f, copies=0, prior=RATING_PRIOR, without=(), weights=None):
    """The 0..1 score (three decimals). `without` drops terms and renormalizes the rest (the
    eval proxy scores content alone, without the rating and popularity terms)."""
    t = terms(f, copies, prior)
    w = {k: v for k, v in (weights or WEIGHTS).items() if k not in without}
    s = sum(w[k] * t[k] for k in w) / sum(w.values())
    if 'missing_core_ingredient' in (f.get('junk') or ()):
        s *= MISSING_CORE_FACTOR
    if f.get('trunc'):
        s *= TRUNC_FACTOR
    if f['resolved'] < UNPARSED_BELOW:
        s *= UNPARSED_FACTOR
    return round(s, 3)
