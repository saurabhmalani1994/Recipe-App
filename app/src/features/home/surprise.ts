import type { Cuisine, CuisineSource, Course } from '../../corpus/types'
import type { Db } from '../../db/types'
import { loadAvoidHits, recordHidden, verdictFor, type AvoidList, type HiddenTally } from '../cook/avoid'
import type { AppDiet } from '../cook/engine'
import { cuisineTag } from '../cook/labels'
import { expandHave, type Taxonomy } from '../cook/taxonomy'
import { loadCoverage } from './coverage'
import type { HomeCard } from './types'

/** S11 #2: "Surprise me" — one random high-quality recipe that passes the diet filter. Unlike the
 * four rows this is not date-seeded: each tap should be able to give something different, so the
 * caller supplies `random` (defaulting to `Math.random`) rather than a day's seed. */
export interface SurpriseParams {
  have: string[]
  diet: AppDiet
  qualityFloor?: number
  random?: () => number
  /** S16 "ingredients I avoid": a hide-mode hit takes the recipe out of the draw entirely
   * (tallied into `hiddenTally`, rule 11); a lower-mode hit is only drawn when nothing avoid-free
   * qualifies. */
  avoid?: AvoidList
  hiddenTally?: HiddenTally
}

const DEFAULT_QUALITY_FLOOR = 0.6

interface RecipeSummaryRow {
  id: number
  key: string
  title: string
  cuisine: Cuisine | null
  cuisine_source: CuisineSource | null
  cuisine_confidence: number | null
  course: Course
  total_min: number | null
  quality: number
  image_url: string | null
}

export async function pickSurprise(
  db: Db,
  tax: Taxonomy,
  params: SurpriseParams,
): Promise<HomeCard | null> {
  const diet = params.diet === 'everything' ? null : params.diet
  const floor = params.qualityFloor ?? DEFAULT_QUALITY_FLOOR
  const { rows } = await db.query<RecipeSummaryRow>(
    `SELECT r.id, r.key, r.title, r.cuisine, r.cuisine_source, r.cuisine_confidence, r.course,
            r.total_min, r.quality, r.image_url
       FROM recipes r
       LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
      WHERE r.quality >= ?
        AND (? IS NULL OR d.status IN ('ok', 'adaptable'))`,
    [diet, floor, diet],
  )
  if (rows.length === 0) return null

  let pool = rows
  if (params.avoid && params.avoid.size > 0) {
    const hitsByRecipe = await loadAvoidHits(db, tax, params.avoid, rows.map((r) => r.id))
    const kept: RecipeSummaryRow[] = []
    const lowered: RecipeSummaryRow[] = []
    for (const candidate of rows) {
      const hits = hitsByRecipe.get(candidate.id) ?? []
      const verdict = verdictFor(hits)
      if (verdict.hide) {
        if (params.hiddenTally) recordHidden(params.hiddenTally, hits)
        continue
      }
      ;(verdict.lowerBy > 0 ? lowered : kept).push(candidate)
    }
    // "Ranked lower": only reach into the avoided-lower pool when nothing avoid-free qualifies.
    pool = kept.length > 0 ? kept : lowered
    if (pool.length === 0) return null
  }

  const rand = params.random ?? Math.random
  const row = pool[Math.floor(rand() * pool.length)]
  const coverage = await loadCoverage(db, expandHave(tax, params.have), [row.id])
  const cov = coverage.get(row.id) ?? { covered: 0, needed: 0 }
  return {
    key: row.key,
    title: row.title,
    cuisine: row.cuisine,
    cuisineTag: cuisineTag(row.cuisine, row.cuisine_source, row.cuisine_confidence),
    course: row.course,
    totalMin: row.total_min,
    imageUrl: row.image_url,
    covered: cov.covered,
    needed: cov.needed,
  }
}
