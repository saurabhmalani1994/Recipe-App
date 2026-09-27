import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import { FIXTURE_RECIPES } from '../../corpus/fixture'
import {
  createMyRecipe,
  forkRecipe,
  getForkDiff,
  getMyRecipe,
  listMyRecipes,
  updateMyRecipe,
} from './myRecipesRepo'
import { emptyMyRecipeData } from './types'

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
