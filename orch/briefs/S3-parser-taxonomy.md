# Brief S3: ingredient-line parser and canonical taxonomy
From the orchestrator, release v0.1. This is the core asset that every feature runs on (docs/PRODUCT.md,
"Tags derived for every recipe": read only that section and the Quality bar).
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/taxonomy/`, `ingest/parse/`, and
`ingest/subs/` only to repoint its ingredient source (see 1).
Model: strong. Effort: high.

Deliverable:
1 `ingest/taxonomy/ingredients.yaml` is the canonical taxonomy, and `ingest` owns it. Seed it from
  `ingest/subs/ingredients.yaml` and keep every existing slug and flag, including explicit_meat
  (D15/R7). Then make `ingest/subs/validate.py` read the taxonomy, so that the subs file is
  removed and its tests still pass. Each entry has: slug, name, synonyms (US/UK/Indian/other names,
  e.g. cilantro/coriander leaves/dhania, eggplant/aubergine/brinjal, scallion/spring onion,
  chickpea/garbanzo/chana), category, aisle (produce, dairy, meat, seafood, bakery, pantry,
  spices, international, frozen, beverages, other), diet flags, is_staple (salt, pepper,
  water, neutral oil...), and optionally density_g_per_ml, each_g, and usda_hint (a
  free-text name for the later nutrition match). Grow it to cover what the sample needs, aiming
  for roughly 1500-2500 slugs. Use a parent slug for varieties (e.g. roma_tomato has parent
  tomato), so that matching can fall back to the parent.
2 `ingest/parse/` is a deterministic Python parser that turns a raw line into
  {qty, qty_max, unit (canonical: g, ml, tsp, tbsp, cup, oz, lb, piece, clove, pinch, can...),
  slug or null, raw_name, prep (chopped, minced...), optional bool, note}. It must handle
  fractions and unicode fractions, ranges, "1 (14 oz) can", "salt and pepper to taste", "for
  garnish", "divided", metric and US units, and parentheticals. Two ingredients on one line
  produce two items.
3 A gold set in `ingest/parse/gold.jsonl`: at least 300 lines from
  `ingest/fixtures/ingredient_lines_sample.txt`, labelled by hand, with the hard ones deliberately
  included. The scorer credits exact matches only, per field. Write the bar before the first run:
  slug exact >= 95%, qty exact >= 97%, unit exact >= 97%.
4 Coverage: run the parser over the whole 3000-line sample and over 100k lines sampled from
  /home/user/recipe-data/raw/recipenlg/recipes.jsonl. Report the percent resolved to a slug,
  and the top 50 unresolved raw_names by frequency, with a reason for each (rule 11).
5 pytest, including tests for the D15 traps: "2 cups chicken stock" gives explicit_meat, and
  "1 tbsp oyster sauce" does not.
Out of scope: dedupe, cuisine/equipment tagging, corpus.db, and the app.
Checks: pytest counts, gold scores per field, coverage percentages, and the subs validator at 0 errors.
Report per ORCHESTRATION §6 plus 10 parsed lines verbatim (input and output), including 3 misses.
