# Brief S9a: corpus.db schema and builder (on a sample)
From the orchestrator, release v0.1. This is the shared contract between ingest and app (rule 8,
ruling R4). Read docs/PRODUCT.md "The library", "Features" and "Quality bar", plus
docs/DECISIONS.md rulings R5-R10, and `app/src/corpus/draft.ts` (the app's local mirror). Do not
read other app code.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `schema/corpus.sql`, `schema/README.md`,
`ingest/build/` (new), and `app/src/corpus/` only for generated types plus a fixture corpus.
Model: strong. Effort: high.

Deliverable:
1 `schema/corpus.sql` (SQLite, with a version row). It covers:
  - recipes: id, source, source_url, title, servings, yield_text, times, weeknight, cuisine and
    confidence, course (main, side, dessert, breakfast, snack, drink, sauce/condiment, baking),
    one_pot, one_pan, sheet_pan_meal, stove_and_oven, image_url, a quality score, and nutrition
    per serving (nullable).
  - recipe_ingredients: recipe_id, position, qty, qty_max, unit, slug, raw text, prep, optional,
    note, pkg_qty, pkg_unit.
  - steps, recipe_equipment, and recipe_equipment_alternatives.
  - recipe_diet: preset, status, and a swaps JSON.
  - the ingredients taxonomy table: slug, name, parent, aisle, flags, density, each_g,
    is_staple, and synonyms in a separate table.
  - substitutions and substitution components.
  - season: slug to months.
  - unit conversion tables.
  - FTS5 over title, ingredients and cuisine.
  - Indexes for matching by slug, for which the per-slug recipe count and a slug to recipe_ids
    posting list are the hot path.
  Write the matching query the app will run ("recipes covering most of these slugs, filtered by
  diet, equipment, one_pot, cuisine and time") and EXPLAIN it on the sample.
2 Course is derived by a small deterministic rule tagger (title and category keywords plus
  ingredient signals), with a 100-recipe gold set and a bar of at least 85%, written first
  (R9 needs it).
3 `ingest/build/build_corpus.py`: raw sources -> parse -> tag -> cuisine (use whatever
  ingest/cuisine exposes at HEAD; nullable) -> write corpus.db. It must be deterministic,
  streamed, and resumable per source, with drop counts and a reason for each (R10). Run it on a
  5k-recipe sample. Report the db size and extrapolate linearly to 100k.
4 App side: generate `app/src/corpus/types.ts` from the schema with a script. Commit
  `app/src/corpus/fixture.db` (at most 300 recipes, a size-balanced slice of the sample), and
  replace the DRAFT mirror with the generated types. Keep the app's typecheck passing; small
  import renames in app code are allowed.
Out of scope: dedupe and full-corpus selection (S8), the matcher UI, and nutrition values
(leave the column null).
Checks: ingest pytest, the course gold bar, app scripts/check.sh, and the size numbers. Report per §6.
