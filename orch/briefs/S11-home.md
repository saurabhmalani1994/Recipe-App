# Brief S11: home page and corpus favorites (app)
From the orchestrator, release v0.2. Owner, verbatim: "a home page that recommends interesting
recipes that i could make for when i am not feeling inspired to think for myself". D12 asks
for all four rows: cook with what I have, explore new cuisines, like my favorites, and seasonal /
quick weeknight.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/src/routes/Home.tsx`,
`app/src/features/home/` (new), `app/src/features/favorites/`, and the star on
`CorpusRecipeDetail`. Do not edit the Cook engine; call it.
Model: mid. Effort: high.

Deliverable:
1 Favorites work for corpus recipes, keyed by recipes.key: a star on the corpus detail and the
  Cook results, and the favorites list mixes corpus and fixture/My Recipes favorites.
2 Home rows. Each row is horizontally scrollable cards (image if any, title, cuisine, time,
  "you have 7/9"), respects the diet preset, and is deterministic for a given day (seeded by
  the date, so the owner sees a fresh set daily, not on every render).
  a Cook with what I have: the engine's top results, with the floor applied.
  b Explore: cuisines not in the last 30 days of plan entries and favorites. Pick 2 and show
    their best quality recipes, with a "why": "You haven't cooked Korean lately".
  c Like your favorites: similar by slug Jaccard, cuisine and course. Exclude the favorites
    themselves. With no favorites yet, show a prompt.
  d Seasonal / weeknight: on weekdays, weeknight (<= 30 min) recipes that use in-season produce
    (corpus season table, the current month). On weekends, longer project recipes.
  Also add a "Surprise me" button: one random high-quality recipe that passes the filters.
3 Everything reads the corpus plus user.db; no network.
4 Tests: unit tests per row on fixture.db, with a fixed date and fixed favorites and plan
  history. Add a Playwright check that Home renders 4 rows at 412x915 with no horizontal page
  scroll (the rows scroll inside themselves), plus a screenshot.
Checks: scripts/check.sh, and e2e with PW_PORT=4311. Report per §6.
