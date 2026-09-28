import type { Cuisine, Course } from '../../corpus/types'
import type { Db } from '../../db/types'
import {
  avoidHits,
  expandAvoid,
  loadAvoidHits,
  mergeHiddenTally,
  recordHidden,
  verdictFor,
  type AvoidList,
  type HiddenTally,
} from '../cook/avoid'
import { type AppDiet, matchRecipes } from '../cook/engine'
import { cuisineLabel } from '../cook/labels'
import { expandHave, type Taxonomy } from '../cook/taxonomy'
import { loadCoverage, type Coverage } from './coverage'
import { dailyWindow, seededPick } from './seed'
import type { HomeCard, HomeRow } from './types'

/**
 * Home's four rows (S11 #2, D12 and owner: "a home page that recommends interesting recipes that
 * i could make for when i am not feeling inspired to think for myself"). Pure over a read-only
 * corpus `Db` — no React — like `cook/engine.ts`; `home/homeRepo.ts` is the only caller and is
 * where user.db (favorites, plan history, settings) gets read.
 *
 * Every row is corpus recipes only: fixture/My Recipes have no `recipe_slugs`/`season`/`quality`
 * to rank or match against, so "recommend something" only makes sense over the corpus here.
 */

/** How many candidates a row considers before picking today's window (S11: "fresh set daily"). */
const CANDIDATE_POOL = 40
/** How many cards a row shows by default. */
const DEFAULT_COUNT = 8

interface RecipeSummaryRow {
  id: number
  key: string
  title: string
  cuisine: Cuisine | null
  course: Course
  total_min: number | null
  quality: number
  image_url: string | null
}

const SUMMARY_COLUMNS = 'r.id, r.key, r.title, r.cuisine, r.course, r.total_min, r.quality, r.image_url'

function toCard(row: RecipeSummaryRow, coverage: Map<number, Coverage>, why?: string): HomeCard {
  const cov = coverage.get(row.id) ?? { covered: 0, needed: 0 }
  return {
    key: row.key,
    title: row.title,
    cuisine: row.cuisine,
    totalMin: row.total_min,
    imageUrl: row.image_url,
    covered: cov.covered,
    needed: cov.needed,
    why,
  }
}

/** Null unless a diet preset is active — the shared `(? IS NULL OR d.status IN (...)) ` clause
 * every row's SQL joins `recipe_diet` with. */
function dietParam(diet: AppDiet): string | null {
  return diet === 'everything' ? null : diet
}

async function coverageFor(
  db: Db,
  tax: Taxonomy,
  have: readonly string[],
  ids: readonly number[],
): Promise<Map<number, Coverage>> {
  return loadCoverage(db, expandHave(tax, have), ids)
}

/**
 * S16: applies "ingredients I avoid" to a row's own candidate list, which (unlike
 * `cook/engine.ts`'s SQL side) ranks by quality/similarity rather than a coverage band. A
 * hide-mode hit drops the recipe and is tallied into `tally` (rule 11: never silently); a
 * lower-mode hit keeps it but moves it behind every candidate with no avoided hit, so "ranked
 * lower" holds here the same way it does in Cook (`engine.ts`'s coverage-band drop).
 */
async function applyAvoid<T extends { id: number }>(
  db: Db,
  tax: Taxonomy,
  avoid: AvoidList,
  tally: HiddenTally,
  rows: readonly T[],
): Promise<T[]> {
  if (avoid.size === 0 || rows.length === 0) return [...rows]
  const hits = await loadAvoidHits(db, tax, avoid, rows.map((r) => r.id))
  const kept: T[] = []
  const lowered: T[] = []
  for (const row of rows) {
    const rowHits = hits.get(row.id) ?? []
    const verdict = verdictFor(rowHits)
    if (verdict.hide) {
      recordHidden(tally, rowHits)
      continue
    }
    if (verdict.lowerBy > 0) lowered.push(row)
    else kept.push(row)
  }
  return [...kept, ...lowered]
}

// ---------------------------------------------------------------------------------------------
// a. Cook with what I have
// ---------------------------------------------------------------------------------------------

export interface CookRowParams {
  have: string[]
  diet: AppDiet
  seed: number
  count?: number
  /** S16: forwarded straight to `matchRecipes`, which already hides/lowers by coverage band. */
  avoid?: AvoidList
  hiddenTally?: HiddenTally
}

