import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ingredientAisle, ingredientName, ingredientPurchase } from '../../corpus/slugs'
import { resetUserDbForTests } from '../../db'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { loadTaxonomy, type Taxonomy } from '../cook/taxonomy'
import { aggregateGroceryLines, type GroceryLineInput } from '../grocery/aggregate'
import { lineFromText } from '../myRecipes/lines'
import { createMyRecipe } from '../myRecipes/myRecipesRepo'
import { emptyMyRecipeData, type MyRecipeIngredientLine } from '../myRecipes/types'
import { scaleFactor } from '../scaling/scale'
import { loadUnits, type UnitTable } from '../units/units'
import { addPlanEntry, listPlanEntries, mondayOf } from './planRepo'
import { lookupPlanRecipe } from './recipeLookup'

/**
 * S13 #4: a grocery list built from a My Recipe has real items. Before S13 every My Recipes line
 * went to "Check these"; now the typed lines are parsed and flow through scaling and the same
 * aggregation as corpus recipes (the build loop mirrors routes/GroceryList.tsx).
 */

let corpus: WebDb
let tax: Taxonomy
let units: UnitTable

beforeAll(async () => {
  // An explicit path: under jsdom, import.meta.url is not a file URL.
  corpus = await openFixtureDb(`${process.cwd()}/src/corpus/fixture.db`)
  tax = await loadTaxonomy(corpus)
  units = await loadUnits(corpus)
})

afterAll(async () => {
  await corpus.close()
})

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

const blank: MyRecipeIngredientLine = {
  quantity: null,
  unit: null,
  canonicalIngredient: '',
  form: null,
  optional: false,
  raw: '',
}

describe('grocery list from a My Recipe (S13)', () => {
  it('parsed lines become list items, scaled to the plan; only the unreadable line is "Check these"', async () => {
    const lines = [
      '2 cloves garlic, minced',
      '1 lime, juiced',
      '400 g chicken thighs',
      'For the rice:',
      '1 cup basmati rice',
      'a splash of something weird',
    ].map((raw) => lineFromText(raw, blank))
    const id = await createMyRecipe('Lime chicken and rice', {
      ...emptyMyRecipeData(),
      servings: 2,
      ingredients: lines,
    })
    const week = mondayOf(new Date())
    await addPlanEntry({
      weekStart: week,
      day: week,
      meal: 'dinner',
      recipeId: id,
      recipeSource: 'my',
      recipeTitle: 'Lime chicken and rice',
      people: 2,
    })
    const [entry] = await listPlanEntries(week)

    const recipe = await lookupPlanRecipe(null, entry)
    if (!recipe) throw new Error('recipe not found')
    // 6 typed lines: the header gives no item, the other 5 give one each.
    expect(recipe.lines.map((l) => l.slug)).toEqual([
      'garlic',
      'lime',
      'chicken_thigh',
      'basmati_rice',
      null,
    ])

    // 2 people x 1.5 servings each = 3 servings, from a recipe for 2: x1.5.
    const factor = scaleFactor(recipe.servings as number, entry.people, 1.5)
    expect(factor).toBe(1.5)
    const input: GroceryLineInput[] = recipe.lines.map((line) => ({
      ...line,
      qty: line.qty === null ? null : line.qty * factor,
      qtyMax: line.qtyMax === null ? null : line.qtyMax * factor,
      recipe: entry.recipeTitle,
    }))
    const { items, checkThese } = aggregateGroceryLines(input, {
      units,
      system: 'metric',
      metaFor: (slug) => ({
        name: ingredientName(slug),
        aisle: ingredientAisle(slug),
        isStaple: tax.staples.has(slug),
        density: tax.density.get(slug) ?? null,
        eachG: tax.eachG.get(slug) ?? null,
        purchase: ingredientPurchase(slug),
      }),
      haveSlugs: new Set(),
    })

    const bySlug = new Map(items.map((i) => [i.slug, i]))
    expect([...bySlug.keys()].sort()).toEqual(['basmati_rice', 'chicken_thigh', 'garlic', 'lime'])
    expect(bySlug.get('chicken_thigh')?.amount).toContain('600 g')
    expect(bySlug.get('garlic')?.amount).toContain('3 cloves')
    expect(bySlug.get('lime')?.aisle).toBe('produce')
    for (const item of items) expect(item.sources).toEqual(['Lime chicken and rice'])
    expect(checkThese).toEqual([
      { raw: 'a splash of something weird', reason: expect.any(String) as string },
    ])
  })
})
