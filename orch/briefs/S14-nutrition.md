# Brief S14: nutrition estimates (ingest)
From the orchestrator. Owner chose "Nutrition estimates" (D6), and PRODUCT.md says "clearly labelled as
estimates". Read schema/README.md (the nutrition columns on recipes are NULL today).
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/nutrition/` (new), and
`ingest/build/` only for the hook that fills the columns. S8 is editing ingest/build/ curate and
select; touch only the nutrition fill function and its call site.
Model: mid. Effort: high.

Deliverable:
1 Fetch USDA FoodData Central: Foundation plus SR Legacy (the CSV or JSON downloads, public
  domain) into /home/user/recipe-data/raw/usda/.
2 Map taxonomy slugs to FDC foods. Use usda_hint where present, then a scored name match, with
  a hand-checked override file. Report the coverage weighted by how often each slug appears in
  corpus recipes (target >= 90% of ingredient occurrences).
3 Per recipe, per serving: kcal, protein, fat, carbs, fibre, sugar and sodium. Convert quantity
  to grams with the corpus units, density and each_g. Mark a recipe's nutrition as NULL (not
  zero) if the mapped grams cover less than 80% of its non-staple ingredient lines, and record
  the coverage per recipe.
4 A gold check: 15 well-known recipes with published nutrition. Bar: kcal per serving within
  +-25% on at least 12 of the 15, written before the first run.
5 Tests, and the fill run on the 5k sample: report the non-null rate.
Checks: pytest counts and the gold bar. Report per §6 plus 5 recipes' nutrition verbatim.
