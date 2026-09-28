import { beforeEach, describe, expect, it } from 'vitest'
import { resetUserDbForTests } from '../../db'
import {
  getSettings,
  listAvoidIngredients,
  listKitchenEquipment,
  setAvoidIngredient,
  setKitchenEquipment,
  updateSettings,
} from './settingsRepo'

beforeEach(() => {
  // getUserDb() (web) snapshots to localStorage and rehydrates on open — clear both so each
  // test starts from a truly fresh db, not the previous test's persisted state.
  window.localStorage.clear()
  resetUserDbForTests()
})

describe('settings round trip', () => {
  it('defaults to 2 people, 1.5 servings/person, metric, everything', async () => {
    const settings = await getSettings()
    expect(settings).toEqual({
      peopleDefault: 2,
      servingsPerPerson: 1.5,
      units: 'metric',
      dietPreset: 'everything',
      showBreakfast: false,
    })
  })

  it('writes through and reads back every field', async () => {
    await updateSettings({
      peopleDefault: 4,
      servingsPerPerson: 2,
      units: 'us',
      dietPreset: 'no_red_meat',
      showBreakfast: true,
    })

    const settings = await getSettings()
    expect(settings).toEqual({
      peopleDefault: 4,
      servingsPerPerson: 2,
      units: 'us',
      dietPreset: 'no_red_meat',
      showBreakfast: true,
    })
  })

  it('merges a partial update, leaving other fields untouched', async () => {
    await updateSettings({ peopleDefault: 6 })
    const settings = await getSettings()
    expect(settings.peopleDefault).toBe(6)
    expect(settings.servingsPerPerson).toBe(1.5)
    expect(settings.units).toBe('metric')
  })

  it('round-trips "my kitchen has" equipment', async () => {
    await setKitchenEquipment('oven', true)
    await setKitchenEquipment('wok', true)
    expect(await listKitchenEquipment()).toEqual(new Set(['oven', 'wok']))

    await setKitchenEquipment('oven', false)
    expect(await listKitchenEquipment()).toEqual(new Set(['wok']))
  })
})

// S16: "ingredients I avoid".
describe('avoid ingredients round trip', () => {
  it('starts empty', async () => {
    expect(await listAvoidIngredients()).toEqual([])
  })

  it('adds an ingredient at a mode and reads it back', async () => {
    await setAvoidIngredient('sour_cream', 'hide')
    expect(await listAvoidIngredients()).toEqual([{ slug: 'sour_cream', mode: 'hide' }])
  })

  it('changing the mode replaces it, not adds a second row', async () => {
    await setAvoidIngredient('sour_cream', 'hide')
    await setAvoidIngredient('sour_cream', 'lower')
    expect(await listAvoidIngredients()).toEqual([{ slug: 'sour_cream', mode: 'lower' }])
  })

  it('setting mode to null removes it', async () => {
    await setAvoidIngredient('sour_cream', 'hide')
    await setAvoidIngredient('cool_whip', 'lower')
    await setAvoidIngredient('sour_cream', null)
    expect(await listAvoidIngredients()).toEqual([{ slug: 'cool_whip', mode: 'lower' }])
  })
})
