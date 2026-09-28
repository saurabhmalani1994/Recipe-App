# Brief S15: estimate servings where the source gives none (ingest)
From the orchestrator. Established by the orchestrator on /home/user/recipe-data/out/corpus.db:
servings is known for only 1,034 of 80,000 recipes (recipenlg 0/76,502, themealdb 0/757,
bbcgoodfood 847/2,390, foodwishes 47/141). Without it, the owner's servings rule (D11, verbatim:
"I find 1.5 servings worth per person to be appropriate") cannot scale 99% of recipes, and
nutrition (S14) is NULL for 99%.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/build/` (a servings module and its
call site) and `schema/corpus.sql` (one column), plus `app/src/corpus/types.ts` regenerated with
gen_types.py. The app changes in item 4 only.
Model: strong. Effort: high.

Deliverable:
1 A deterministic estimator, in order of evidence:
  a Yield text or a servings field from the source.
  b Explicit text in the title, ingredients or steps: "serves 4", "makes 24 cookies", "fill 12
    muffin cups", "cut into 16 squares", "9x13 pan".
  c A total-energy estimate from S14's per-recipe totals, divided by a course-typical kcal per
    serving (main about 550, side about 200, dessert about 350, and so on; calibrate these on the
    recipes with known servings and document them).
  d A total cooked mass fallback.
  Output: servings (int), servings_source ('source' | 'text' | 'energy' | 'mass'), and a
  count-noun yield when relevant ("24 cookies").
2 Schema: add `servings_source` with a CHECK list, bump schema_version, regenerate app types,
  and keep all tests green.
3 Eval, with the bar written before the first run: on the recipes whose source gives servings,
  hide the value and estimate it. Estimated servings within +-1 or +-30% on >= 70% of them,
  overall and per course. Report the confusion by course, and 10 misses verbatim.
4 App: where servings_source is not 'source', the recipe page says "Serves about N
  (estimated)". Scaling still uses it (D11). This is a small change in CorpusRecipeDetail only.
5 Do NOT rebuild the full corpus. Run on the 5k sample and report the fill rates for servings
  and for nutrition after this change. The orchestrator schedules the full rebuild.
Checks: ingest pytest, app scripts/check.sh, and the eval bar. Report per §6.