/** S11 #2a: "the engine's top results, with the floor applied" — `engine.ts` unmodified, the
 * ranking floor (`RANK_FLOOR_COVERED`) is already in effect by default. No `Taxonomy` needed:
 * `matchRecipes` already returns `covered`/`needed` against the same kitchen. */
export async function buildCookRow(db: Db, params: CookRowParams): Promise<HomeRow> {
  const { results, stats } = await matchRecipes(db, {
    have: params.have,
    cuisine: null,
    diet: params.diet,
    kitchen: null,
    useOnly: null,
    onePot: false,
    maxMinutes: null,
    limit: CANDIDATE_POOL,
    avoid: params.avoid,
  })
  if (params.hiddenTally) mergeHiddenTally(params.hiddenTally, stats.hidden)
  const count = params.count ?? DEFAULT_COUNT
  const chosen = dailyWindow(results, count, params.seed, 'cook')
  const images = await imagesFor(
    db,
    chosen.map((r) => r.id),
  )
  return {
    id: 'cook',
    title: 'Cook with what you have',
    cards: chosen.map((r) => ({
      key: r.key,
      title: r.title,
      cuisine: r.cuisine,
      totalMin: r.totalMin,
      imageUrl: images.get(r.id) ?? null,
      covered: r.covered,
      needed: r.needed,
    })),
  }
}

async function imagesFor(db: Db, ids: readonly number[]): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>()
  if (ids.length === 0) return out
  const { rows } = await db.query<{ id: number; image_url: string | null }>(
    'SELECT id, image_url FROM recipes WHERE id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(ids)],
  )
  for (const row of rows) out.set(row.id, row.image_url)
  return out
}

// ---------------------------------------------------------------------------------------------
// b. Explore new cuisines
// ---------------------------------------------------------------------------------------------

export interface ExploreRowParams {
  have: string[]
  diet: AppDiet
  /** Cuisines from the last 30 days of plan entries, plus every favorite's cuisine (S11 #2b). */
  excludeCuisines: ReadonlySet<Cuisine>
  seed: number
  cuisineCount?: number
  perCuisine?: number
  avoid?: AvoidList
  hiddenTally?: HiddenTally
}

const EXPLORE_EMPTY = 'Nothing new to suggest yet — you have cooked a bit of everything lately.'

export async function buildExploreRow(
  db: Db,
  tax: Taxonomy,
  params: ExploreRowParams,
): Promise<HomeRow> {
  const diet = dietParam(params.diet)
  const { rows: cuisineRows } = await db.query<{ cuisine: Cuisine }>(
    `SELECT DISTINCT r.cuisine AS cuisine
       FROM recipes r
       LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
      WHERE r.cuisine IS NOT NULL
        AND (? IS NULL OR d.status IN ('ok', 'adaptable'))`,
    [diet, diet],
  )
  // Sorted before picking so the choice depends only on the seed, not on SQL row order.
  const eligible = [...new Set(cuisineRows.map((r) => r.cuisine))]
    .filter((c) => !params.excludeCuisines.has(c))
    .sort()
  if (eligible.length === 0) {
    return { id: 'explore', title: 'Explore something new', cards: [], emptyMessage: EXPLORE_EMPTY }
  }

  const chosen = seededPick(eligible, params.cuisineCount ?? 2, params.seed, 'explore-cuisines')
  const perCuisine = params.perCuisine ?? 4
  const rowsByCuisine: RecipeSummaryRow[][] = []
  for (const cuisine of chosen) {
    const { rows } = await db.query<RecipeSummaryRow>(
      `SELECT ${SUMMARY_COLUMNS}
         FROM recipes r
         LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
        WHERE r.cuisine = ?
          AND (? IS NULL OR d.status IN ('ok', 'adaptable'))
        ORDER BY r.quality DESC, r.id
        LIMIT ?`,
      [diet, cuisine, diet, perCuisine],
    )
    rowsByCuisine.push(
      params.avoid && params.hiddenTally
        ? await applyAvoid(db, tax, params.avoid, params.hiddenTally, rows)
        : rows,
    )
  }
  const allIds = rowsByCuisine.flat().map((r) => r.id)
  const coverage = await coverageFor(db, tax, params.have, allIds)

  const cards: HomeCard[] = []
  chosen.forEach((cuisine, i) => {
    const why = `You haven't cooked ${cuisineLabel(cuisine)} lately`
    for (const row of rowsByCuisine[i]) cards.push(toCard(row, coverage, why))
  })
  return { id: 'explore', title: 'Explore something new', cards }
}

