import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import { isFavorite, listFavoriteIds, setFavorite } from './favoritesRepo'

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

describe('favorites', () => {
  it('starts empty', async () => {
    expect(await listFavoriteIds()).toEqual([])
    expect(await isFavorite('r01')).toBe(false)
  })

  it('stars and unstars a recipe', async () => {
    await setFavorite('r01', true)
    expect(await isFavorite('r01')).toBe(true)
    expect(await listFavoriteIds()).toEqual(['r01'])

    await setFavorite('r01', false)
    expect(await isFavorite('r01')).toBe(false)
    expect(await listFavoriteIds()).toEqual([])
  })
})
