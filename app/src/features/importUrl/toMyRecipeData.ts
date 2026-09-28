import { emptyMyRecipeData, type MyRecipeData } from '../myRecipes/types'
import { matchCuisine } from './cuisineMatch'
import type { ImportedRecipe } from './types'

const DEFAULT_SERVINGS = 4

/** The first whole number in "Serves 4", "4-6 servings", "Makes 12 muffins" — the editor's own
 * `servings` is a single number, so a range takes its low end. */
function servingsFrom(text: string | null): number {
  const match = text?.match(/\d+/)
  return match ? Number(match[0]) : DEFAULT_SERVINGS
}

/**
 * "Open the result in the editor, pre-filled and parsed by S13's parser, with the source URL
 * kept" (S12 brief #1). Every ingredient line keeps its raw text (`raw`) and nothing else —
 * quantity/unit/name are derived from S13's parser the same way a hand-typed line is, once the
 * editor renders it (`MyRecipeEditor`'s `parseRecipeLines`).
 */
export function importedToMyRecipeData(recipe: ImportedRecipe): { title: string; data: MyRecipeData } {
  const data: MyRecipeData = {
    ...emptyMyRecipeData(),
    servings: servingsFrom(recipe.servingsText),
    cuisine: matchCuisine(recipe.cuisine ?? recipe.category),
    tags: recipe.category ? [recipe.category] : [],
    ingredients: recipe.ingredients.map((raw) => ({
      quantity: null,
      unit: null,
      canonicalIngredient: '',
      form: null,
      optional: false,
      raw,
    })),
    steps: [...recipe.steps],
    sourceUrl: recipe.sourceUrl,
  }
  return { title: recipe.title ?? '', data }
}
