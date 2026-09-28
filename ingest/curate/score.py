"""The quality score: deterministic, 0..1, from a scan features record (brief S8 #3).

    quality = junk_factor * (0.20 domain + 0.15 parse + 0.10 quantities + 0.15 steps
                             + 0.05 lines + 0.05 time + 0.15 rating + 0.10 popularity
                             + 0.05 extras)

Every term is 0..1:
  domain      DOMAIN_PRIOR of the recipe's site, by who writes and tests the recipe (below).
  parse       share of ingredient lines resolved to a taxonomy slug, rescaled so 50% or less
              resolved is 0 and 100% is 1: an unresolved line is a line the matcher cannot use.
  quantities  share of ingredient lines with a parsed amount.
  steps       step-text sanity: under 40 characters of method is 0 ("Mix."), under 120 is 0.4;
              a single step over 2,500 characters or a method over 8,000 (a scraped page
              rather than a method) is 0.5; else 1.
  lines       ingredient count sanity: 1 line 0.2, 2 lines 0.5, 3-20 lines 1, 21-30 0.8, more 0.5.
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

How DOMAIN_PRIOR was set: by editorial process, not by measured outcome, in five tiers.
  1.00  professional editorial, recipes developed and tested by a food desk or test kitchen:
        bbcgoodfood, foodwishes (Chef John), epicurious, bonappetit, seriouseats, foodnetwork,
        myrecipes (Cooking Light / Southern Living / Sunset archive), marthastewart,
        cookinglight, eatingwell, simplyrecipes, thekitchn, food52 (edited), saveur,
        finecooking, bbc.co.uk, nytimes, delish, smittenkitchen, budgetbytes, foodandwine,
        vegetariantimes
  0.85  brand test kitchens, edited reader recipes and published cookbooks: tasteofhome (reader
        recipes, tested), kraftrecipes, bettycrocker, pillsbury, bhg, southernliving,
        landolakes, mccormick, cookstr (cookbook excerpts), recipes-plus (a UK magazine),
        foodrepublic, lovefood
  0.70  curated or moderated community: themealdb, allrecipes (user uploads, moderated and
        heavily reviewed), chowhound
  0.55  rated user uploads and blog aggregators: food.com and the foodcom source (user uploads
        whose ratings the rating term reads), yummly (blog aggregator), tastykitchen
  0.50  any other site, github recipe repos
  0.30  unmoderated user-upload dumps: cookbooks.com (typed-in community cookbooks),
        cookeatshare, cookpad, recipeland, foodgeeks, online-cookbook, recipes.sparkpeople
The 28 sites recipenlg holds were all placed by hand (CURATE_REPORT.md lists the counts); parse
rate and junk rate by site were checked and do not contradict the tiers, but they barely vary
(97-99% resolved everywhere), so they could not have set them.
"""
import math

WEIGHTS = {'domain': 0.20, 'parse': 0.15, 'qty': 0.10, 'steps': 0.15, 'lines': 0.05, 'time': 0.05,
           'rating': 0.15, 'pop': 0.10, 'extras': 0.05}
RATING_C = 5          # the prior's weight, in ratings
RATING_PRIOR = 4.6    # the mean star rating of the 156,980 rated scan records is 4.618 (CURATE_REPORT.md)
POP_SATURATE = 20     # copies + reviews at which popularity is 1
MISSING_CORE_FACTOR = 0.5

_TIERS = {
    1.00: ['bbcgoodfood', 'foodwishes', 'epicurious.com', 'bonappetit.com', 'seriouseats.com', 'foodnetwork.com',
           'myrecipes.com', 'marthastewart.com', 'cookinglight.com', 'eatingwell.com', 'simplyrecipes.com',
           'thekitchn.com', 'food52.com', 'saveur.com', 'finecooking.com', 'bbc.co.uk', 'cooking.nytimes.com',
           'nytimes.com', 'delish.com', 'smittenkitchen.com', 'budgetbytes.com', 'foodandwine.com',
           'vegetariantimes.com'],
    0.85: ['tasteofhome.com', 'kraftrecipes.com', 'bettycrocker.com', 'pillsbury.com', 'bhg.com',
           'southernliving.com', 'landolakes.com', 'mccormick.com', 'cookstr.com', 'recipes-plus.com',
           'foodrepublic.com', 'lovefood.com'],
    0.70: ['themealdb', 'allrecipes.com', 'chowhound.com'],
    0.55: ['food.com', 'foodcom', 'yummly.com', 'tastykitchen.com'],
    0.30: ['cookbooks.com', 'cookeatshare.com', 'cookpad.com', 'recipes.sparkpeople.com', 'geniuskitchen.com',
           'recipeland.com', 'foodgeeks.com', 'online-cookbook.com'],
}
DOMAIN_PRIOR = {d: v for v, ds in _TIERS.items() for d in ds}
DEFAULT_PRIOR = 0.50


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


def steps_term(step_chars, max_step):
    if step_chars < 40:
        return 0.0
    if step_chars < 120:
        return 0.4
    if max_step > 2500 or step_chars > 8000:
        return 0.5
    return 1.0


def lines_term(n):
    if n <= 0:
        return 0.0
    if n == 1:
        return 0.2
    if n == 2:
        return 0.5
    if n <= 20:
        return 1.0
    if n <= 30:
        return 0.8
    return 0.5


def time_term(time_source):
    return {'source': 1.0, 'source_partial': 1.0, 'estimated': 0.6}.get(time_source, 0.0)


def pop_term(copies, reviews):
    x = max(0, copies) + max(0, reviews or 0)
    return min(1.0, math.log1p(x) / math.log1p(POP_SATURATE))


def terms(f, copies=0, prior=RATING_PRIOR):
    """{term: 0..1} for a features record; `copies` = cluster size - 1."""
    return {
        'domain': domain_prior(f['domain']),
        'parse': max(0.0, (f['resolved'] - 0.5) / 0.5),
        'qty': f['qty'],
        'steps': steps_term(f['step_chars'], f['max_step']),
        'lines': lines_term(f['n_lines']),
        'time': time_term(f['time_source']),
        'rating': rating_term(f['rating'], f['rating_count'], prior),
        'pop': pop_term(copies, f['rating_count']),
        'extras': 0.5 * bool(f['image']) + 0.5 * bool(f['servings']),
    }


def quality(f, copies=0, prior=RATING_PRIOR, without=()):
    """The 0..1 score (three decimals). `without` drops terms and renormalizes the rest (the
    eval proxy scores content alone, without the rating and popularity terms)."""
    t = terms(f, copies, prior)
    w = {k: v for k, v in WEIGHTS.items() if k not in without}
    s = sum(w[k] * t[k] for k in w) / sum(w.values())
    if 'missing_core_ingredient' in (f.get('junk') or ()):
        s *= MISSING_CORE_FACTOR
    return round(s, 3)
