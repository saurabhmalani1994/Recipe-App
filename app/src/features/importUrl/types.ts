/**
 * "Import from link" (S12 brief #1; D6, owner: "Import from URL", no AI). What a page's markup
 * or a plain-text paste gives before it becomes a `MyRecipeData` (`toMyRecipeData.ts`): text
 * fields only, so parsing a page never needs the ingredient parser or the taxonomy — S13's
 * parser runs the same way it does on any typed line, once the result opens in the editor.
 */
export interface ImportedRecipe {
  title: string | null
  sourceUrl: string | null
  /** As printed on the page ("Serves 4", "4-6 servings"); `toMyRecipeData.ts` reads a headline
   * number out of it. */
  servingsText: string | null
  prepMin: number | null
  cookMin: number | null
  totalMin: number | null
  /** One raw line per ingredient, as typed on the page ("2 cups chopped cilantro"); the editor
   * parses each with S13's parser exactly as it would a hand-typed line. */
  ingredients: string[]
  /** One entry per step; a `HowToSection` name (schema.org) becomes its own entry so the
   * grouping survives, even though `MyRecipeData.steps` itself has no headings. */
  steps: string[]
  image: string | null
  /** Free text as the page wrote it ("Italian", "Tex-Mex"); `toMyRecipeData.ts` maps it to a
   * `Cuisine` when it recognises it, else drops it. */
  cuisine: string | null
  category: string | null
}

export function emptyImportedRecipe(sourceUrl: string | null): ImportedRecipe {
  return {
    title: null,
    sourceUrl,
    servingsText: null,
    prepMin: null,
    cookMin: null,
    totalMin: null,
    ingredients: [],
    steps: [],
    image: null,
    cuisine: null,
    category: null,
  }
}

/** True once a recipe has enough to be worth opening in the editor. */
export function hasContent(recipe: ImportedRecipe): boolean {
  return recipe.ingredients.length > 0 || recipe.steps.length > 0
}
