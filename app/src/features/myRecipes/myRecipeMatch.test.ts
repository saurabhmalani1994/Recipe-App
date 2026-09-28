import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { resetUserDbForTests } from '../../db'
import { openFixtureDb } from '../../test/fixtureDb'
import type { MatchQuery } from '../cook/engine'
import { loadTaxonomy } from '../cook/taxonomy'
import { lineFromText } from './lines'
import { matchMyRecipes } from './myRecipeMatch'
import { createMyRecipe, listMyRecipes } from './myRecipesRepo'
import { emptyMyRecipeData, type MyRecipeIngredientLine } from './types'

/**
 * "My Recipes in Cook results" (S12 brief #2). `myRecipeMatch.ts` joins My Recipes into
 * `matchRecipes`'s output; these tests exercise it directly against the corpus fixture db
 * (`corpus/fixture.db`) for the taxonomy and substitution table, and against a fresh in-memory
 * `user.db` (S13's `createMyRecipe`, which parses and stores the ingredient lines) for the
 * recipes themselves.
 */

let corpusDb: WebDb

beforeAll(async () => {
  // `openFixtureDb`'s default path uses `import.meta.url`, which resolves to a non-file URL
  // under this file's environment (jsdom, needed below for `window.localStorage`) — pass an
  // explicit path instead.
  corpusDb = await openFixtureDb(path.join(process.cwd(), 'src/corpus/fixture.db'))
})

afterAll(async () => {
  await corpusDb.close()
})

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

function typed(...raws: string[]): MyRecipeIngredientLine[] {
  const blank: MyRecipeIngredientLine = {
    quantity: null,
    unit: null,
    canonicalIngredient: '',
    form: null,
    optional: false,
    raw: '',
  }
  return raws.map((raw) => lineFromText(raw, blank))
}

const BASE: MatchQuery = {
  have: [],
  cuisine: null,
  diet: 'everything',
  kitchen: null,
  useOnly: null,
  onePot: false,
  maxMinutes: null,
}

describe('My Recipes in Cook results (S12)', () => {
  it('appears for a kitchen that covers its ingredients, marked mine', async () => {
    await createMyRecipe('Weeknight chicken', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb chicken breast', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()

    const results = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have: ['chicken_breast', 'onion'],
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      mine: true,
      myRecipeId: recipes[0].id,
      key: recipes[0].id,
      title: 'Weeknight chicken',
      covered: 2,
      needed: 2,
      coverage: 1,
    })
  })

  it('does not appear for a kitchen that covers none of its core ingredients', async () => {
    await createMyRecipe('Weeknight chicken', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb chicken breast', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()

    const results = await matchMyRecipes(corpusDb, tax, recipes, { ...BASE, have: ['garlic'] })
    expect(results).toEqual([])
  })

  it('is excluded by a diet it violates when no substitute is on hand', async () => {
    await createMyRecipe('Beef stew', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb beef', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()
    const have = ['beef', 'onion']

    const everything = await matchMyRecipes(corpusDb, tax, recipes, { ...BASE, have })
    expect(everything.map((r) => r.title)).toContain('Beef stew')
    expect(everything[0].diet).toBeNull()

    const noRedMeat = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have,
      diet: 'no_red_meat',
    })
    expect(noRedMeat.map((r) => r.title)).not.toContain('Beef stew')
  })

  it('is "adaptable" when a diet-safe substitute exists (reuses the engine\'s swap logic)', async () => {
    await createMyRecipe('Chicken stir fry', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb chicken breast', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()

    const results = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have: ['chicken_breast', 'onion'],
      diet: 'vegetarian',
    })

    expect(results).toHaveLength(1)
    expect(results[0].diet?.status).toBe('adaptable')
    expect(results[0].diet?.swaps[0]).toMatchObject({ item: 'chicken breast', via: 'substitution' })
  })
})
