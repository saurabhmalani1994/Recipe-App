import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import { isFavorite, listFavorites, listFavoriteIds, setFavorite } from './favoritesRepo'

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

describe('favorites', () => {
  it('starts empty', async () => {
    expect(await listFavoriteIds()).toEqual([])
    expect(await isFavorite('r01')).toBe(false)
  })

  it('stars and unstars a fixture recipe (source defaults to fixture)', async () => {
    await setFavorite('r01', true)
    expect(await isFavorite('r01')).toBe(true)
    expect(await listFavoriteIds()).toEqual(['r01'])

    await setFavorite('r01', false)
    expect(await isFavorite('r01')).toBe(false)
    expect(await listFavoriteIds()).toEqual([])
  })

  it('stars a corpus recipe by its recipes.key, keyed separately from fixture favorites (S11 #1)', async () => {
    await setFavorite('themealdb:53191', true, 'corpus')
    expect(await isFavorite('themealdb:53191', 'corpus')).toBe(true)
    expect(await isFavorite('themealdb:53191', 'fixture')).toBe(false)
    expect(await listFavoriteIds('corpus')).toEqual(['themealdb:53191'])
    expect(await listFavoriteIds('fixture')).toEqual([])

    await setFavorite('themealdb:53191', false, 'corpus')
    expect(await isFavorite('themealdb:53191', 'corpus')).toBe(false)
  })

  it('mixes corpus, fixture and My Recipes favorites in one list (S11 #1)', async () => {
    await setFavorite('r01', true, 'fixture')
    await setFavorite('themealdb:53191', true, 'corpus')
    await setFavorite('my_abc123', true, 'my')

    const all = await listFavorites()
    expect(new Set(all.map((f) => f.recipeId))).toEqual(
      new Set(['r01', 'themealdb:53191', 'my_abc123']),
    )
    expect(all.find((f) => f.recipeId === 'r01')?.recipeSource).toBe('fixture')
    expect(all.find((f) => f.recipeId === 'themealdb:53191')?.recipeSource).toBe('corpus')
    expect(all.find((f) => f.recipeId === 'my_abc123')?.recipeSource).toBe('my')
    expect(await listFavoriteIds()).toHaveLength(3)
  })
})
