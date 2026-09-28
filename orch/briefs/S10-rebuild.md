# Brief S10: prepare the full rebuild (ingest), and then run it
From the orchestrator. Read docs/DECISIONS.md rows R10-R18 and D15-D19, orch/reports/S8b.md "Open",
orch/reports/S17.md and S17b.md "Open", and orch/reports/S1c.md.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/` (build, curate, cuisine label maps,
and fetch only for the foodwishes video-URL field).
Model: strong. Effort: high.

Deliverable:
1 Label maps: map the cuisine_label of every sites.yaml entry into ingest/cuisine/cuisines.yaml
  (palestinian → middle_eastern with a sub-label "palestinian"; persian → persian; and so on).
  Site labels are trusted over the classifier.
2 R17: for Food Wishes recipes with no written steps, extract the YouTube URL from the cached post
  HTML (/home/user/recipe-data/raw/foodwishes/posts/), store it (schema: a recipes.video_url
  column; bump schema_version and regenerate app types), and let the build keep them past R10.
  The app is not touched here beyond generated types.
3 R16 at build: drop Israeli-labelled recipes from any source, counted.
4 R18: a cuisine floor may not take a recipe scoring below the pool's 25th percentile.
5 Scan the new raw sources: bbcgoodfood (larger now), foodwishes (1,084), the ~32 cuisine sites.
  Treat cuisine-site and editorial sources like BBC: keep everything that passes the junk
  filters. Target 80k; hard cap 100k and 235 MB. Report whether editorial plus site recipes
  push the total above 80k, and what you did about it.
6 Run the full build to /home/user/recipe-data/out/corpus.db and write CURATED_BUILD.md:
  distributions by source, site, cuisine, course and diet, servings and nutrition fill rates,
  size, and every drop with a reason. The BBC retry and cuisine-site crawls may still be
  running when you start. Record the raw line counts you built from (build_sources pins them),
  so the orchestrator can rebuild once they finish.
7 Regenerate app/src/corpus/fixture.db (at most 300 recipes, balanced across sources and cuisines,
  including a few cuisine-site and Food Wishes video-method ones) with --keep-rows semantics
  where the app tests depend on specific rows; keep app scripts/check.sh green.
Checks: ingest pytest, app scripts/check.sh, and the build numbers. Report per §6 plus 10 random
selected titles verbatim.
