import type { Cuisine, Course } from '../../corpus/types'
import type { Db } from '../../db/types'
import type { AppDiet } from '../cook/engine'
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
}

const DEFAULT_QUALITY_FLOOR = 0.6

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

export async function pickSurprise(
  db: Db,
  tax: Taxonomy,
  params: SurpriseParams,
): Promise<HomeCard | null> {
  const diet = params.diet === 'everything' ? null : params.diet
  const floor = params.qualityFloor ?? DEFAULT_QUALITY_FLOOR
  const { rows } = await db.query<RecipeSummaryRow>(
    `SELECT r.id, r.key, r.title, r.cuisine, r.course, r.total_min, r.quality, r.image_url
       FROM recipes r
       LEFT JOIN recipe_diet d ON d.recipe_id = r.id AND d.preset = ?
      WHERE r.quality >= ?
        AND (? IS NULL OR d.status IN ('ok', 'adaptable'))`,
    [diet, floor, diet],
  )
  if (rows.length === 0) return null
  const rand = params.random ?? Math.random
  const row = rows[Math.floor(rand() * rows.length)]
  const coverage = await loadCoverage(db, expandHave(tax, params.have), [row.id])
  const cov = coverage.get(row.id) ?? { covered: 0, needed: 0 }
  return {
    key: row.key,
    title: row.title,
    cuisine: row.cuisine,
    totalMin: row.total_min,
    imageUrl: row.image_url,
    covered: cov.covered,
    needed: cov.needed,
  }
}
