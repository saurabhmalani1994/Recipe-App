import type { Cuisine } from '../../corpus/model'

export interface MyRecipeIngredientLine {
  quantity: number | null
  unit: string | null
  canonicalIngredient: string
  form: string | null
  optional: boolean
}

/** The JSON shape stored in `my_recipes.data`. */
export interface MyRecipeData {
  servings: number
  cuisine: Cuisine | null
  tags: string[]
  notes: string
  ingredients: MyRecipeIngredientLine[]
  steps: string[]
}

export interface MyRecipe {
  id: string
  title: string
  data: MyRecipeData
  createdAt: string
  updatedAt: string
  /** Set when this My Recipe is a fork ("make my version") of a corpus/fixture recipe. */
  parentRecipeId: string | null
}

export function emptyMyRecipeData(): MyRecipeData {
  return {
    servings: 4,
    cuisine: null,
    tags: [],
    notes: '',
    ingredients: [],
    steps: [],
  }
}
