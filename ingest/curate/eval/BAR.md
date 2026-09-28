# The bar for "does quality rank recipes that work well?" (brief S8 #5)

Written and committed before any recipe was drawn or scored for the eval.

## Owner grade (the real test)

60 recipes from the ranked pool (every recipe that survives the drops, the hard junk filters and
the dedupe, before the quota selection): 20 drawn at random from the top 5% of the quality score,
20 from the middle 5% (47.5th to 52.5th percentile), 20 from the bottom 5%. Seeded draw, shuffled
together, band hidden. The owner grades each recipe from its title, ingredients and method:

- 2 = I would cook this as written and expect it to work
- 1 = workable, but I would have to fix something (a missing amount, a vague step, an odd ratio)
- 0 = broken, junk, or I would not cook it

PASS needs all three:

1. Top band mean grade >= 1.5.
2. Top band mean minus bottom band mean >= 0.6.
3. Means ordered top >= middle >= bottom.

A pass means the score separates recipes that work from ones that do not across the range the
selection cuts through. A fail on 3 with a pass on 1 and 2 means the score finds the best and the
worst but the middle is noise; worth knowing, since the 80k cut falls well above the middle.

## Cheap proxy (while iterating)

On recipes joined to Food.com ratings with at least 3 star ratings: Spearman correlation between
the content score (the quality score without its rating and popularity terms, renormalized) and
the Bayesian-average rating. Food.com ratings are compressed (most are 5 stars), so a large
correlation is not expected. The proxy passes if rho > 0 at p < 0.01. It is a sanity check that
the content terms do not point the wrong way; it does not replace the owner grade.
