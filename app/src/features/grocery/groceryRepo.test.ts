import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import { isInKitchen } from '../kitchen/kitchenRepo'
import {
  addManualGroceryItem,
  addTickedToKitchen,
  buildGroceryList,
  clearGroceryList,
  getCurrentGroceryList,
  setGroceryItemChecked,
} from './groceryRepo'

beforeEach(() => {
  window.localStorage.clear()
  resetUserDbForTests()
})

const nameOf = (slug: string) => slug.replace(/_/g, ' ')

describe('grocery list persistence (S7 #3)', () => {
  it('builds a list from an aggregation result, leaving out "have" items but keeping "Check these"', async () => {
    const listId = await buildGroceryList(
      null,
      [
        { slug: 'onion', name: 'onion', aisle: 'produce', amount: '350 g', have: false },
        { slug: 'salt', name: 'salt', aisle: 'spices', amount: '1 tsp', have: true },
      ],
      [{ raw: 'a splash of something', reason: 'no canonical ingredient matched' }],
    )
    const list = await getCurrentGroceryList(nameOf)
    expect(list?.id).toBe(listId)
    const texts = list?.items.map((i) => i.text).sort()
    expect(texts).toEqual(['a splash of something', 'onion'])
    expect(list?.items.find((i) => i.text === 'onion')).toMatchObject({
      name: 'onion',
      amount: '350 g',
      aisle: 'produce',
      checked: false,
      isSlug: true,
    })
    expect(list?.items.find((i) => i.text === 'a splash of something')).toMatchObject({
      note: 'no canonical ingredient matched',
      isSlug: false,
    })
  })

  it('ticks an item, adds it to the kitchen, and removes it from the list', async () => {
    const listId = await buildGroceryList(
      null,
      [{ slug: 'onion', name: 'onion', aisle: 'produce', amount: '350 g', have: false }],
      [],
    )
    const before = await getCurrentGroceryList(nameOf)
    const item = before!.items[0]
    await setGroceryItemChecked(item.id, true)

    const added = await addTickedToKitchen(listId)
    expect(added).toBe(1)
    expect(await isInKitchen('onion')).toBe(true)

    const after = await getCurrentGroceryList(nameOf)
    expect(after?.items).toEqual([])
  })

  it('allows a manual extra item, and clears the whole list', async () => {
    const listId = await buildGroceryList(null, [], [])
    await addManualGroceryItem(listId, 'paper towels')
    const list = await getCurrentGroceryList(nameOf)
    expect(list?.items).toMatchObject([{ text: 'paper towels', manual: true, isSlug: false }])

    await clearGroceryList(listId)
    expect(await getCurrentGroceryList(nameOf)).toBeNull()
  })
})
