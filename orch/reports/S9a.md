Builder ingest (+ app/src/corpus types), slice S9a. Hash: the commit that adds this file, on branch
worktree-agent-af72fa6abfaf0d829 (cut from b680840 = claude/funny-thompson-jcmpox HEAD). Nothing pushed.
The course gold set and scorer were committed on their own first (20759ed), before the tagger existed.

- Changed:
  - `schema/corpus.sql` (schema_version 1, also `PRAGMA user_version`): recipes (times,
    weeknight, cuisine + confidence + source, course, one_pot/one_pan/sheet_pan_meal/
    stove_and_oven/no_cook, image_url, rating, quality, line/unresolved/core-slug counts, 7
    nutrition-per-serving columns left NULL), recipe_ingredients (qty, qty_max, unit, slug, raw,
    prep, optional, note, pkg_qty, pkg_unit), recipe_slugs (the posting list: WITHOUT ROWID, PK
    (slug, recipe_id), `core` flag), steps, recipe_equipment, recipe_equipment_alternatives,
    recipe_diet (preset, status, swaps JSON), ingredients (slug, name, parent, category, aisle,
    flags, density, each_g, is_staple, usda_hint, recipe_count = the per-slug count),
    ingredient_synonyms, substitutions + substitution_components, season (months JSON + bit
    mask), units, contentless FTS5 over title/ingredients/cuisine, and build_sources/build_drops
    (the drop audit trail ships in the file). Enum columns carry CHECK lists; a test keeps each
    list equal to its owner (cuisines.yaml, equipment.VOCAB, units, taxonomy, subs contexts,
    COURSES). `schema/README.md` documents it; user.db should reference recipes by the stable
    `recipes.key`, not the build-local `id`.
  - `ingest/build/course.py`: rule tagger. Title head phrase (cut at with/for/in/on/colon/
    bracket, read right to left, 3-/2-word phrases first, some words decided by protein or
    sweetness), then whole title, source category, trusted source tags, then ingredient signals.
    Gold: `gold/course_gold.jsonl` 100, `course_holdout.jsonl` 50, `course_blind.jsonl` 50.
  - `ingest/build/build_corpus.py` (+ `sample.py`, `curate.py`): select -> drop -> parse ->
    tag (S5a) -> course -> cuisine (source label map, else the S5b classifier; NULL on unknown)
    -> write. Streamed line by line; commits every 500 lines with the source's resume point in the
    same transaction; a 5 s per-recipe alarm; every drop counted in build_drops with a reason and
    first example; out-of-list values coerced to NULL and counted (0 on the sample).
  - `ingest/build/match.sql` + `explain_match.py`: the "what can I cook?" query (have-slugs,
    diet, kitchen with either/or groups, one_pot AND course=main per R9, cuisine, max minutes,
    max missing; unresolved lines count as missing).
  - `ingest/build/gen_types.py` -> `app/src/corpus/types.ts` (14 enum unions + `*_VALUES` consts,
    one `*Row` interface per table, `CORPUS_SCHEMA_VERSION`; prettier-clean). `app/src/corpus/
    model.ts` replaces `draft.ts` (Recipe, IngredientLine, DietFlags now typed from types.ts, plus
    DietSwap). `make_fixture.py` -> `app/src/corpus/fixture.db`.
