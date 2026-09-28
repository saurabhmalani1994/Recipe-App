import type { Db } from '../../db/types'
import { decodeDietSwaps, type DietSwap } from '../../corpus/model'
import type { Course, Cuisine, DietStatus, Equipment } from '../../corpus/types'
import {
  avoidHits,
  expandAvoid,
  newHiddenTally,
  recordHidden,
  verdictFor,
  type AvoidHit,
  type AvoidList,
  type HiddenTally,
} from './avoid'
import { fittingSwaps, loadSwapTable, recipeContexts, type SwapOption } from './swaps'
import { displayName, expandHave, loadTaxonomy } from './taxonomy'

/**
 * "What can I cook?" (S6; docs/PRODUCT.md Features 1-4). Owner: "put in the ingredients I have,
 * choose a cuisine style (e.g. indian, mediterranean, chinese, italian, etc. etc.) and it can
 * recommend recipes". A pure module over a read-only corpus `Db`: no React, no user.db.
 *
 * 1. Candidates come from SQL shaped like ingest/build/match.sql: the posting list
 *    (`recipe_slugs`, core only) walked by primary key for each slug the cook has, after
 *    expanding it with staples and parent/child slugs (taxonomy.ts), filtered by diet, one-pot
 *    (R9: one_pot AND course = 'main'), cuisine, time, the kitchen's equipment and "use only".
 * 2. For the best `candidatePool` of those (by coverage), each core slug the cook lacks is
 *    checked against the substitution table: a swap of quality >= 2 whose components the cook
 *    has, in a context the recipe cooks in, that the diet allows, makes it "missing, but a
 *    substitute works". Unreadable ingredient lines stay missing (match.sql does the same).
 * 3. Ranking: coverage first, then fewest truly missing, then the corpus quality score, then id.
 */

/** The app's diet presets (state/diet.tsx). 'everything' applies no diet filter. */
export type AppDiet = 'everything' | 'vegetarian' | 'no_red_meat'

export interface MatchQuery {
  /** The kitchen list plus this search's edits. Staples need not be listed. */
  have: string[]
  cuisine: Cuisine | null
  diet: AppDiet
  /** "My kitchen has": a recipe needing anything else is out. null or [] = not set, no filter. */
  kitchen: Equipment[] | null
  /** "Use only…": the recipe uses at least one of these and nothing outside them. */
  useOnly: Equipment[] | null
  /** "One pot meals": one_pot AND course = 'main' (R9). */
  onePot: boolean
  /** Total minutes; a recipe whose time is unknown does not pass. */
  maxMinutes: number | null
  /** Results to return (default 50). */
  limit?: number
  /** Candidates scored for substitutions before the final sort (default max(limit * 4, 200)). */
  candidatePool?: number
  /** S16 "ingredients I avoid" (settingsRepo). Undefined/empty applies no avoid filter. */
  avoid?: AvoidList
}

export interface MissingItem {
  /** null for an ingredient line the parser could not resolve. */
  slug: string | null
  name: string
}

export interface SubstitutableItem {
  slug: string
  name: string
  swap: SwapOption
}

export interface MatchResult {
  id: number
  key: string
  title: string
  course: Course
  cuisine: Cuisine | null
  totalMin: number | null
  quality: number
  /** Core slugs the cook has, over core slugs plus unreadable lines. */
  coverage: number
  covered: number
  needed: number
  /** Truly missing: no substitute on hand. */
  missing: MissingItem[]
  /** Missing, but a substitute works. */
  substitutable: SubstitutableItem[]
  diet: { status: DietStatus; swaps: DietSwap[] } | null
  /** Set on a My Recipe joined in by `features/myRecipes/myRecipeMatch.ts` (S12); absent (falsy)
   * for a corpus recipe. `myRecipeId` is then `key`'s companion for routing to the editor
   * instead of the corpus recipe detail screen. */
  mine?: boolean
  myRecipeId?: string
  /** S16: avoided ingredients this recipe uses (empty when `avoid` was not set, or none hit). A
   * result with a hide-mode hit is never in `results` — it went into `stats.hidden` instead. */
  avoided: AvoidHit[]
}

