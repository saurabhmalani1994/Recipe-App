/**
 * DRAFT. `ingest` owns `schema/corpus.sql` and `corpus.db` (ruling R4) and it has not landed
 * yet. This file is a minimal local mirror of the shape `app` expects, so the UI and the
 * matching/planning engine have something typed to build against. Replace it with generated
 * types from `schema/corpus.sql` once `ingest` ships (per docs/PRODUCT.md, "Packages").
 */

export type Cuisine =
  | 'indian'
  | 'chinese'
  | 'italian'
  | 'mediterranean'
  | 'mexican'
  | 'thai'
  | 'japanese'
  | 'korean'
  | 'middle_eastern'
  | 'french'
  | 'american'

export type Equipment =
  | 'oven'
  | 'stovetop'
  | 'air_fryer'
  | 'food_processor'
  | 'blender'
  | 'mortar_pestle'
  | 'slow_cooker'
  | 'pressure_cooker'
  | 'grill'
  | 'microwave'
  | 'wok'
  | 'stand_mixer'

/** Derived from ingredients, never titles (docs/PRODUCT.md, "Diet"). */
export interface DietFlags {
  vegetarian: boolean
  /** True if the recipe contains no red meat (fish and poultry are fine). */
  noRedMeat: boolean
}

export interface DraftIngredientLine {
  quantity: number | null
  unit: string | null
  canonicalIngredient: string
  form: string | null
  optional: boolean
}

export interface DraftRecipe {
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
  ingredients: DraftIngredientLine[]
  steps: string[]
}
