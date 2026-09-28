/**
 * The app's view of a corpus recipe, assembled from `corpus.db` rows. Every enum and row type
 * comes from `./types` (generated from schema/corpus.sql, which `ingest` owns: ruling R4); this
 * file only adds the shapes the UI and engine work with and the JSON payloads the schema stores
 * as text. It replaces the old hand-written DRAFT mirror.
 */
import type { Cuisine, DietStatus, Equipment, SwapVia } from './types'

export type { Course, Cuisine, DietPreset, DietStatus, Equipment, Unit } from './types'

/** Derived from ingredients, never titles (docs/PRODUCT.md, "Diet"). */
export interface DietFlags {
  vegetarian: boolean
  /** True if the recipe contains no red meat (fish and poultry are fine). */
  noRedMeat: boolean
}

export interface IngredientLine {
  quantity: number | null
  /** A `Unit` for corpus rows; free text is allowed for the user's own recipes. */
  unit: string | null
  canonicalIngredient: string
  form: string | null
  optional: boolean
}

export interface Recipe {
  id: string
  title: string
  sourceUrl: string
  cuisine: Cuisine
  equipment: Equipment[]
  onePot: boolean
  totalMinutes: number
  weeknight: boolean
  diet: DietFlags
  servings: number
  ingredients: IngredientLine[]
  steps: string[]
}

/** One element of `recipe_diet.swaps` (written by ingest/tag/diet.py). */
export interface DietSwap {
  /** The ingredient as written in the recipe. */
  item: string
  slug: string | null
  /** What to use instead, as text; null when the item is simply left out. */
  use: string | null
  use_slug?: string | string[] | null
  via: SwapVia
  /** `substitutions.id` when via is 'substitution'. */
  sub_id?: string
  quality?: number
  /** True when the item was found in the steps, not the ingredient list. */
  from_steps?: boolean
}

/**
 * `recipe_diet.swaps` is stored in a short form (schema 4, schema/corpus.sql): keys
 * i, s, u, x, v, b, q, f for item, slug, use, use_slug, via, sub_id, quality, from_steps; via
 * 's', 'a', 'o' for substitution, alternative, omit; a null value left out. An element already in
 * the long form (a schema 3 file) is passed through.
 */
const SWAP_VIA: Record<string, SwapVia> = { s: 'substitution', a: 'alternative', o: 'omit' }

export function decodeDietSwaps(json: string | null | undefined): DietSwap[] {
  const rows = JSON.parse(json ?? '[]') as Record<string, unknown>[]
  return rows.map((r) => {
    if ('item' in r) return r as unknown as DietSwap
    const swap: DietSwap = {
      item: r.i as string,
      slug: (r.s as string | undefined) ?? null,
      use: (r.u as string | undefined) ?? null,
      via: SWAP_VIA[r.v as string] ?? (r.v as SwapVia),
    }
    if (r.x !== undefined) swap.use_slug = r.x as string | string[]
    if (r.b !== undefined) swap.sub_id = r.b as string
    if (r.q !== undefined) swap.quality = r.q as number
    if (r.f !== undefined) swap.from_steps = r.f as boolean
    return swap
  })
}

/** A diet status the preset filter lets through. */
export function dietAllows(status: DietStatus): boolean {
  return status === 'ok' || status === 'adaptable'
}