export interface MatchOutput {
  results: MatchResult[]
  stats: {
    /** Recipes passing every filter with at least one core slug covered. */
    candidates: number
    /** Candidates scored for substitutions (the top of `candidates` by coverage). */
    scored: number
    /** S16: recipes dropped for a hide-mode avoided ingredient (rule 11: counted, not silently
     * dropped — `hiddenNote(hidden)` from `avoid.ts` turns this into "12 hidden: sour cream"). */
    hidden: HiddenTally
  }
}

interface CandidateRow {
  id: number
  key: string
  title: string
  course: Course
  cuisine: Cuisine | null
  total_min: number | null
  quality: number
  core_slug_count: number
  unresolved_count: number
  matched: number
  total: number
  diet_status: DietStatus | null
  diet_swaps: string | null
}

interface LineRow {
  recipe_id: number
  line: number
  slug: string | null
  optional: number
  raw: string
}

/** Recipes needing nothing outside the JSON array bound at `param` (either/or groups honoured). */
function equipmentSubset(param: string): string {
  return `NOT EXISTS (
      SELECT 1 FROM recipe_equipment AS e
      WHERE e.recipe_id = r.id
        AND e.equipment NOT IN (SELECT value FROM json_each(${param}))
        AND NOT EXISTS (
          SELECT 1
          FROM recipe_equipment_alternatives AS a
          JOIN recipe_equipment_alternatives AS b ON b.recipe_id = a.recipe_id AND b.grp = a.grp
          WHERE a.recipe_id = r.id
            AND a.equipment = e.equipment
            AND b.equipment IN (SELECT value FROM json_each(${param}))
        )
    )`
}

const CANDIDATES_SQL = `
WITH have (slug) AS (
  SELECT DISTINCT value FROM json_each(?1)
),
hits AS (
  SELECT rs.recipe_id, count(*) AS matched
  FROM have
  JOIN recipe_slugs AS rs ON rs.slug = have.slug
  WHERE rs.core = 1
  GROUP BY rs.recipe_id
)
SELECT
  r.id, r.key, r.title, r.course, r.cuisine, r.total_min, r.quality,
  r.core_slug_count, r.unresolved_count, hits.matched,
  count(*) OVER () AS total,
  d.status AS diet_status, d.swaps AS diet_swaps
FROM hits
JOIN recipes AS r ON r.id = hits.recipe_id
LEFT JOIN recipe_diet AS d ON d.recipe_id = r.id AND d.preset = ?2
WHERE (?2 IS NULL OR d.status IN ('ok', 'adaptable'))
  AND (?3 = 0 OR (r.one_pot = 1 AND r.course = 'main'))
  AND (?4 IS NULL OR r.cuisine = ?4)
  AND (?5 IS NULL OR r.total_min <= ?5)
  AND (?6 IS NULL OR ${equipmentSubset('?6')})
  AND (?7 IS NULL OR (
    ${equipmentSubset('?7')}
    AND EXISTS (
      SELECT 1 FROM recipe_equipment AS u
      WHERE u.recipe_id = r.id AND u.equipment IN (SELECT value FROM json_each(?7))
    )
  ))
ORDER BY hits.matched * 1.0 / (r.core_slug_count + r.unresolved_count) DESC,
  r.core_slug_count + r.unresolved_count - hits.matched,
  r.quality DESC,
  r.id
LIMIT ?8
`

function nonEmpty<T>(list: T[] | null): T[] | null {
  return list && list.length > 0 ? list : null
}

/**
 * S6b #4: the ranking floor. `orch/reports/S6.md`'s "Open" flagged coverage-first ranking
 * putting tiny recipes at the top of a planted kitchen: on K1, a 2/4 margarita ranked ahead of
 * 3/8 salads (fewer covered, but a higher percentage); on K2, a 1/1 casserole tied the 10/10
 * curry at 100% and only won on a quality tiebreak that happened to go the right way. The floor
 * below stops a recipe covering under 3 non-staple ingredients from ever outranking one that
 * covers more of what the cook has, and — instead of raw coverage — bands coverage into 10
 * percentage-point steps and breaks ties inside a band by covered count, then quality, so a
 * near-tie in percentage no longer swamps "how many things can I actually use".
 *
 * `RANK_LEGACY` keeps the pre-floor ordering reachable (flip it to `true`) so the owner-graded
 * top-10 comparison this brief calls for later can compare both orderings on the same output.
 */
