-- corpus.db schema. Owned by `ingest` (ruling R4); `app` generates src/corpus/types.ts from this
-- file with ingest/build/gen_types.py and never edits either by hand. See schema/README.md.
--
-- Conventions the type generator relies on:
--   * one column per line inside CREATE TABLE;
--   * a trailing "-- enum: Name" names the union type of a CHECK (col IN (...)) list;
--   * a trailing "-- bool" marks a 0/1 integer column, "-- json: Type" a JSON text column;
--   * every other trailing comment becomes the field's doc comment;
--   * a "-- type Name: 'a', 'b'" line declares a union used only inside JSON columns.
-- Booleans are 0/1 integers. A nullable tag is NULL when it could not be determined (for example
-- one_pot when the recipe has no usable steps), never a guessed 0.

PRAGMA user_version = 4;

-- type IngredientFlag: 'red_meat', 'poultry', 'fish', 'shellfish', 'animal_derived', 'explicit_meat', 'dairy', 'egg', 'gluten', 'nuts', 'alcohol'
-- type SubContext: 'baking', 'sauce', 'marinade', 'dressing', 'stir_fry', 'braise', 'soup', 'frying', 'garnish', 'dessert', 'beverage', 'any'
-- type SwapVia: 'alternative', 'substitution', 'omit'

-- The version row. schema_version changes whenever a table or column does; the app refuses a
-- corpus.db whose schema_version differs from CORPUS_SCHEMA_VERSION in types.ts.
CREATE TABLE corpus_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
INSERT INTO corpus_meta (key, value) VALUES ('schema_version', '4');

