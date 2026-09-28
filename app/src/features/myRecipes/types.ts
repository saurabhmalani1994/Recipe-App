import type { Cuisine } from '../../corpus/model'
import type { Equipment } from '../../corpus/types'
import type { ParsedLine } from '../../parse'

export interface MyRecipeIngredientLine {
  quantity: number | null
  unit: string | null
  canonicalIngredient: string
  form: string | null
  optional: boolean
  /** The line as typed (S13), e.g. "2 cups chopped cilantro". Absent on lines saved before
   * S13; `lineText` in `lines.ts` composes one from the fields above. */
  raw?: string
}

/** The JSON shape stored in `my_recipes.data`. */
export interface MyRecipeData {
  servings: number
  cuisine: Cuisine | null
  tags: string[]
  notes: string
  ingredients: MyRecipeIngredientLine[]
  steps: string[]
  /** The page this recipe was imported from (S12, "Import from link"), kept for reference and
   * shown in the editor. `undefined`/absent on a recipe saved before S12 or created from
   * scratch; always read as `?? null`. */
  sourceUrl?: string | null
  /** S12b #3 (R13): optional filter fields, typed by the owner or accepted from a suggestion
   * inferred from the steps (`inferFromSteps.ts`). `null`/absent = not set, and Cook's "one
   * pot", "use only equipment" and "under N minutes" filters then exclude this recipe rather
   * than pass it through unfiltered (rule 11) — see `myRecipeMatch.ts`. */
  totalMin?: number | null
  onePot?: boolean | null
  equipment?: Equipment[] | null
}

export interface MyRecipe {
  id: string
  title: string
  data: MyRecipeData
  createdAt: string
  updatedAt: string
  /** Set when this My Recipe is a fork ("make my version") of a corpus/fixture recipe. */
  parentRecipeId: string | null
  /** What the parser understood from each ingredient line, aligned with `data.ingredients`
   * (S13; `my_recipes.parsed`). Always current: re-parsed on read when the stored one is stale. */
  parsed: ParsedLine[]
}

export function emptyMyRecipeData(): MyRecipeData {
  return {
    servings: 4,
    cuisine: null,
    tags: [],
    notes: '',
    ingredients: [],
    steps: [],
    sourceUrl: null,
    totalMin: null,
    onePot: null,
    equipment: null,
  }
}