// ---------------------------------------------------------------------------------------------
// c. Like your favorites
// ---------------------------------------------------------------------------------------------

export interface FavoritesRowParams {
  have: string[]
  diet: AppDiet
  /** `recipes.key`s of the user's corpus favorites (fixture/My Recipes favorites have no slugs
   * to compare against, so they do not seed this row — S11 scope). */
  favoriteKeys: string[]
  seed: number
  count?: number
  avoid?: AvoidList
  hiddenTally?: HiddenTally
}

const FAVORITES_PROMPT = 'Star a recipe you love and this row will fill in with more like it.'
const FAVORITES_NO_MATCH = 'Nothing similar yet — try favoriting a few more recipes.'

/** Similarity = Jaccard over core ingredient slugs, plus a bonus for sharing a favorite's cuisine
 * or course (S11 #2c). */
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const slug of a) if (b.has(slug)) intersection++
  return intersection / (a.size + b.size - intersection)
}

async function coreSlugsByRecipe(db: Db, ids: readonly number[]): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>()
  if (ids.length === 0) return out
  const { rows } = await db.query<{ recipe_id: number; slug: string }>(
    `SELECT recipe_id, slug FROM recipe_slugs
      WHERE core = 1 AND recipe_id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(ids)],
  )
  for (const row of rows) {
    const set = out.get(row.recipe_id) ?? new Set<string>()
    set.add(row.slug)
    out.set(row.recipe_id, set)
  }
  return out
}

export async function buildFavoritesRow(
  db: Db,
  tax: Taxonomy,
  params: FavoritesRowParams,
): Promise<HomeRow> {
  const title = 'Like your favorites'
  if (params.favoriteKeys.length === 0) {
    return { id: 'favorites', title, cards: [], emptyMessage: FAVORITES_PROMPT }
  }

  const { rows: favorites } = await db.query<{
    id: number
    cuisine: Cuisine | null
    course: Course
  }>(
    'SELECT id, cuisine, course FROM recipes WHERE key IN (SELECT value FROM json_each(?))',
    [JSON.stringify(params.favoriteKeys)],
  )
  if (favorites.length === 0) {
    return { id: 'favorites', title, cards: [], emptyMessage: FAVORITES_PROMPT }
  }

  const diet = dietParam(params.diet)
  const cuisines = [...new Set(favorites.map((f) => f.cuisine).filter((c): c is Cuisine => !!c))]
  const courses = [...new Set(favorites.map((f) => f.course))]
  const { rows: candidates } = await db.query<RecipeSummaryRow>(
    `SELECT ${SUMMARY_COLUMNS}
       FROM recipes r
       LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
      WHERE key NOT IN (SELECT value FROM json_each(?))
        AND (r.cuisine IN (SELECT value FROM json_each(?)) OR r.course IN (SELECT value FROM json_each(?)))
        AND (? IS NULL OR d.status IN ('ok', 'adaptable'))
      ORDER BY r.quality DESC, r.id
      LIMIT 100`,
    [
      diet,
      JSON.stringify(params.favoriteKeys),
      JSON.stringify(cuisines),
      JSON.stringify(courses),
      diet,
    ],
  )
  if (candidates.length === 0) {
    return { id: 'favorites', title, cards: [], emptyMessage: FAVORITES_NO_MATCH }
  }

  const [favSlugs, candSlugs] = await Promise.all([
    coreSlugsByRecipe(db, favorites.map((f) => f.id)),
    coreSlugsByRecipe(db, candidates.map((c) => c.id)),
  ])

  // S16: candSlugs already has each candidate's core slugs in hand, so the avoid check is free
  // here (no `loadAvoidHits` query) — a hide-mode hit drops it (tallied), a lower-mode one is
  // scored normally but moved behind every non-avoided candidate below.
  const expandedAvoid =
    params.avoid && params.avoid.size > 0 ? expandAvoid(tax, params.avoid) : null
  const scoredKept: { row: RecipeSummaryRow; score: number }[] = []
  const scoredLowered: { row: RecipeSummaryRow; score: number }[] = []
  for (const candidate of candidates) {
    const candSet = candSlugs.get(candidate.id) ?? new Set<string>()
    const hits = expandedAvoid ? avoidHits(tax, expandedAvoid, candSet) : []
    const verdict = verdictFor(hits)
    if (verdict.hide) {
      if (params.hiddenTally) recordHidden(params.hiddenTally, hits)
      continue
    }
    let best = 0
    for (const fav of favorites) {
      let score = jaccard(candSet, favSlugs.get(fav.id) ?? new Set())
      if (fav.cuisine && fav.cuisine === candidate.cuisine) score += 0.15
      if (fav.course === candidate.course) score += 0.1
      if (score > best) best = score
    }
    ;(verdict.lowerBy > 0 ? scoredLowered : scoredKept).push({ row: candidate, score: best })
  }
  const byScore = (a: { row: RecipeSummaryRow; score: number }, b: { row: RecipeSummaryRow; score: number }) =>
    b.score - a.score || b.row.quality - a.row.quality || a.row.id - b.row.id
  scoredKept.sort(byScore)
  scoredLowered.sort(byScore)
  const ranked = [...scoredKept, ...scoredLowered].map((s) => s.row)
  const count = params.count ?? DEFAULT_COUNT
  const chosen = dailyWindow(ranked, count, params.seed, 'favorites')
  const coverage = await coverageFor(db, tax, params.have, chosen.map((c) => c.id))
  return { id: 'favorites', title, cards: chosen.map((row) => toCard(row, coverage)) }
}

// ---------------------------------------------------------------------------------------------
// d. Seasonal / weeknight
// ---------------------------------------------------------------------------------------------

export interface SeasonalRowParams {
  have: string[]
  diet: AppDiet
  /** Which day this row is for — weekday vs. weekend, and the month for the season table. */
  date: Date
  seed: number
  count?: number
  avoid?: AvoidList
  hiddenTally?: HiddenTally
}

const WEEKEND_EMPTY = 'No weekend project recipes matched yet.'
const WEEKNIGHT_EMPTY = 'Nothing in season matched this month yet.'

/** `date.getDay()`: 0 = Sunday, 6 = Saturday. */
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export async function buildSeasonalRow(
  db: Db,
  tax: Taxonomy,
  params: SeasonalRowParams,
): Promise<HomeRow> {
  const diet = dietParam(params.diet)
  const weekend = isWeekend(params.date)
  const month = params.date.getMonth() + 1 // 1 = January

  let rows: RecipeSummaryRow[]
  let title: string
  let emptyMessage: string
  if (weekend) {
    title = 'Weekend project'
    emptyMessage = WEEKEND_EMPTY
    rows = (
      await db.query<RecipeSummaryRow>(
        `SELECT ${SUMMARY_COLUMNS}
           FROM recipes r
           LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
          WHERE (r.weeknight = 0 OR r.weeknight IS NULL)
            AND r.total_min IS NOT NULL
            AND (? IS NULL OR d.status IN ('ok', 'adaptable'))
          ORDER BY r.quality DESC, r.id
          LIMIT ?`,
        [diet, diet, CANDIDATE_POOL],
      )
    ).rows
  } else {
    title = 'Quick weeknight, in season'
    emptyMessage = WEEKNIGHT_EMPTY
    const { rows: seasonRows } = await db.query<{ slug: string }>(
      'SELECT slug FROM season WHERE (month_mask >> ?) & 1 = 1',
      [month - 1],
    )
    const seasonSlugs = seasonRows.map((r) => r.slug)
    rows =
      seasonSlugs.length === 0
        ? []
        : (
            await db.query<RecipeSummaryRow>(
              `SELECT DISTINCT ${SUMMARY_COLUMNS}
                 FROM recipes r
                 JOIN recipe_slugs rs ON rs.recipe_id = r.id AND rs.core = 1
                 LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
                WHERE r.weeknight = 1
                  AND rs.slug IN (SELECT value FROM json_each(?))
                  AND (? IS NULL OR d.status IN ('ok', 'adaptable'))
                ORDER BY r.quality DESC, r.id
                LIMIT ?`,
              [diet, JSON.stringify(seasonSlugs), diet, CANDIDATE_POOL],
            )
          ).rows
  }

  if (params.avoid && params.hiddenTally) {
    rows = await applyAvoid(db, tax, params.avoid, params.hiddenTally, rows)
  }

  const count = params.count ?? DEFAULT_COUNT
  const chosen = dailyWindow(rows, count, params.seed, 'seasonal')
  const coverage = await coverageFor(db, tax, params.have, chosen.map((c) => c.id))
  return {
    id: 'seasonal',
    title,
    cards: chosen.map((row) => toCard(row, coverage)),
    emptyMessage: rows.length === 0 ? emptyMessage : undefined,
  }
}
