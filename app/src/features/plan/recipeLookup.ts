import { FIXTURE_RECIPES } from '../../corpus/fixture'
import type { Unit } from '../../corpus/types'
import type { Db } from '../../db/types'
import { loadCorpusRecipe } from '../cook/corpusRecipe'
import type { Taxonomy } from '../cook/taxonomy'
import { getMyRecipe } from '../myRecipes/myRecipesRepo'
import type { PlanEntry } from './planRepo'

/** One ingredient line resolved for a plan entry, at the recipe's own (unscaled) servings. Only
 * corpus recipes carry a real canonical `slug`; fixture and My Recipes lines have none, and the
 * grocery build sends them to "Check these" (rule 11) rather than guessing. */
export interface PlanLine {
  slug: string | null
  raw: string
  qty: number | null
  qtyMax: number | null
  unit: Unit | null
  pkgQty: number | null
  pkgUnit: Unit | null
  /** The source recorded no units, so a bare number is not a piece count (see below). */
  unitStripped: boolean
}

export interface PlanRecipe {
  /** The recipe's own servings, for `scaleFactor`; null when it does not scale (a fixture yield
   * with no head count). */
  servings: number | null
  lines: PlanLine[]
}

/**
 * Sources whose ingredient quantities carry no unit at all (S7c #1). The Food.com mirror
 * (`ingest/fetch/fetch_foodcom.py`) ships `RecipeIngredientQuantities` ("3") and
 * `RecipeIngredientParts` ("lemon juice") with the unit in neither column, so the fetcher's
 * "3 lemon juice" reaches the parser, which gives any unit-less number the unit 'piece'. For
 * these recipes a bare number is not trusted as a count unless the ingredient is one you count
 * (`trustsBareCount` in `features/grocery/aggregate.ts`); units named in the ingredient text
 * itself ("1 garlic clove") are still real.
 */
const UNITLESS_SOURCES = ['foodcom:']

export function sourceHasNoUnits(recipeKey: string): boolean {
  return UNITLESS_SOURCES.some((prefix) => recipeKey.startsWith(prefix))
}

function rawFor(qty: number | null, unit: Unit | null, name: string): string {
  const qtyText = qty === null ? '' : `${qty} `
  const unitText = unit ? `${unit} ` : ''
  return `${qtyText}${unitText}${name}`.trim()
}

/** Resolves a plan entry's recipe to its ingredient lines, whichever of the three sources it
 * points at (`features/plan/planRepo.ts`'s `RecipeSource`). */
export async function lookupPlanRecipe(
  corpus: { db: Db; tax: Taxonomy } | null,
  entry: Pick<PlanEntry, 'recipeSource' | 'recipeId'>,
): Promise<PlanRecipe | null> {
  if (entry.recipeSource === 'corpus') {
    if (!corpus) return null
    const recipe = await loadCorpusRecipe(corpus.db, corpus.tax, entry.recipeId, 'everything')
    if (!recipe) return null
    const unitStripped = sourceHasNoUnits(recipe.key)
    return {
      servings: recipe.servings,
      lines: recipe.lines.map((line) => ({
        slug: line.slug,
        raw: rawFor(line.qty, line.unit, line.name ?? line.raw),
        qty: line.qty,
        qtyMax: line.qtyMax,
        unit: line.unit,
        pkgQty: line.pkgQty,
        pkgUnit: line.pkgUnit,
        unitStripped: unitStripped && line.unit === 'piece',
      })),
    }
  }

  if (entry.recipeSource === 'fixture') {
    const recipe = FIXTURE_RECIPES.find((r) => r.id === entry.recipeId)
    if (!recipe) return null
    return {
      servings: recipe.servings,
      lines: recipe.ingredients.map((line) => ({
        slug: null,
        raw: rawFor(line.quantity, line.unit as Unit | null, line.canonicalIngredient),
        qty: line.quantity,
        qtyMax: null,
        unit: null,
        pkgQty: null,
        pkgUnit: null,
        unitStripped: false,
      })),
    }
  }

  // 'my'
  const recipe = await getMyRecipe(entry.recipeId)
  if (!recipe) return null
  return {
    servings: recipe.data.servings,
    lines: recipe.data.ingredients.map((line) => ({
      slug: null,
      raw: rawFor(line.quantity, line.unit as Unit | null, line.canonicalIngredient),
      qty: line.quantity,
      qtyMax: null,
      unit: null,
      pkgQty: null,
      pkgUnit: null,
      unitStripped: false,
    })),
  }
}
