# Brief S8: curation and quality ranking, then pick the 50-100k (ingest)
From the orchestrator, release v0.1. The owner's intent, verbatim: "The main intent for this ingest
is to be able to build a robust engine that can generate recipes that work well." Also D3,
"Curated ~50-100k". Read orch/reports/S9a.md ("Design was wrong about" and "Size") and
ingest/build/SAMPLE_BUILD.md.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/curate/` (new) and `ingest/build/`
(the curate and select hooks only). `ingest/fetch/` is allowed for one new fetcher (item 1).
Model: strong. Effort: high.

Facts, established by the orchestrator on the data:
- Every openrecipes and hf_cuisine_type record has no steps, so R10 drops them.
- The candidate pool is recipenlg (2,231,142, with source_url) plus bbcgoodfood, foodwishes,
  themealdb, foodcom and github.
- Top recipenlg domains in a 1/50 sample: cookbooks.com 17,927; food.com 9,965; epicurious 2,569;
  tastykitchen 1,583; myrecipes 1,297; cookpad 1,255; allrecipes 1,228; cookeatshare 1,156;
  yummly 1,039; tasteofhome 1,032; food52 970; foodnetwork 955; kraftrecipes 840.

Deliverable:
1 Ratings. Look for a reachable public mirror of the Food.com "recipes and interactions" data
  (RAW_recipes and RAW_interactions: 230k recipes, 1.1M reviews), on Hugging Face or elsewhere,
  without Kaggle auth. If you find one, write ingest/fetch/fetch_foodcom_ratings.py and join
  it to recipenlg food.com URLs by the numeric recipe id in the URL. Report the join rate.
  If none is found, say so and continue.
2 Dedupe near-duplicates. Match on title and ingredient-slug set (MinHash, or a normalized
  title plus slug-set Jaccard >= 0.8). Keep the best copy of each cluster by quality, and keep
  the cluster size as a popularity signal.
3 Quality score, deterministic, 0-1, documented. Signals:
  - rating and review count where joined, with a Bayesian average
  - cluster popularity
  - a domain prior (editorial sites above user-upload dumps; say how you set it)
  - parse resolution rate
  - step count and length sanity
  - quantities present
  - a known time
  - junk detectors: "see above", ads, "click here", missing core ingredient, and a title that is
    only an ingredient
4 Selection, with a target of 80k (hard cap 100k, 219 MB):
  - Take the top recipes by quality, with quotas so that every cuisine with data gets at least
    min(available, 1500).
  - Main courses are at least 45%.
  - Keep every recipe from the small editorial sources (bbcgoodfood, themealdb, foodwishes) that
    passes the junk filters.
  - Diet coverage: at least 25% vegetarian ok or adaptable, and at least 50% no_red_meat ok or
    adaptable.
5 An eval to answer "does quality rank recipes that work well?". Write the bar first. Take 60
  recipes, 20 each from the top, middle and bottom of the score, blind-shuffled into
  ingest/curate/eval/owner_grade.md, a checklist the owner can grade in 10 minutes (the
  orchestrator sends it). Also, while iterating, a cheap proxy: how the score correlates with
  rating on the joined food.com subset, if item 1 succeeds.
6 Run the full build to /home/user/recipe-data/out/corpus.db. Report the count, size, and
  distributions by source, cuisine, course, diet and time, plus the drops with reasons. Stream
  the run under a hard timeout; a 2.2M scan must print progress.
Out of scope: app changes, and the course tagger rules (S9b).
Checks: pytest counts and the full-build numbers. Report per §6 plus 10 top-scored and 5
bottom-kept titles verbatim.
