// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { loadTaxonomy } from '../cook/taxonomy'
import {
  convertAmount,
  formatAmount,
  formatFraction,
  loadUnits,
  type Amount,
  type UnitTable,
} from './units'

let db: WebDb
let units: UnitTable
let flourDensity: number

beforeAll(async () => {
  db = await openFixtureDb()
  units = await loadUnits(db)
  flourDensity = (await loadTaxonomy(db)).density.get('all_purpose_flour')!
})

afterAll(async () => {
  await db.close()
})

const amt = (qty: number, unit: string | null, qtyMax: number | null = null): Amount => ({
  qty,
  qtyMax,
  unit,
})

describe('metric', () => {
  it('weighs a cup of flour: 236.588 ml x 0.53 g/ml = 125.4 g', () => {
    expect(flourDensity).toBe(0.53)
    const out = convertAmount(amt(1, 'cup'), 'metric', units, flourDensity)
    expect(out.unit).toBe('g')
    expect(out.qty).toBeCloseTo(125.39, 2)
    expect(formatAmount(out)).toBe('125 g')
  })

  it('turns oz into g: 8 oz = 226.8 g, and 3 lb into kg', () => {
    const oz = convertAmount(amt(8, 'oz'), 'metric', units, null)
    expect(oz.unit).toBe('g')
    expect(oz.qty).toBeCloseTo(226.796, 3)
    expect(formatAmount(oz)).toBe('227 g')
    expect(formatAmount(convertAmount(amt(3, 'lb'), 'metric', units, null))).toBe('1.36 kg')
  })

  it('pours a cup with no known density as ml, and keeps tsp, tbsp and counts', () => {
    expect(formatAmount(convertAmount(amt(2, 'cup'), 'metric', units, null))).toBe('473 ml')
    expect(convertAmount(amt(2, 'tbsp'), 'metric', units, 1.15)).toEqual(amt(2, 'tbsp'))
    expect(convertAmount(amt(3, 'clove'), 'metric', units, null)).toEqual(amt(3, 'clove'))
  })

  it('converts both ends of a range', () => {
    const out = convertAmount(amt(1, 'cup', 2), 'metric', units, flourDensity)
    expect(formatAmount(out)).toBe('125-251 g')
  })
})

describe('US', () => {
  it('turns g into oz and lb', () => {
    expect(formatAmount(convertAmount(amt(125, 'g'), 'us', units, null))).toBe('4½ oz')
    expect(formatAmount(convertAmount(amt(1, 'kg'), 'us', units, null))).toBe('2¼ lb')
  })

  it('turns ml into cups, tbsp or tsp by size', () => {
    expect(formatAmount(convertAmount(amt(250, 'ml'), 'us', units, null))).toBe('1 cup')
    expect(formatAmount(convertAmount(amt(30, 'ml'), 'us', units, null))).toBe('2 tbsp')
    expect(formatAmount(convertAmount(amt(5, 'ml'), 'us', units, null))).toBe('1 tsp')
  })

  it('leaves US units alone', () => {
    expect(convertAmount(amt(1, 'cup'), 'us', units, flourDensity)).toEqual(amt(1, 'cup'))
  })
})

describe('formatting', () => {
  it('writes fractions', () => {
    expect(formatFraction(1.5)).toBe('1½')
    expect(formatFraction(0.33)).toBe('⅓')
    expect(formatFraction(2)).toBe('2')
    expect(formatFraction(0.97)).toBe('1')
    expect(formatFraction(12.4)).toBe('12')
  })

  it('leaves the unit off plain pieces', () => {
    expect(formatAmount(amt(2, 'piece'))).toBe('2')
    expect(formatAmount(amt(1, null))).toBe('1')
  })
})
