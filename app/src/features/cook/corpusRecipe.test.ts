// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { loadUnits, type UnitTable } from '../units/units'
import { corpusScale, formatLine, loadCorpusRecipe, recipeSwaps } from './corpusRecipe'
import { expandHave, loadTaxonomy, type Taxonomy } from './taxonomy'

let db: WebDb
let tax: Taxonomy
let units: UnitTable

beforeAll(async () => {
  db = await openFixtureDb()
  tax = await loadTaxonomy(db)
  units = await loadUnits(db)
})

afterAll(async () => {
  await db.close()
})

describe('corpus recipe detail', () => {
  it('scales "Serves 2" to 3 servings (D11) and converts per line', async () => {
    const recipe = (await loadCorpusRecipe(
      db,
      tax,
      'bbcgoodfood:gnocchi-with-peas-pancetta',
      'everything',
    ))!
    expect(recipe.servings).toBe(2)
    expect(recipe.steps.length).toBeGreaterThan(0)
    const { factor, target } = corpusScale(recipe, 2, 1.5)
    expect(target).toBe(3)
    expect(factor).toBe(1.5)
    const metric = recipe.lines.map((l) => formatLine(l, factor, 'metric', units, tax))
    expect(metric.slice(0, 3)).toEqual(['1.5 kg potato', '225-300 g double zero flour', '1½ egg'])
    // No quantity: the source's own words.
    expect(metric[3]).toBe('good grating of fresh nutmeg')
    const us = recipe.lines.map((l) => formatLine(l, factor, 'us', units, tax))
    expect(us[0]).toBe('3¼ lb potato')
    expect(us[4]).toBe('3 tbsp olive oil')
  })

  it('does not scale a yield that is not a head count, and shows the package size', async () => {
    const recipe = (await loadCorpusRecipe(db, tax, 'themealdb:53191', 'everything'))!
    expect(corpusScale(recipe, 2, 1.5)).toEqual({ factor: 1, target: null })
    const { rows } = await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 40')
    const tins = (await loadCorpusRecipe(db, tax, rows[0].key, 'everything'))!
    const line = tins.lines.find((l) => l.slug === 'canned_tomatoes')!
    expect(formatLine(line, 1, 'metric', units, tax)).toMatch(/^2 cans \(400 g\) /)
    expect(formatLine(line, 1, 'us', units, tax)).toMatch(/^2 cans \(14 oz\) /)
  })

  it('offers the fish sauce swap on the Pad Thai line, on hand first', async () => {
    const recipe = (await loadCorpusRecipe(db, tax, 'themealdb:53191', 'no_red_meat'))!
    expect(recipe.diet?.status).toBe('ok')
    const swaps = await recipeSwaps(
      db,
      tax,
      recipe,
      expandHave(tax, ['soy_sauce', 'nori']),
      'no_red_meat',
    )
    expect(swaps.get('fish_sauce')?.id).toBe('fish_sauce__soy_sauce-nori')
    expect(swaps.get('fish_sauce')?.haveAll).toBe(true)
  })

  it('returns null for an unknown key', async () => {
    expect(await loadCorpusRecipe(db, tax, 'nope:1', 'everything')).toBeNull()
  })
})
