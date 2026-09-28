import { FIXTURE_RECIPES } from '../../corpus/fixture'
import type { Cuisine } from '../../corpus/types'
import type { Db } from '../../db/types'
import { hiddenNote, newHiddenTally, type AvoidList } from '../cook/avoid'
import type { AppDiet } from '../cook/engine'
import type { Taxonomy } from '../cook/taxonomy'
import { listFavorites } from '../favorites/favoritesRepo'
import { isoDate, listPlanEntriesInRange } from '../plan/planRepo'
import { buildCookRow, buildExploreRow, buildFavoritesRow, buildSeasonalRow } from './rows'
import { seedFromDate } from './seed'
import type { HomeRow } from './types'

/** "Cuisines not in the last 30 days of plan entries and favorites" (S11 #2b). */
const RECENT_DAYS = 30

export interface HomeOptions {
  have: string[]
  diet: AppDiet
  /** Defaults to now; a fixed date makes the whole page reproducible in tests. */
  date?: Date
  /** S16 "ingredients I avoid" (settingsRepo). Undefined/empty applies no avoid filter. */
  avoid?: AvoidList
}

export interface HomeResult {
  rows: HomeRow[]
  /** "12 hidden: sour cream" across every row combined (rule 11: never a silent drop), or null
   * when nothing was hidden. */
  hiddenNote: string | null
}

/** Every cuisine `FIXTURE_RECIPES` cooks, by id — fixture recipes carry no corpus row to look
 * their cuisine up from. */
const FIXTURE_CUISINE = new Map(FIXTURE_RECIPES.map((r) => [r.id, r.cuisine]))

async function corpusCuisines(db: Db, keys: readonly string[]): Promise<Cuisine[]> {
  if (keys.length === 0) return []
  const { rows } = await db.query<{ cuisine: Cuisine | null }>(
    `SELECT DISTINCT cuisine FROM recipes
      WHERE key IN (SELECT value FROM json_each(?)) AND cuisine IS NOT NULL`,
    [JSON.stringify(keys)],
  )
  return rows.flatMap((r) => (r.cuisine ? [r.cuisine] : []))
}

/** Cuisines to steer Explore away from: recently planned (any source, last 30 days) plus every
 * favorite's cuisine (any source, all time) — S11 #2b. */
async function excludedCuisines(db: Db, date: Date): Promise<Set<Cuisine>> {
  const from = new Date(date)
  from.setDate(from.getDate() - RECENT_DAYS)
  const [entries, favorites] = await Promise.all([
    listPlanEntriesInRange(isoDate(from), isoDate(date)),
    listFavorites(),
  ])

  const excluded = new Set<Cuisine>()
  const corpusEntryKeys: string[] = []
  for (const entry of entries) {
    if (entry.recipeSource === 'corpus') corpusEntryKeys.push(entry.recipeId)
    else if (entry.recipeSource === 'fixture') {
      const cuisine = FIXTURE_CUISINE.get(entry.recipeId)
      if (cuisine) excluded.add(cuisine)
    }
  }
  const corpusFavoriteKeys: string[] = []
  for (const favorite of favorites) {
    if (favorite.recipeSource === 'corpus') corpusFavoriteKeys.push(favorite.recipeId)
    else if (favorite.recipeSource === 'fixture') {
      const cuisine = FIXTURE_CUISINE.get(favorite.recipeId)
      if (cuisine) excluded.add(cuisine)
    }
  }
  for (const cuisine of await corpusCuisines(db, [...corpusEntryKeys, ...corpusFavoriteKeys])) {
    excluded.add(cuisine)
  }
  return excluded
}

/** Assembles Home's four rows (S11 #2): reads user.db (favorites, plan history) here so
 * `home/rows.ts` stays a pure module over the corpus, like `cook/engine.ts`. S16: one avoid tally
 * shared across all four rows, so "12 hidden: sour cream" counts the whole page, not just one
 * row. */
export async function loadHomeRows(db: Db, tax: Taxonomy, opts: HomeOptions): Promise<HomeResult> {
  const date = opts.date ?? new Date()
  const seed = seedFromDate(date)
  const [favorites, exclude] = await Promise.all([listFavorites(), excludedCuisines(db, date)])
  const corpusFavoriteKeys = favorites
    .filter((f) => f.recipeSource === 'corpus')
    .map((f) => f.recipeId)

  const hiddenTally = newHiddenTally()
  const rows = await Promise.all([
    buildCookRow(db, { have: opts.have, diet: opts.diet, seed, avoid: opts.avoid, hiddenTally }),
    buildExploreRow(db, tax, {
      have: opts.have,
      diet: opts.diet,
      excludeCuisines: exclude,
      seed,
      avoid: opts.avoid,
      hiddenTally,
    }),
    buildFavoritesRow(db, tax, {
      have: opts.have,
      diet: opts.diet,
      favoriteKeys: corpusFavoriteKeys,
      seed,
      avoid: opts.avoid,
      hiddenTally,
    }),
    buildSeasonalRow(db, tax, {
      have: opts.have,
      diet: opts.diet,
      date,
      seed,
      avoid: opts.avoid,
      hiddenTally,
    }),
  ])
  return { rows, hiddenNote: hiddenNote(hiddenTally) }
}
