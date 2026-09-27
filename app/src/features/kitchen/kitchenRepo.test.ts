import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import {
  addKitchenItem,
  groupByAisle,
  isInKitchen,
  listKitchenItems,
  removeKitchenItem,
} from './kitchenRepo'

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

describe('kitchen list', () => {
  it('pre-seeds the pantry staple defaults', async () => {
    const items = await listKitchenItems()
    const ids = items.map((i) => i.ingredientId).sort()
    expect(ids).toEqual(
      [
        'all_purpose_flour',
        'black_pepper',
        'butter',
        'neutral_oil',
        'olive_oil',
        'salt',
        'sugar',
        'water',
      ].sort(),
    )
  })

  it('adds an item found via a synonym, and it can be removed', async () => {
    expect(await isInKitchen('cilantro')).toBe(false)

    await addKitchenItem('cilantro')
    expect(await isInKitchen('cilantro')).toBe(true)

    await removeKitchenItem('cilantro')
    expect(await isInKitchen('cilantro')).toBe(false)
  })

  it('groups items by aisle', async () => {
    await addKitchenItem('onion')
    const items = await listKitchenItems()
    const groups = groupByAisle(items)
    const produceGroup = groups.find(([aisle]) => aisle === 'produce')
    expect(produceGroup?.[1].some((i) => i.ingredientId === 'onion')).toBe(true)
  })
})