export const RANK_LEGACY = false

/** Below this many covered ingredients, a recipe must not outrank one that covers more. */
const RANK_FLOOR_COVERED = 3

/** 10 percentage points per band (coverage is a 0..1 fraction). */
export const RANK_BAND_WIDTH = 0.1

function compareLegacy(a: MatchResult, b: MatchResult): number {
  return (
    b.coverage - a.coverage ||
    a.missing.length - b.missing.length ||
    b.quality - a.quality ||
    a.id - b.id
  )
}

/** R19: under a diet preset, "ok" outranks "adaptable" within a coverage band (`diet` is null
 * under the Everything preset, so this never distinguishes there). */
function dietRank(status: DietStatus | undefined): number {
  return status === 'adaptable' ? 1 : 0
}

export function compareRanked(a: MatchResult, b: MatchResult): number {
  // The floor: neither side's covered count may be beaten by a tinier recipe's percentage.
  if (a.covered < RANK_FLOOR_COVERED && b.covered > a.covered) return 1
  if (b.covered < RANK_FLOOR_COVERED && a.covered > b.covered) return -1

  const bandA = Math.floor(a.coverage / RANK_BAND_WIDTH)
  const bandB = Math.floor(b.coverage / RANK_BAND_WIDTH)
  if (bandA !== bandB) return bandB - bandA

  return (
    dietRank(a.diet?.status) - dietRank(b.diet?.status) ||
    b.covered - a.covered ||
    b.quality - a.quality ||
    a.missing.length - b.missing.length ||
    a.id - b.id
  )
}

/** `matchRecipes`'s default `limit`, reused by the My Recipes union (`myRecipeMatch.ts`) so a
 * merged, re-sorted list is capped the same way the SQL-only one always was. */
export const DEFAULT_MATCH_LIMIT = 50

/** The ranking `matchRecipes` sorts by (S12: also used to re-sort a corpus + My Recipes union). */
export function compareResults(a: MatchResult, b: MatchResult): number {
  return RANK_LEGACY ? compareLegacy(a, b) : compareRanked(a, b)
}