- Checks:
  - ingest pytest: 295 passed, 0 failed (5.4 s); ingest/build alone 34 passed.
  - app `scripts/check.sh`: typecheck pass, lint pass, unit 34 passed / 0 failed. prettier
    clean on every touched app file.
  - Course gold bar (>= 85%, on course_gold.jsonl): 99/100 = 99.0% PASSED. Holdout, scored once
    before the last two fixes: 42/50 = 84.0% (86.0% after). Blind set, drawn and labelled after
    the tagger was frozen, scored once: 41/50 = 82.0%. The blind number is the honest estimate:
    the holdout's titles were visible while I wrote the word lists. Blind misses: "Breakfast
    Pizza" and "Bacon Breakfast Casserole" (breakfast as a modifier), "Sesame Crusted Mahi Mahi
    With ... Butter Sauce" -> sauce_condiment (mahi is not a dish word, so the whole title's
    "sauce" wins), "Banh Xeo - Cambodian Savory Pancake" -> breakfast, "Pate Chinois" -> snack, "Watergate Salad" -> side, quesadillas -> snack,
    "Scampi Risotto" -> side, "Jamaican Fried Dumplings" -> dessert.
  - 5k sample (`--sample`, 5,000 raw lines over 9 sources): 3,621 written, 1,379 dropped in 37 s.
    Drops: openrecipes no_steps 1,100; hf_cuisine_type no_steps 150; foodwishes no_steps 123;
    foodcom no_ingredients 4; github_recipegen no_steps 2. 0 tag errors, 0 timeouts, 0 coerced.
  - Size: 8,708,096 bytes for 3,621 recipes. Static tables 823,296 bytes; 2,178 bytes per
    recipe; linear extrapolation to 100k = 219 MB. recipenlg alone: 2,028 bytes per recipe,
    204 MB at 100k. Under the 300 MB bar, with steps (29%) and recipe_ingredients (25%) the bulk.
    Full table in `ingest/build/SAMPLE_BUILD.md`.
  - Determinism: two clean builds of the same raw lines are byte-identical (sha256 equal). A
    build paused with --stop-after and resumed has an identical logical dump; the bytes differ
    only at file offsets 27 and 95 (sqlite's header change counters). test_build.py asserts
    dump equality for clean-vs-clean and clean-vs-resumed (2 pauses, BATCH=2).
  - EXPLAIN QUERY PLAN on the sample: `SEARCH rs USING PRIMARY KEY (slug=?)` per have-slug, TEMP
    B-TREE for GROUP BY, `SEARCH r USING INTEGER PRIMARY KEY`, `SEARCH d USING PRIMARY KEY
    (recipe_id=? AND preset=?)`, `SEARCH e USING PRIMARY KEY (recipe_id=?)`, `SEARCH a/b USING
    PRIMARY KEY`, TEMP B-TREE for ORDER BY. No table scans. Median of 20 runs on 3,621 recipes:
    20-slug kitchen 2.0 ms all filters / 2.5 ms none; 12-slug baking shelf 1.5 / 1.9 ms.
  - fixture.db: 300 recipes, 1,597,440 bytes, 59 each from bbcgoodfood, foodcom, foodwishes,
    recipenlg, themealdb plus all 5 github recipes, spread across line-count ranks. Courses: main
    125, dessert 72, side 36, baking 20, sauce_condiment 19, snack 13, breakfast 11, drink 4.
  - Samples (sample build, seed 3, verbatim): Sugar-Coated Pecans -> snack; Aztec Chicken ->
    main, one_pot 1, 510 min; Cooked Whole Spaghetti Squash (Slow Cooker) -> side; Egg & parsley
    salad with watercress dressing -> side, spanish; Corn Pudding -> dessert (wrong: a side);
    Insalata Ai Mela Ferri E Caldo Camembert -> dessert, german_central_eu (wrong on both).
- Outside my package:
  - `ingest/conftest.py` (new, 8 lines): pytest's default norecursedirs skips any dir named
    `build`, so `pytest ingest` silently collected 0 of the 34 new tests. The hook collects
    ingest/build explicitly.
  - App import renames only: `draft` -> `model`, `DraftRecipe` -> `Recipe`, `DraftIngredientLine`
    -> `IngredientLine` in fixture.ts, myRecipes/{diff,myRecipesRepo,types}.ts, scaling/scale.ts,
    routes/{MyRecipeEditor,RecipeDetail}.tsx; the getCorpusDb error text in db/index.ts; a comment
    in corpus/slugs.ts. No behaviour change. No npm script added (package.json untouched); the
    generator runs as `python3 ingest/build/gen_types.py`.
  - For other owners, not fixed: the parser reads "2 (7 oz.) cans tuna packed in water" as
    `water` (S3b). foodcom lists drop lines ("Yellow Squash Frittata" has no squash), so it
    matches with 0 missing. The cuisine classifier leaves 48% NULL on the sample (S5b-2 running).
- Design was wrong about:
  - R10 aims at "openrecipes records whose ingredient names were lost (about 32%)", but every
    openrecipes record at HEAD has `steps: []` (3,000 of 3,000 checked), so R10's no-steps half
    drops all 168,442 of them, and hf_cuisine_type's 34,348 too. The corpus is recipenlg plus the
    small scraped sources unless openrecipes gains steps. The lost-names rule is implemented and
    tested on the exact "2 cups 2 cups" input, but on today's data it never fires.
  - bbcgoodfood is still being appended to (2,055 -> 2,130 lines during this run), so a rebuild
    is only repeatable because build_sources pins the line count seen first.
- Open: the course tagger passes its gold bar at 99% but scores 82% on the blind 50, under the
  85% bar. Recommendation: a follow-up that adds modifier rules ("breakfast X" -> breakfast, a
  "salad" of jello/pudding/whip -> dessert) and scores on a fresh blind set labelled after the
  change, since R9's "one pot meals" filter depends on course=main.
