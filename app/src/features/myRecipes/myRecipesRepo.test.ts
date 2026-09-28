import { beforeEach, describe, expect, it } from 'vitest'
import { getUserDb, resetUserDbForTests } from '../../db'
import { PARSER_VERSION } from '../../parse'
import { FIXTURE_RECIPES } from '../../corpus/fixture'
import {
  createMyRecipe,
  forkRecipe,
  getForkDiff,
  getMyRecipe,
  listMyRecipes,
  parseStats,
  updateMyRecipe,
} from './myRecipesRepo'
import { lineFromText } from './lines'
import { emptyMyRecipeData, type MyRecipeData, type MyRecipeIngredientLine } from './types'

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

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

describe('my recipes', () => {
  it('creates and reads back a plain recipe', async () => {
    const id = await createMyRecipe('Weeknight Dal', { ...emptyMyRecipeData(), servings: 4 })
    const recipe = await getMyRecipe(id)
    expect(recipe?.title).toBe('Weeknight Dal')
    expect(recipe?.data.servings).toBe(4)
    expect(recipe?.parentRecipeId).toBeNull()
  })

  it('lists created recipes', async () => {
    await createMyRecipe('A', emptyMyRecipeData())
    await createMyRecipe('B', emptyMyRecipeData())
    const all = await listMyRecipes()
    expect(all.map((r) => r.title).sort()).toEqual(['A', 'B'])
  })

  it('"make my version" forks a recipe with parent_id, and the diff starts empty', async () => {
    const parent = FIXTURE_RECIPES[0]
    const forkId = await forkRecipe(parent)

    const fork = await getMyRecipe(forkId)
    expect(fork?.parentRecipeId).toBe(parent.id)
    expect(fork?.title).toBe(`${parent.title} (my version)`)
    expect(fork?.data.ingredients).toHaveLength(parent.ingredients.length)

    const diff = await getForkDiff(forkId)
    expect(diff).toEqual({
      ingredientsAdded: [],
      ingredientsRemoved: [],
      ingredientsChanged: [],
      stepsChanged: [],
    })
  })

  it('editing a fork updates its diff against the parent', async () => {
    const parent = FIXTURE_RECIPES[0]
    const forkId = await forkRecipe(parent)
    const fork = await getMyRecipe(forkId)
    if (!fork) throw new Error('fork missing')

    const edited = {
      ...fork.data,
      ingredients: fork.data.ingredients.filter((line) => line.canonicalIngredient !== 'onion'),
    }
    await updateMyRecipe(forkId, fork.title, edited)

    const diff = await getForkDiff(forkId)
    expect(diff?.ingredientsRemoved.map((l) => l.canonicalIngredient)).toContain('onion')
  })
})