-- One row per recipe that passed the build's drops (ingest/build/curate.py).
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY, -- dense build-local id; the posting lists use it. Not stable across builds.
  key TEXT NOT NULL UNIQUE, -- the raw id "<source>:<native id>", stable across builds: user.db refers to recipes by this
  source TEXT NOT NULL, -- a key of ingest/sources.md
  source_url TEXT,
  video_url TEXT, -- the recipe's video (Food Wishes: YouTube or Vimeo, else the post that plays it); with no steps rows, the method is the video (R17)
  title TEXT NOT NULL,
  servings INTEGER, -- head count: the source's own, else estimated (servings_source; ingest/build/servings.py); NULL when nothing gave one
  servings_source TEXT CHECK (servings_source IN ('source', 'text', 'energy', 'mass')), -- enum: ServingsSource
  yield_text TEXT, -- the source's own yield string, as given; when the source gave none, the counted yield the estimator read from the recipe ("24 cookies")
  total_min INTEGER, -- total minutes; NULL when unknown
  active_min INTEGER, -- hands-on minutes; NULL when unknown
  time_source TEXT CHECK (time_source IN ('source', 'source_partial', 'estimated')), -- enum: TimeSource
  weeknight INTEGER CHECK (weeknight IN (0, 1)), -- bool: total_min <= 30; NULL when total_min is unknown
  cuisine TEXT CHECK (cuisine IN ('indian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'filipino', 'indonesian_malaysian', 'middle_eastern', 'persian', 'turkish', 'greek', 'italian', 'french', 'spanish', 'mediterranean', 'mexican', 'latin_american', 'caribbean', 'american', 'southern_us', 'british_irish', 'german_central_eu', 'north_african', 'east_west_african', 'fusion_other')), -- enum: Cuisine
  cuisine_confidence REAL, -- 1.0 for a mapped source label or a title marker (R20), else the classifier's posterior; NULL with cuisine
  cuisine_source TEXT CHECK (cuisine_source IN ('source_label', 'classifier', 'title_marker')), -- enum: CuisineSource
  course TEXT NOT NULL CHECK (course IN ('main', 'side', 'dessert', 'breakfast', 'snack', 'drink', 'sauce_condiment', 'baking')), -- enum: Course
  one_pot INTEGER CHECK (one_pot IN (0, 1)), -- bool: a single heated vessel (literal, R9); "one pot meals" is one_pot AND course = 'main'
  one_pan INTEGER CHECK (one_pan IN (0, 1)), -- bool
  sheet_pan_meal INTEGER CHECK (sheet_pan_meal IN (0, 1)), -- bool
  stove_and_oven INTEGER CHECK (stove_and_oven IN (0, 1)), -- bool: uses both the hob and the oven
  no_cook INTEGER NOT NULL CHECK (no_cook IN (0, 1)), -- bool: no heat source at all
  image_url TEXT,
  rating REAL, -- the source's own rating, 5-point scale; NULL when unrated
  rating_count INTEGER,
  quality REAL NOT NULL, -- 0..1, ingest/build/curate.py quality_score
  line_count INTEGER NOT NULL, -- ingredient lines
  unresolved_count INTEGER NOT NULL, -- ingredient lines with no slug
  core_slug_count INTEGER NOT NULL, -- distinct non-staple, non-optional slugs: the denominator of "how much can I cover"
  kcal REAL, -- nutrition per serving, estimated from USDA FoodData Central; NULL until that slice lands
  protein_g REAL,
  fat_g REAL,
  carbs_g REAL,
  fiber_g REAL,
  sugar_g REAL,
  sodium_mg REAL
);
CREATE INDEX recipes_by_cuisine ON recipes (cuisine, quality);
CREATE INDEX recipes_by_course ON recipes (course, quality);

-- One row per parsed ingredient item. A line naming two ingredients ("salt and pepper") gives
-- two items with the same line; a section header gives none.
CREATE TABLE recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes (id),
  position INTEGER NOT NULL, -- item order within the recipe, from 0
  line INTEGER NOT NULL, -- the raw ingredient line this item came from, from 0
  qty REAL, -- first number; the low end of a range
  qty_max REAL, -- the high end of a range, else NULL
  unit TEXT CHECK (unit IN ('g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'oz', 'lb', 'pint', 'quart', 'gallon', 'pinch', 'dash', 'drop', 'splash', 'drizzle', 'clove', 'piece', 'slice', 'can', 'jar', 'bottle', 'package', 'bunch', 'sprig', 'stalk', 'head', 'stick', 'sheet', 'leaf', 'handful', 'inch', 'ear', 'cube', 'loaf', 'knob', 'scoop', 'square')), -- enum: Unit
  slug TEXT REFERENCES ingredients (slug), -- canonical ingredient; NULL when the line could not be resolved
  raw TEXT NOT NULL, -- the ingredient line as the source wrote it
  prep TEXT, -- "finely chopped", "drained"
  optional INTEGER NOT NULL CHECK (optional IN (0, 1)), -- bool
  note TEXT,
  pkg_qty REAL, -- container size: "1 (14 oz) can" gives pkg_qty 14, pkg_unit 'oz'
  pkg_unit TEXT CHECK (pkg_unit IN ('g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'oz', 'lb', 'pint', 'quart', 'gallon', 'pinch', 'dash', 'drop', 'splash', 'drizzle', 'clove', 'piece', 'slice', 'can', 'jar', 'bottle', 'package', 'bunch', 'sprig', 'stalk', 'head', 'stick', 'sheet', 'leaf', 'handful', 'inch', 'ear', 'cube', 'loaf', 'knob', 'scoop', 'square')), -- enum: Unit
  PRIMARY KEY (recipe_id, position)
) WITHOUT ROWID;

-- The matching hot path: one row per distinct (slug, recipe). The clustered primary key makes
-- the rows for one slug a contiguous posting list of recipe ids.
CREATE TABLE recipe_slugs (
  slug TEXT NOT NULL,
  recipe_id INTEGER NOT NULL,
  core INTEGER NOT NULL CHECK (core IN (0, 1)), -- bool: used non-optionally and not a staple; only core slugs count toward coverage
  PRIMARY KEY (slug, recipe_id)
) WITHOUT ROWID;

CREATE TABLE steps (
  recipe_id INTEGER NOT NULL REFERENCES recipes (id),
  position INTEGER NOT NULL, -- from 0
  text TEXT NOT NULL,
  PRIMARY KEY (recipe_id, position)
) WITHOUT ROWID;

-- Equipment the method uses, read from the steps (ingest/tag/equipment.py). no_cook is the
-- recipes.no_cook column, not a row here.
CREATE TABLE recipe_equipment (
  recipe_id INTEGER NOT NULL REFERENCES recipes (id),
  equipment TEXT NOT NULL CHECK (equipment IN ('oven', 'stovetop', 'microwave', 'grill', 'broiler', 'air_fryer', 'slow_cooker', 'pressure_cooker', 'rice_cooker', 'deep_fryer', 'smoker', 'toaster', 'toaster_oven', 'sous_vide', 'waffle_iron', 'bread_machine', 'dehydrator', 'campfire', 'steamer', 'food_processor', 'blender', 'immersion_blender', 'mortar_pestle', 'wok', 'stand_mixer', 'hand_mixer', 'dutch_oven', 'cast_iron', 'sheet_pan', 'spice_grinder', 'ice_cream_maker')), -- enum: Equipment
  PRIMARY KEY (recipe_id, equipment)
) WITHOUT ROWID;
CREATE INDEX recipe_equipment_by_kind ON recipe_equipment (equipment, recipe_id);

-- "a blender or food processor": every member of a group is also a recipe_equipment row, and
-- owning any one member of the group satisfies all of them.
CREATE TABLE recipe_equipment_alternatives (
  recipe_id INTEGER NOT NULL REFERENCES recipes (id),
  grp INTEGER NOT NULL, -- group number within the recipe, from 0
  equipment TEXT NOT NULL CHECK (equipment IN ('oven', 'stovetop', 'microwave', 'grill', 'broiler', 'air_fryer', 'slow_cooker', 'pressure_cooker', 'rice_cooker', 'deep_fryer', 'smoker', 'toaster', 'toaster_oven', 'sous_vide', 'waffle_iron', 'bread_machine', 'dehydrator', 'campfire', 'steamer', 'food_processor', 'blender', 'immersion_blender', 'mortar_pestle', 'wok', 'stand_mixer', 'hand_mixer', 'dutch_oven', 'cast_iron', 'sheet_pan', 'spice_grinder', 'ice_cream_maker')), -- enum: Equipment
  PRIMARY KEY (recipe_id, grp, equipment)
) WITHOUT ROWID;

-- Diet per preset (ingest/tag/diet.py, rulings R7 and R8). "Everything" has no row. The app
-- offers vegetarian and no_red_meat. The tagger's vegetarian_strict (R7) is not stored (S19).
-- swaps is stored in a short form: each DietSwap's keys item, slug, use, use_slug, via, sub_id,
-- quality, from_steps are written i, s, u, x, v, b, q, f; via 'substitution', 'alternative',
-- 'omit' as 's', 'a', 'o'; a null value is left out. model.ts decodeDietSwaps reads it.
CREATE TABLE recipe_diet (
  recipe_id INTEGER NOT NULL REFERENCES recipes (id),
  preset TEXT NOT NULL CHECK (preset IN ('vegetarian', 'no_red_meat')), -- enum: DietPreset
  status TEXT NOT NULL CHECK (status IN ('ok', 'adaptable', 'no', 'unknown')), -- enum: DietStatus
  swaps TEXT NOT NULL DEFAULT '[]', -- json: DietSwap[]: stored in the short form, read with decodeDietSwaps (model.ts); what makes an adaptable recipe work; [] unless status = 'adaptable'
  PRIMARY KEY (recipe_id, preset)
) WITHOUT ROWID;

-- The canonical ingredient taxonomy (ingest/taxonomy/ingredients.yaml).
CREATE TABLE ingredients (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- display name
  parent TEXT REFERENCES ingredients (slug), -- the broader slug a variety falls back to (roma_tomato -> tomatoes)
  category TEXT NOT NULL CHECK (category IN ('sauce_condiment', 'vinegar_acid', 'dairy', 'nondairy', 'egg', 'flour_thickener', 'leavener', 'sweetener', 'chocolate_cocoa', 'fat_oil', 'herb', 'spice', 'spice_blend', 'salt', 'aromatic', 'chile', 'alcohol', 'stock', 'protein', 'pantry', 'nut_seed', 'basic', 'vegetable', 'fruit', 'grain', 'cereal', 'pasta_noodle', 'legume', 'bakery', 'snack', 'dessert_sweet', 'beverage', 'prepared', 'nonfood')), -- enum: IngredientCategory
  aisle TEXT NOT NULL CHECK (aisle IN ('produce', 'dairy', 'meat', 'seafood', 'bakery', 'pantry', 'spices', 'international', 'frozen', 'beverages', 'other')), -- enum: Aisle
  flags TEXT NOT NULL DEFAULT '[]', -- json: IngredientFlag[]: the diet flags that are true
  density_g_per_ml REAL, -- for volume <-> mass conversion
  each_g REAL, -- grams in one piece
  is_staple INTEGER NOT NULL CHECK (is_staple IN (0, 1)), -- bool: assumed on hand; ignored by coverage
  usda_hint TEXT, -- search hint for the USDA FoodData Central match
  recipe_count INTEGER NOT NULL DEFAULT 0 -- recipes in this corpus.db that use the slug (any line, optional included)
) WITHOUT ROWID;
CREATE INDEX ingredients_by_parent ON ingredients (parent);

CREATE TABLE ingredient_synonyms (
  synonym TEXT NOT NULL, -- another name, as written in the taxonomy (UK/US/Indian spellings, generic brand names)
  slug TEXT NOT NULL REFERENCES ingredients (slug),
  PRIMARY KEY (synonym, slug)
) WITHOUT ROWID;
CREATE INDEX ingredient_synonyms_by_slug ON ingredient_synonyms (slug);

-- The substitutions table (ingest/subs/substitutions.yaml). Amounts are per one unit of the
-- target: with per_unit NULL every component unit is 'x', a multiple of the target quantity.
CREATE TABLE substitutions (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL REFERENCES ingredients (slug),
  per_unit TEXT, -- the target unit absolute amounts are given for, else NULL
  quality INTEGER NOT NULL CHECK (quality IN (1, 2, 3)), -- 3 hard to tell apart, 2 good, 1 in a pinch
  contexts TEXT NOT NULL, -- json: SubContext[]
  cuisines TEXT NOT NULL, -- json: string[]
  flags TEXT NOT NULL, -- json: IngredientFlag[]: the diet flags of the substitute, computed from its components
  note TEXT,
  flavor_effect TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX substitutions_by_target ON substitutions (target, quality);

CREATE TABLE substitution_components (
  substitution_id TEXT NOT NULL REFERENCES substitutions (id),
  position INTEGER NOT NULL, -- from 0
  slug TEXT NOT NULL REFERENCES ingredients (slug),
  amount REAL NOT NULL,
  unit TEXT NOT NULL, -- 'x' (a multiple of the target quantity) or a unit per substitutions.per_unit
  PRIMARY KEY (substitution_id, position)
) WITHOUT ROWID;

-- Peak months for fresh produce (ingest/cuisine/season.yaml).
CREATE TABLE season (
  slug TEXT PRIMARY KEY REFERENCES ingredients (slug),
  months TEXT NOT NULL, -- json: number[]: 1 = January .. 12 = December
  month_mask INTEGER NOT NULL -- bit (month - 1) set for each peak month
) WITHOUT ROWID;

-- Unit conversion. Volume and mass convert through a base unit; volume <-> mass goes through
-- ingredients.density_g_per_ml, and a count unit ('piece') through ingredients.each_g.
CREATE TABLE units (
  unit TEXT PRIMARY KEY CHECK (unit IN ('g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'oz', 'lb', 'pint', 'quart', 'gallon', 'pinch', 'dash', 'drop', 'splash', 'drizzle', 'clove', 'piece', 'slice', 'can', 'jar', 'bottle', 'package', 'bunch', 'sprig', 'stalk', 'head', 'stick', 'sheet', 'leaf', 'handful', 'inch', 'ear', 'cube', 'loaf', 'knob', 'scoop', 'square')), -- enum: Unit
  dimension TEXT NOT NULL CHECK (dimension IN ('volume', 'mass', 'count')), -- enum: UnitDimension
  to_base REAL -- ml per unit for volume, g per unit for mass; NULL for count units
) WITHOUT ROWID;

-- Full-text search over title, ingredient lines and cuisine. Contentless: a match returns the
-- recipe id as rowid and the text lives in recipes and recipe_ingredients.
CREATE VIRTUAL TABLE recipes_fts USING fts5 (
  title,
  ingredients,
  cuisine,
  content = '',
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- Build bookkeeping, kept in the shipped file as the audit trail of rule 11: what each source
-- gave and why every dropped record was dropped.
CREATE TABLE build_sources (
  source TEXT PRIMARY KEY,
  lines_total INTEGER NOT NULL, -- lines in the raw file when the build first opened it
  quota INTEGER, -- lines to select; NULL for all
  next_line INTEGER NOT NULL, -- resume point: the first raw line not yet committed
  selected INTEGER NOT NULL, -- lines read
  written INTEGER NOT NULL, -- recipes written
  done INTEGER NOT NULL CHECK (done IN (0, 1)) -- bool
) WITHOUT ROWID;

CREATE TABLE build_drops (
  source TEXT NOT NULL,
  reason TEXT NOT NULL, -- one of ingest/build/curate.py DROP_REASONS
  count INTEGER NOT NULL,
  example TEXT, -- the first dropped id (or line number) for this reason
  PRIMARY KEY (source, reason)
) WITHOUT ROWID;
