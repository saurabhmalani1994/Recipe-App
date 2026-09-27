# Brief S5a: recipe taggers for diet, equipment, one-pot and time
From the orchestrator, release v0.1. Owner words: D5, D8, D15 in docs/DECISIONS.md, and rulings R7
and R8. Read those rows only.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/tag/` (new) only. Use `ingest.parse`,
`ingest.taxonomy` and `ingest/subs` as libraries, and do not edit them. If one needs a fix, write
it in your report.
Model: strong. Effort: high.

Input: one raw recipe (schema/raw_recipe.md) plus its parsed items. Output: a tags dict.
Deliverable:
1 Diet. For each preset (vegetarian and no_red_meat per R7/R8, and vegetarian_strict kept
  internal), return one of: `ok`, `adaptable` or `no`.
  - `adaptable` means every offending item has a diet-safe way out. That is either an "or Y"
    alternative in its note (the parser keeps "or vegetable broth" in note), or a substitution
    of quality >= 2 in ingest/subs whose context fits.
  - Also return the list of swaps that makes it work. The app shows "make it vegetarian: use
    vegetable broth".
  - Never derive diet from the title. An item with slug null whose raw_name mentions meat or
    fish counts as offending.
2 Equipment, inferred from steps and ingredients, as a set of: oven, stovetop, air_fryer,
  food_processor, blender, immersion_blender, mortar_pestle, slow_cooker, pressure_cooker,
  rice_cooker, grill, broiler, microwave, wok, stand_mixer, hand_mixer, dutch_oven, cast_iron,
  sheet_pan, deep_fryer, smoker, spice_grinder, and no_cook. Owner D8 says the list is
  illustrative, so add what the data shows. Derive `stove_and_oven`.
  Also derive `one_pot` (a single cooking vessel), `one_pan` and `sheet_pan_meal`.
3 Time: total and active minutes from the source fields, or estimated from the step text
  ("simmer 20 minutes"), with a field recording which. `weeknight` = total <= 30 minutes.
4 A gold set in `ingest/tag/gold/`: 150 recipes, hand-labelled for equipment, one_pot and diet,
  drawn across sources, including planted traps.
  - Traps: chicken stock with a vegetable-stock alternative (vegetarian adaptable), oyster sauce
    (vegetarian ok), lard (not ok for no_red_meat), a "bake" that means a stovetop bake, "grill"
    meaning broiler (UK), and a "food processor or blender" line.
  - Bars, written before the first run: diet exact 100% on the traps and >= 98% overall. For
    each of oven, stovetop, air_fryer, food_processor, blender and mortar_pestle: precision
    >= 90% and recall >= 85%. one_pot accuracy >= 90%.
  - Report the first-run scores as well as the final ones.
5 A run over 20k raw recipes sampled across all sources. Report the tag distributions and
  counts for recipes with no equipment found, no time, or diet undeterminable, each with a
  reason.
Out of scope: cuisine, seasonality, dedupe, and corpus.db.
Checks: pytest counts and gold scores. Report per §6 plus 5 tagged recipes verbatim (tags only,
with title).