describe('my recipes: parsed items stored beside the raw lines (S13 #3)', () => {
  const data: MyRecipeData = {
    ...emptyMyRecipeData(),
    servings: 2,
    ingredients: typed(
      '2 cups chopped cilantro',
      '1 (14 oz) can chickpeas, drained',
      'For the dressing:',
      'salt and pepper',
      'a splash of something weird',
    ),
  }

  it('saves slug, qty and unit with each line and reads them back', async () => {
    const id = await createMyRecipe('Chickpea salad', data)
    const db = await getUserDb()
    const row = (
      await db.query<{ parsed: string; parser_version: number }>(
        'SELECT parsed, parser_version FROM my_recipes WHERE id = ?',
        [id],
      )
    ).rows[0]
    expect(row.parser_version).toBe(PARSER_VERSION)
    const stored = JSON.parse(row.parsed) as { raw: string; items: unknown[] }[]
    expect(stored.map((l) => l.raw)).toEqual([
      '2 cups chopped cilantro',
      '1 (14 oz) can chickpeas, drained',
      'For the dressing:',
      'salt and pepper',
      'a splash of something weird',
    ])

    parseStats.reparsed = 0
    const recipe = await getMyRecipe(id)
    expect(parseStats.reparsed).toBe(0) // the stored parse was current: read, not recomputed
    expect(recipe?.data.ingredients[0]).toMatchObject({
      raw: '2 cups chopped cilantro',
      quantity: 2,
      unit: 'cup',
    })
    const items = recipe?.parsed.map((l) => l.items)
    expect(items?.[0]).toEqual([
      {
        slug: 'cilantro',
        qty: 2,
        qtyMax: null,
        unit: 'cup',
        pkgQty: null,
        pkgUnit: null,
        optional: false,
      },
    ])
    expect(items?.[1]).toEqual([
      {
        slug: 'chickpeas',
        qty: 1,
        qtyMax: null,
        unit: 'can',
        pkgQty: 14,
        pkgUnit: 'oz',
        optional: false,
      },
    ])
    expect(items?.[2]).toEqual([]) // a header is not an ingredient
    expect(items?.[3].map((i) => i.slug)).toEqual(['salt', 'black_pepper'])
    expect(items?.[4].map((i) => i.slug)).toEqual([null]) // kept, marked not understood
  })

  it('an edit re-parses and re-stores the lines', async () => {
    const id = await createMyRecipe('Chickpea salad', data)
    const recipe = await getMyRecipe(id)
    if (!recipe) throw new Error('missing')
    const edited = {
      ...recipe.data,
      ingredients: recipe.data.ingredients.map((line, i) =>
        i === 0 ? lineFromText('3 tbsp fresh coriander', line) : line,
      ),
    }
    await updateMyRecipe(id, recipe.title, edited)
    const db = await getUserDb()
    const row = (
      await db.query<{ parsed: string }>('SELECT parsed FROM my_recipes WHERE id = ?', [id])
    ).rows[0]
    const stored = JSON.parse(row.parsed) as { raw: string; items: { slug: string }[] }[]
    expect(stored[0].raw).toBe('3 tbsp fresh coriander')
    expect(stored[0].items[0]).toMatchObject({ slug: 'cilantro', qty: 3, unit: 'tbsp' })
  })

  it('a row from before user.db v5 (no parse stored) is parsed on read, and counted', async () => {
    const id = await createMyRecipe('Old recipe', data)
    const db = await getUserDb()
    await db.run('UPDATE my_recipes SET parsed = NULL, parser_version = NULL WHERE id = ?', [id])
    parseStats.reparsed = 0
    const recipe = await getMyRecipe(id)
    expect(parseStats.reparsed).toBe(5)
    expect(recipe?.parsed[0].items[0].slug).toBe('cilantro')
  })

  it('a fork gets a text line per parent ingredient, each parsed', async () => {
    const parent = FIXTURE_RECIPES[0]
    const forkId = await forkRecipe(parent)
    const fork = await getMyRecipe(forkId)
    expect(fork?.data.ingredients.map((l) => l.raw)).toEqual([
      '2 tbsp vegetable oil',
      '1 onion',
      '2 can chickpeas',
      '1 can tomato',
      '1 tbsp garam masala',
    ])
    expect(fork?.parsed.map((l) => l.items[0]?.slug)).toEqual([
      'vegetable_oil',
      'onion',
      'chickpeas',
      'canned_tomatoes',
      'garam_masala',
    ])
    // Typing a new amount on the same ingredient is a change, not a remove + add.
    if (!fork) throw new Error('missing')
    const edited = {
      ...fork.data,
      ingredients: fork.data.ingredients.map((line, i) =>
        i === 0 ? lineFromText('4 tbsp vegetable oil', line) : line,
      ),
    }
    await updateMyRecipe(forkId, fork.title, edited)
    const diff = await getForkDiff(forkId)
    expect(diff?.ingredientsChanged.map((c) => c.ingredient)).toEqual(['vegetable oil'])
    expect(diff?.ingredientsAdded).toEqual([])
    expect(diff?.ingredientsRemoved).toEqual([])
  })
})
