# Schemas

`ingest` owns both files here (ruling R4). `app` reads them and never edits them.

| File | What it is |
|---|---|
| `raw_recipe.md` | The JSONL shape every fetcher writes to `/home/user/recipe-data/raw/<source>/recipes.jsonl`. |
| `corpus.sql` | The `corpus.db` schema: the one contract between `ingest` and `app`. |

## corpus.db

Built by `python3 -m ingest.build.build_corpus` (`--sample` for the 5k sample, `--all` for
everything). The curated build is committed at `corpus/corpus.db` through git LFS (S19, by the
orchestrator's brief; R5 said a Release asset), and CI's APK build bundles it with
`CORPUS_DB_FILE=corpus/corpus.db`. A 300-recipe build lives at `app/src/corpus/fixture.db` for the
app's dev, tests and web build (`python3 -m ingest.build.make_fixture`; a schema bump that changes
no recipe row is carried over with `--migrate OLD`).

Schema 4 (S19): `cuisine_source` gains `title_marker` (R20), `recipe_diet` stores only the
`vegetarian` and `no_red_meat` presets, and `recipe_diet.swaps` uses the short keys described in
`corpus.sql` (the app reads it with `decodeDietSwaps`).

### Versioning

`corpus_meta` holds `schema_version` (also `PRAGMA user_version`). Bump it in `corpus.sql`
whenever a table or column changes, then run `python3 ingest/build/gen_types.py`, which
rewrites `app/src/corpus/types.ts` (including `CORPUS_SCHEMA_VERSION`). The app should refuse a
corpus.db whose `schema_version` is not its own. `ingest/build/test_build.py` fails when
`types.ts` is stale or `fixture.db` does not match the schema.

### Tables

| Table | One row per | Notes |
|---|---|---|
| `recipes` | recipe | video_url (R17: Food Wishes' video; a recipe with no `steps` rows is cooked from it), times, weeknight, cuisine (+ confidence, source), course, one_pot / one_pan / sheet_pan_meal / stove_and_oven / no_cook, quality, counts, nutrition per serving (NULL for now). |
| `recipe_ingredients` | parsed ingredient item | qty, qty_max, unit, slug, raw line, prep, optional, note, pkg_qty, pkg_unit. |
| `recipe_slugs` | distinct (slug, recipe) | The posting lists for matching; `core` marks non-staple, non-optional use. |
| `steps` | step | In order from 0. |
| `recipe_equipment` | (recipe, equipment) | From the steps. `no_cook` is a `recipes` column instead. |
| `recipe_equipment_alternatives` | member of an either/or group | Owning one member covers the group. |
| `recipe_diet` | (recipe, preset) | vegetarian, no_red_meat, vegetarian_strict; status ok / adaptable / no / unknown; swaps JSON. |
| `ingredients` | taxonomy slug | name, parent, category, aisle, flags JSON, density, each_g, is_staple, usda_hint, recipe_count. |
| `ingredient_synonyms` | (synonym, slug) | For search by any name. |
| `substitutions`, `substitution_components` | swap, and its parts | The curated table; `flags` computed from the components. |
| `season` | produce slug | Peak months as JSON and as a bit mask. |
| `units` | canonical unit | dimension and factor to ml or g. |
| `recipes_fts` | recipe (FTS5, contentless) | title, ingredient lines, cuisine; rowid = `recipes.id`. |
| `build_sources`, `build_drops` | source; (source, reason) | The build's audit trail: every dropped record counted with a reason (rule 11). |

### Ids

`recipes.id` is dense and build-local; the posting lists use it and it changes between builds.
`recipes.key` (`<source>:<native id>`) is stable, and anything in `user.db` that points at a
corpus recipe (favorites, forks, the plan) should store the key.

### Conventions

- Booleans are 0/1 integers. A tag that could not be determined is NULL, not 0 (one_pot is NULL
  when the steps are missing; weeknight is NULL when the time is unknown).
- Enum columns carry `CHECK (col IN (...))`. The lists come from their owners and a test keeps
  them in sync: cuisines from `ingest/cuisine/cuisines.yaml`, equipment from
  `ingest/tag/equipment.py`, units from `ingest/parse/units.py`, categories, aisles and flags
  from `ingest/taxonomy/taxonomy.py`, substitution contexts from `ingest/subs/validate.py`, and
  courses from `ingest/build/course.py`. The builder writes NULL for a value outside a list and
  counts it in `corpus_meta` (`coerced.<table>.<column>`).
- JSON columns are written with sorted keys and no spaces.
- "One pot meals" in the app is `one_pot = 1 AND course = 'main'` (R9); one_pot itself stays
  literal (a single heated vessel).

### Matching

`ingest/build/match.sql` is the "what can I cook?" query: recipes covering most of the cook's
slugs, filtered by diet, equipment, one-pot, cuisine and time. It walks `recipe_slugs` by
primary key for each slug the cook has (the posting list), groups by recipe, and looks each
candidate up by primary key in `recipes`, `recipe_diet` and `recipe_equipment`.
`python3 -m ingest.build.explain_match` prints its query plan and timings on the sample build.