export async function matchRecipes(db: Db, query: MatchQuery): Promise<MatchOutput> {
  const tax = await loadTaxonomy(db)
  const have = expandHave(tax, query.have)
  const limit = query.limit ?? DEFAULT_MATCH_LIMIT
  const pool = Math.max(query.candidatePool ?? Math.max(limit * 4, 200), limit)
  const kitchen = nonEmpty(query.kitchen)
  const useOnly = nonEmpty(query.useOnly)
  const avoid = query.avoid && query.avoid.size > 0 ? expandAvoid(tax, query.avoid) : null
  const hidden = newHiddenTally()

  const { rows: candidates } = await db.query<CandidateRow>(CANDIDATES_SQL, [
    JSON.stringify([...have]),
    query.diet === 'everything' ? null : query.diet,
    query.onePot ? 1 : 0,
    query.cuisine,
    query.maxMinutes,
    kitchen ? JSON.stringify(kitchen) : null,
    useOnly ? JSON.stringify(useOnly) : null,
    pool,
  ])
  const total = candidates[0]?.total ?? 0
  if (candidates.length === 0) return { results: [], stats: { candidates: 0, scored: 0, hidden } }

  const { rows: lines } = await db.query<LineRow>(
    `SELECT recipe_id, line, slug, optional, raw FROM recipe_ingredients
      WHERE recipe_id IN (SELECT value FROM json_each(?))
      ORDER BY recipe_id, position`,
    [JSON.stringify(candidates.map((c) => c.id))],
  )
  const linesByRecipe = new Map<number, LineRow[]>()
  for (const line of lines) {
    const list = linesByRecipe.get(line.recipe_id)
    if (list) list.push(line)
    else linesByRecipe.set(line.recipe_id, [line])
  }

  // Every core slug the cook lacks, across all candidates, for one substitution query.
  const lackingAll = new Set<string>()
  for (const line of lines) {
    if (line.slug && !line.optional && !have.has(line.slug)) lackingAll.add(line.slug)
  }
  const swapTable = await loadSwapTable(db, tax, lackingAll)

  const results: MatchResult[] = []
  for (const candidate of candidates) {
    const recipeLines = linesByRecipe.get(candidate.id) ?? []
    // Core: used non-optionally and not a staple (the builder's definition of recipe_slugs.core).
    const core = new Set<string>()
    const resolvedLines = new Set<number>()
    const unresolvedRaw = new Map<number, string>()
    for (const line of recipeLines) {
      if (line.slug) {
        resolvedLines.add(line.line)
        if (!line.optional && !tax.staples.has(line.slug)) core.add(line.slug)
      } else if (!unresolvedRaw.has(line.line)) {
        unresolvedRaw.set(line.line, line.raw)
      }
    }
    // S16: hide wins outright (rule 11: tallied, never silently dropped); short of that, "lower"
    // hits drop the coverage band below, applied to `coverage` after it's computed.
    const avoided = avoid ? avoidHits(tax, avoid, core) : []
    const verdict = verdictFor(avoided)
    if (verdict.hide) {
      recordHidden(hidden, avoided)
      continue
    }

    const lacking = [...core].filter((slug) => !have.has(slug))
    const context = {
      contexts: recipeContexts(candidate.course, candidate.title),
      cuisine: candidate.cuisine,
      diet: query.diet,
    }

    const missing: MissingItem[] = []
    const substitutable: SubstitutableItem[] = []
    for (const slug of lacking) {
      const best = fittingSwaps(swapTable, slug, have, context)[0]
      if (best?.haveAll) substitutable.push({ slug, name: displayName(tax, slug), swap: best })
      else missing.push({ slug, name: displayName(tax, slug) })
    }
    // Lines with no slug at all. The builder counts some it never wrote an item for (a heading,
    // a line the parser dropped), so those show as a generic entry.
    const unreadable = [...unresolvedRaw.entries()].filter(([line]) => !resolvedLines.has(line))
    for (const [, raw] of unreadable.slice(0, candidate.unresolved_count)) {
      missing.push({ slug: null, name: raw })
    }
    for (let i = unreadable.length; i < candidate.unresolved_count; i++) {
      missing.push({ slug: null, name: 'an ingredient line that could not be read' })
    }

    const needed = core.size + candidate.unresolved_count
    const covered = core.size - lacking.length
    // S16: "a lower-ranked recipe drops one coverage band per avoided ingredient" — `covered`
    // and `needed` stay the honest counts; only the ranking fraction moves, by RANK_BAND_WIDTH
    // per lower-mode hit.
    const rawCoverage = needed === 0 ? 1 : covered / needed
    const coverage = Math.max(0, rawCoverage - verdict.lowerBy * RANK_BAND_WIDTH)
    results.push({
      id: candidate.id,
      key: candidate.key,
      title: candidate.title,
      course: candidate.course,
      cuisine: candidate.cuisine,
      totalMin: candidate.total_min,
      quality: candidate.quality,
      coverage,
      covered,
      needed,
      missing,
      substitutable,
      avoided,
      diet: candidate.diet_status
        ? {
            status: candidate.diet_status,
            swaps: decodeDietSwaps(candidate.diet_swaps),
          }
        : null,
    })
  }

  results.sort(compareResults)
  return {
    results: results.slice(0, limit),
    stats: { candidates: total, scored: candidates.length, hidden },
  }
}

/** Cook screen readability (S6b #3): the missing list shows at most this many names. */
const MISSING_SUMMARY_SHOWN = 3

/**
 * "missing 1: fish sauce, swap: soy sauce + nori" (null when nothing is missing). At most
 * `MISSING_SUMMARY_SHOWN` names are spelled out; past that it ends in "+N more" instead of
 * running the whole ingredient list into one unreadable line.
 */
export function missingSummary(result: MatchResult): string | null {
  const parts = [
    ...result.substitutable.map(
      (item) => `${item.name}, swap: ${item.swap.components.map((c) => c.name).join(' + ')}`,
    ),
    ...result.missing.map((item) => item.name),
  ]
  if (parts.length === 0) return null
  const shown = parts.slice(0, MISSING_SUMMARY_SHOWN)
  const rest = parts.length - shown.length
  const list = rest > 0 ? `${shown.join('; ')}; +${rest} more` : shown.join('; ')
  return `missing ${parts.length}: ${list}`
}
