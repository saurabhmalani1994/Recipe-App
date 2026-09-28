# Brief S1c: all of Food Wishes (ingest)
From the orchestrator. Owner, verbatim (D18): "i like using fresh ingredients. cant you get more from Food
Wishes? he makes good food". Today: 300 of 3,020 posts fetched, and the parser handles only
posts from about 2010-2019 (orch/reports/S1.md). The blog has a Blogger JSON feed:
https://foodwishes.blogspot.com/feeds/posts/default?alt=json&max-results=150&start-index=N gives full
post HTML, so about 21 requests cover everything.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/fetch/` only.
Model: mid. Effort: high.

Deliverable:
1 Fetch every post through the feed (1 request per second, 30 s timeout per request, resumable)
  into /home/user/recipe-data/raw/foodwishes/, keeping the raw post HTML cached on disk.
2 Classify posts into recipe and not-recipe (announcements, videos without a recipe). Parse
  ingredients and steps across every era's format: early posts with inline text, 2010s posts
  with an "Ingredients for N servings" block, and later posts that may link to Allrecipes (count
  those separately with the reason "recipe text only on allrecipes"; do not fetch Allrecipes).
  Yield text is kept.
3 Gold: hand-check 30 posts spread across years. Bar, written first: ingredients and steps
  correctly split on at least 27 of 30.
4 Report written and dropped counts per reason and per year, plus 5 recipes verbatim across eras.
Checks: pytest counts. Report per §6.
