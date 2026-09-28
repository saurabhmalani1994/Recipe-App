import type { Migration } from './types'

/**
 * Pantry staples pre-seeded into `kitchen_items` (brief S7a #1): salt, pepper, neutral oil,
 * water, plus sugar, flour, butter and olive oil, which the user can untick. Slugs match
 * `ingest/taxonomy/ingredients.yaml`.
 */
export const PANTRY_DEFAULT_SLUGS = [
  'salt',
  'black_pepper',
  'neutral_oil',
  'water',
  'sugar',
  'all_purpose_flour',
  'butter',
  'olive_oil',
] as const

/**
 * `user.db` migration v1. Ruling R3: metric by default, a toggle per recipe. Owner (D11):
 * "1.5 servings worth per person", default 2 people -> 3 servings, rate configurable.
 */
export const USER_DB_MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        people_default INTEGER NOT NULL DEFAULT 2,
        servings_per_person REAL NOT NULL DEFAULT 1.5,
        units TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'us')),
        diet_preset TEXT NOT NULL DEFAULT 'everything'
          CHECK (diet_preset IN ('everything', 'vegetarian', 'no_red_meat'))
      )`,
      `INSERT INTO settings (id) VALUES (1)`,
      `CREATE TABLE favorites (
        recipe_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE my_recipes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE recipe_forks (
        id TEXT PRIMARY KEY,
        parent_recipe_id TEXT NOT NULL,
        diff TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE kitchen_items (
        ingredient_id TEXT PRIMARY KEY,
        quantity REAL,
        unit TEXT,
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE plans (
        id TEXT PRIMARY KEY,
        week_start TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE plan_entries (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES plans(id),
        day TEXT NOT NULL,
        meal TEXT NOT NULL,
        recipe_id TEXT,
        people INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE grocery_lists (
        id TEXT PRIMARY KEY,
        plan_id TEXT REFERENCES plans(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE grocery_items (
        id TEXT PRIMARY KEY,
        grocery_list_id TEXT NOT NULL REFERENCES grocery_lists(id),
        canonical_ingredient TEXT NOT NULL,
        quantity REAL,
        unit TEXT,
        aisle TEXT,
        checked INTEGER NOT NULL DEFAULT 0
      )`,
    ],
  },
  {
    // S7a: settings screen ("my kitchen has" equipment) and pantry staple defaults.
    // docs/PRODUCT.md #3 (equipment) and #7 (kitchen list, "staples are pre-seeded").
    version: 2,
    statements: [
      `CREATE TABLE kitchen_equipment (
        equipment_id TEXT PRIMARY KEY,
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Pantry staples pre-seeded into the kitchen list. The user can untick any of them,
      // which just removes the row (see src/features/kitchen/kitchenRepo.ts).
      ...PANTRY_DEFAULT_SLUGS.map(
        (slug) => `INSERT OR IGNORE INTO kitchen_items (ingredient_id) VALUES ('${slug}')`,
      ),
    ],
  },
  {
    // S7: weekly planner and grocery list (docs/PRODUCT.md #5-7).
    // - plan_entries: which recipe (corpus/fixture/my recipe) a day+meal points at, denormalised
    //   with its source and title so the Plan grid never needs corpus.db just to list itself.
    // - settings.show_breakfast: the planner's "a setting turns on breakfast" (brief #1).
    // - grocery_items.note / .manual: the raw text a line couldn't be parsed from ("Check
    //   these", rule 11) and the flag for a manually typed extra item ("paper towels").
    version: 3,
    statements: [
      `ALTER TABLE plan_entries ADD COLUMN recipe_source TEXT NOT NULL DEFAULT 'corpus'`,
      `ALTER TABLE plan_entries ADD COLUMN recipe_title TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE settings ADD COLUMN show_breakfast INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE grocery_items ADD COLUMN note TEXT`,
      `ALTER TABLE grocery_items ADD COLUMN manual INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    // S7c: the shoppable list. A line is shown in shop units ("lemons", "garlic 1 head") and can
    // be tapped to show which planned recipes asked for it.
    // - grocery_items.display_name: the name as shown to the shopper (plural when more than one
    //   piece: "lemons"); null for rows written before v4, which fall back to the slug's name.
    // - grocery_items.sources: JSON array of the recipe titles the line came from.
    version: 4,
    statements: [
      `ALTER TABLE grocery_items ADD COLUMN display_name TEXT`,
      `ALTER TABLE grocery_items ADD COLUMN sources TEXT`,
    ],
  },
  {
    // S13: My Recipes (and forks) store what the ingredient parser understood beside the raw
    // lines, so they scale, shop and match like corpus recipes.
    // - my_recipes.parsed: JSON array aligned with data.ingredients, one { raw, items } per line;
    //   items are { slug, qty, qtyMax, unit, pkgQty, pkgUnit, optional }.
    // - my_recipes.parser_version: the parser (src/parse PARSER_VERSION) that wrote it.
    // Rows from before v5 have neither and are parsed on read (features/myRecipes/lines.ts).
    version: 5,
    statements: [
      `ALTER TABLE my_recipes ADD COLUMN parsed TEXT`,
      `ALTER TABLE my_recipes ADD COLUMN parser_version INTEGER`,
    ],
  },
]

/** Every table `user.db` owns, in migration order. Used by backup export/import. */
export const USER_DB_TABLES = [
  'settings',
  'favorites',
  'my_recipes',
  'recipe_forks',
  'kitchen_items',
  'kitchen_equipment',
  'plans',
  'plan_entries',
  'grocery_lists',
  'grocery_items',
] as const
