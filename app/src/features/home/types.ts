import type { Cuisine } from '../../corpus/types'

/** One card in a Home row (S11 #2): "image if any, title, cuisine, time, 'you have 7/9'". */
export interface HomeCard {
  /** `recipes.key`: every Home row is corpus recipes only (S11 scope). */
  key: string
  title: string
  cuisine: Cuisine | null
  totalMin: number | null
  imageUrl: string | null
  /** Core slugs the kitchen has, over core slugs plus unreadable lines (same denominator as
   * `engine.ts`'s `needed`), computed against the *current* kitchen regardless of how the row
   * picked this recipe. */
  covered: number
  needed: number
  /** Explore's "You haven't cooked Korean lately" (S11 #2b). Other rows leave it unset. */
  why?: string
}

export type HomeRowId = 'cook' | 'explore' | 'favorites' | 'seasonal'

export interface HomeRow {
  id: HomeRowId
  title: string
  cards: HomeCard[]
  /** Shown instead of the (empty) card strip — S11 #2c: "With no favorites yet, show a prompt." */
  emptyMessage?: string
}
