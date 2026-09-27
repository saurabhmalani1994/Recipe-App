import type { Migration } from './types'

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
]

/** Every table `user.db` owns, in migration order. Used by backup export/import. */
export const USER_DB_TABLES = [
  'settings',
  'favorites',
  'my_recipes',
  'recipe_forks',
  'kitchen_items',
  'plans',
  'plan_entries',
  'grocery_lists',
  'grocery_items',
] as const
