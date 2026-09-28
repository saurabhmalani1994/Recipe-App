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

    const { results, hidden } = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have: ['chicken_breast', 'onion'],
    })

    expect(hidden).toEqual([])
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      mine: true,
      myRecipeId: recipes[0].id,
      key: recipes[0].id,
      title: 'Weeknight chicken',
      covered: 2,
      needed: 2,
      coverage: 1,
      // R12: a My Recipe ranks as top quality within its coverage band.
      quality: 1,
    })
  })

  it('does not appear for a kitchen that covers none of its core ingredients', async () => {
    await createMyRecipe('Weeknight chicken', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb chicken breast', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()

    const { results } = await matchMyRecipes(corpusDb, tax, recipes, { ...BASE, have: ['garlic'] })
    expect(results).toEqual([])
  })

  // S18: rewritten against today's substitutions table (orch/reports/S10.md, "Design was wrong
  // about"). `beef` now has a diet-neutral, any-context swap (`beef__vegetarian_meat`, D16/R8),
  // so under no_red_meat it is "adaptable" rather than "no" — myRecipeDietStatus (R8) only
  // excludes a My Recipe when a banned ingredient has *no* fitting swap, never when the user
  // lacks the substitute on hand (it checks against an empty "have" set by design). A plain
  // exclusion case still needs a truly unswappable banned ingredient (no fitting swap for it, or
  // its taxonomy ancestors, anywhere in the substitutions table), so this uses `goat meat`
  // (slug `goat_meat`, parent `lamb`): neither it nor `lamb` is any swap's target.
  it('is excluded by a diet it violates with no fitting substitute (R8)', async () => {
    await createMyRecipe('Goat curry', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb goat meat', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()
    const have = ['goat_meat', 'onion']

    const everything = await matchMyRecipes(corpusDb, tax, recipes, { ...BASE, have })
    expect(everything.results.map((r) => r.title)).toContain('Goat curry')
    expect(everything.results[0].diet).toBeNull()

    const noRedMeat = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have,
      diet: 'no_red_meat',
    })
    expect(noRedMeat.results.map((r) => r.title)).not.toContain('Goat curry')
  })

  it('is "adaptable", not excluded, when a diet-neutral swap exists even off-hand (R8)', async () => {
    await createMyRecipe('Beef stew', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb beef', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()
    const have = ['beef', 'onion']

    const noRedMeat = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have,
      diet: 'no_red_meat',
    })
    expect(noRedMeat.results.map((r) => r.title)).toContain('Beef stew')
    expect(noRedMeat.results[0].diet).toMatchObject({
      status: 'adaptable',
      swaps: [{ item: 'beef', slug: 'beef', via: 'substitution', sub_id: 'beef__vegetarian_meat' }],
    })
  })

  it('is "adaptable" when a diet-safe substitute exists (reuses the engine\'s swap logic)', async () => {
    await createMyRecipe('Chicken stir fry', {
      ...emptyMyRecipeData(),
      ingredients: typed('1 lb chicken breast', '1 onion'),
    })
    const tax = await loadTaxonomy(corpusDb)
    const recipes = await listMyRecipes()

    const { results } = await matchMyRecipes(corpusDb, tax, recipes, {
      ...BASE,
      have: ['chicken_breast', 'onion'],
      diet: 'vegetarian',
    })

    expect(results).toHaveLength(1)
    expect(results[0].diet?.status).toBe('adaptable')
    expect(results[0].diet?.swaps[0]).toMatchObject({ item: 'chicken breast', via: 'substitution' })
  })

  describe('S12b #3 (R13): one-pot, use-only-equipment and under-N-minutes filters', () => {
    it('excludes a My Recipe with no totalMin when "under N minutes" is active, and reports it hidden', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const { results, hidden } = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        maxMinutes: 30,
      })

      expect(results).toEqual([])
      expect(hidden).toEqual([{ title: 'Weeknight chicken', reasons: ['no time set'] }])
    })

    it('applies "under N minutes" once totalMin is set', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
        totalMin: 45,
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const under30 = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        maxMinutes: 30,
      })
      expect(under30.results).toEqual([])
      expect(under30.hidden).toEqual([])

      const under60 = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        maxMinutes: 60,
      })
      expect(under60.results).toHaveLength(1)
      expect(under60.results[0].totalMin).toBe(45)
    })

    it('excludes a My Recipe with no onePot value when "one pot" is active, and reports it hidden', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const { results, hidden } = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        onePot: true,
      })

      expect(results).toEqual([])
      expect(hidden).toEqual([{ title: 'Weeknight chicken', reasons: ['one-pot not set'] }])
    })

    it('excludes a My Recipe explicitly not one-pot without reporting it hidden', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
        onePot: false,
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const { results, hidden } = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        onePot: true,
      })

      expect(results).toEqual([])
      expect(hidden).toEqual([])
    })

    it('excludes a My Recipe with no equipment set when "use only" is active, and reports it hidden', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const { results, hidden } = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        useOnly: ['stovetop'],
      })

      expect(results).toEqual([])
      expect(hidden).toEqual([{ title: 'Weeknight chicken', reasons: ['no equipment set'] }])
    })

    it('applies "use only" and "my kitchen has" once equipment is set', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
        equipment: ['stovetop'],
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const matches = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        useOnly: ['stovetop'],
      })
      expect(matches.results).toHaveLength(1)

      const noOven = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        useOnly: ['oven'],
      })
      expect(noOven.results).toEqual([])
      expect(noOven.hidden).toEqual([])

      const kitchenWithoutStovetop = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        kitchen: ['oven'],
      })
      expect(kitchenWithoutStovetop.results).toEqual([])
    })
  })

  // S16: "ingredients I avoid" applies to the Mine side the same way it does to the SQL side
  // (engine.ts's matchRecipes).
  describe('S16 "ingredients I avoid"', () => {
    it('hide drops the My Recipe and tallies it in avoidHidden (rule 11)', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const { results, avoidHidden } = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        avoid: new Map([['chicken_breast', 'hide']]),
      })
      expect(results).toEqual([])
      expect(avoidHidden.count).toBe(1)
      expect(avoidHidden.bySlug.get('chicken_breast')?.name).toBe('chicken breast')
    })

    it('lower keeps it, drops one coverage band, and marks `avoided`', async () => {
      await createMyRecipe('Weeknight chicken', {
        ...emptyMyRecipeData(),
        ingredients: typed('1 lb chicken breast', '1 onion'),
      })
      const tax = await loadTaxonomy(corpusDb)
      const recipes = await listMyRecipes()

      const { results, avoidHidden } = await matchMyRecipes(corpusDb, tax, recipes, {
        ...BASE,
        have: ['chicken_breast', 'onion'],
        avoid: new Map([['chicken_breast', 'lower']]),
      })
      expect(avoidHidden.count).toBe(0)
      expect(results).toHaveLength(1)
      expect(results[0].covered).toBe(2) // honest count untouched
      expect(results[0].coverage).toBeCloseTo(1 - 0.1, 10) // ranking fraction dropped one band
      expect(results[0].avoided).toEqual([
        { slug: 'chicken_breast', name: 'chicken breast', mode: 'lower' },
      ])
    })
  })
})
