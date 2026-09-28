import type { Db } from '../../db/types'
import type { DietSwap } from '../../corpus/model'
import type {
  Course,
  Cuisine,
  DietStatus,
  Equipment,
  ServingsSource,
  Unit,
} from '../../corpus/types'
import { targetServings } from '../scaling/scale'
import { convertAmount, formatAmount, type UnitSystem, type UnitTable } from '../units/units'
import type { AppDiet } from './engine'
import { fittingSwaps, loadSwapTable, recipeContexts, type SwapOption } from './swaps'
import { displayName, type Taxonomy } from './taxonomy'

/** A corpus recipe as the detail screen shows it (S6). Looked up by the stable `recipes.key`. */
export interface CorpusRecipe {
  id: number
  key: string
  title: string
  sourceUrl: string | null
  /** R17: the recipe's video. With no `steps` rows, the method is the video, not text. */
  videoUrl: string | null
  servings: number | null
  /** 'source' when the recipe states it; otherwise estimated at build time (S15) */
  servingsSource: ServingsSource | null
  yieldText: string | null
  totalMin: number | null
  activeMin: number | null
  cuisine: Cuisine | null
  course: Course
  onePot: boolean
  noCook: boolean
  equipment: Equipment[]
  lines: CorpusLine[]
  steps: string[]
  diet: { status: DietStatus; swaps: DietSwap[] } | null
}

export interface CorpusLine {
  position: number
  line: number
  qty: number | null
  qtyMax: number | null
  unit: Unit | null
  slug: string | null
  name: string | null
  raw: string
  prep: string | null
  optional: boolean
  note: string | null
  pkgQty: number | null
  pkgUnit: Unit | null
}

interface RecipeRow {
  id: number
  key: string
  title: string
  source_url: string | null
  video_url: string | null
  servings: number | null
  servings_source: ServingsSource | null
  yield_text: string | null
  total_min: number | null
  active_min: number | null
  cuisine: Cuisine | null
  course: Course
  one_pot: number | null
  no_cook: number
}

interface IngredientRow {
  position: number
  line: number
  qty: number | null
  qty_max: number | null
  unit: Unit | null
  slug: string | null
  raw: string
  prep: string | null
  optional: number
  note: string | null
  pkg_qty: number | null
  pkg_unit: Unit | null
}

export async function loadCorpusRecipe(
  db: Db,
  tax: Taxonomy,
  key: string,
  diet: AppDiet,
): Promise<CorpusRecipe | null> {
  const { rows } = await db.query<RecipeRow>(
    `SELECT id, key, title, source_url, video_url, servings, servings_source, yield_text,
            total_min, active_min, cuisine, course, one_pot, no_cook
       FROM recipes WHERE key = ?`,
    [key],
  )
  const row = rows[0]
  if (!row) return null
  const [ingredients, steps, equipment, dietRows] = await Promise.all([
    db.query<IngredientRow>(
      `SELECT position, line, qty, qty_max, unit, slug, raw, prep, optional, note, pkg_qty,
              pkg_unit
         FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position`,
      [row.id],
    ),
    db.query<{ text: string }>('SELECT text FROM steps WHERE recipe_id = ? ORDER BY position', [
      row.id,
    ]),
    db.query<{ equipment: Equipment }>(
      'SELECT equipment FROM recipe_equipment WHERE recipe_id = ? ORDER BY equipment',
      [row.id],
    ),
    diet === 'everything'
      ? Promise.resolve({ rows: [] as { status: DietStatus; swaps: string }[] })
      : db.query<{ status: DietStatus; swaps: string }>(
          'SELECT status, swaps FROM recipe_diet WHERE recipe_id = ? AND preset = ?',
          [row.id, diet],
        ),
  ])
  const dietRow = dietRows.rows[0]
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    sourceUrl: row.source_url,
    videoUrl: row.video_url,
    servings: row.servings,
    servingsSource: row.servings_source,
    yieldText: row.yield_text,
    totalMin: row.total_min,
    activeMin: row.active_min,
    cuisine: row.cuisine,
    course: row.course,
    onePot: row.one_pot === 1,
    noCook: row.no_cook === 1,
    equipment: equipment.rows.map((e) => e.equipment),
    lines: ingredients.rows.map((i) => ({
      position: i.position,
      line: i.line,
      qty: i.qty,
      qtyMax: i.qty_max,
      unit: i.unit,
      slug: i.slug,
      name: i.slug ? displayName(tax, i.slug) : null,
      raw: i.raw,
      prep: i.prep,
      optional: i.optional === 1,
      note: i.note,
      pkgQty: i.pkg_qty,
      pkgUnit: i.pkg_unit,
    })),
    steps: steps.rows.map((s) => s.text),
    diet: dietRow
      ? { status: dietRow.status, swaps: JSON.parse(dietRow.swaps) as DietSwap[] }
      : null,
  }
}

/**
 * How much to multiply the corpus quantities by (D11: 1.5 servings per person, rounded up). An
 * estimated head count (servingsSource not 'source', S15) scales like a stated one; a recipe with
 * no head count at all is not scaled.
 */
export function corpusScale(
  recipe: CorpusRecipe,
  people: number,
  servingsPerPerson: number,
): { factor: number; target: number | null } {
  if (!recipe.servings || recipe.servings <= 0) return { factor: 1, target: null }
  const target = targetServings(people, servingsPerPerson)
  return { factor: target / recipe.servings, target }
}

/** One ingredient line as shown: "125 g all-purpose flour, sifted" (scaled and converted). */
export function formatLine(
  line: CorpusLine,
  factor: number,
  system: UnitSystem,
  units: UnitTable,
  tax: Taxonomy,
): string {
  if (line.qty === null || !line.slug) return line.raw
  const density = tax.density.get(line.slug) ?? null
  const amount = convertAmount(
    {
      qty: line.qty * factor,
      qtyMax: line.qtyMax === null ? null : line.qtyMax * factor,
      unit: line.unit,
    },
    system,
    units,
    density,
  )
  let text = formatAmount(amount)
  if (line.pkgQty !== null && line.pkgUnit) {
    // "1 can (14 oz)": the package size is not scaled, only converted.
    const pkg = convertAmount(
      { qty: line.pkgQty, qtyMax: null, unit: line.pkgUnit },
      system,
      units,
      density,
    )
    text += ` (${formatAmount(pkg)})`
  }
  text += ` ${line.name}`
  if (line.prep) text += `, ${line.prep}`
  if (line.optional) text += ' (optional)'
  return text
}

/** The best fitting swap for each slug in the recipe (quality >= 2), preferring ones on hand. */
export async function recipeSwaps(
  db: Db,
  tax: Taxonomy,
  recipe: CorpusRecipe,
  have: Set<string>,
  diet: AppDiet,
): Promise<Map<string, SwapOption>> {
  // Staples (salt, water, neutral oil, ...) are assumed on hand, so they get no swap.
  const slugs = [
    ...new Set(
      recipe.lines.map((l) => l.slug).filter((s): s is string => !!s && !tax.staples.has(s)),
    ),
  ]
  const table = await loadSwapTable(db, tax, slugs)
  const context = {
    contexts: recipeContexts(recipe.course, recipe.title),
    cuisine: recipe.cuisine,
    diet,
  }
  const out = new Map<string, SwapOption>()
  for (const slug of slugs) {
    const best = fittingSwaps(table, slug, have, context)[0]
    if (best) out.set(slug, best)
  }
  return out
}
