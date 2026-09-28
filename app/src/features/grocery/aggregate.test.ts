import { describe, expect, it } from 'vitest'
import type { Unit } from '../../corpus/types'
import type { UnitTable } from '../units/units'
import { scaleFactor, targetServings } from '../scaling/scale'
import {
  aggregateGroceryLines,
  groupItemsByAisle,
  type AggregateContext,
  type GroceryLineInput,
  type SlugMeta,
} from './aggregate'

/** The slice of `units` (corpus.db) this module needs, matching schema/corpus.sql's seed data. */
const UNITS: UnitTable = new Map([
  ['g', { dimension: 'mass', toBase: 1 }],
  ['kg', { dimension: 'mass', toBase: 1000 }],
  ['ml', { dimension: 'volume', toBase: 1 }],
  ['cup', { dimension: 'volume', toBase: 240 }],
  ['can', { dimension: 'count', toBase: null }],
  ['clove', { dimension: 'count', toBase: null }],
])

const META: Record<string, SlugMeta> = {
  onion: { name: 'onion', aisle: 'produce', isStaple: false, density: null, eachG: 150 },
  all_purpose_flour: {
    name: 'all-purpose flour',
    aisle: 'pantry',
    isStaple: true,
    density: 0.53,
    eachG: null,
  },
  tomatoes: { name: 'tomatoes', aisle: 'produce', isStaple: false, density: null, eachG: null },
  garlic: { name: 'garlic', aisle: 'produce', isStaple: false, density: null, eachG: null },
}

function ctx(overrides: Partial<AggregateContext> = {}): AggregateContext {
  return {
    units: UNITS,
    system: 'metric',
    metaFor: (slug) => META[slug] ?? { name: slug, aisle: 'other', isStaple: false, density: null, eachG: null },
    haveSlugs: new Set(),
    ...overrides,
  }
}

function line(partial: Partial<GroceryLineInput>): GroceryLineInput {
  return {
    slug: null,
    raw: '',
    qty: null,
    qtyMax: null,
    unit: null,
    pkgQty: null,
    pkgUnit: null,
    ...partial,
  }
}

describe('grocery aggregation (S7 #2, expected lists written first)', () => {
  it('2 recipes using onion, one as pieces and one in grams, sum to one total', () => {
    const lines = [
      line({ slug: 'onion', raw: '1 onion', qty: 1, unit: null }),
      line({ slug: 'onion', raw: '200 g onion, diced', qty: 200, unit: 'g' }),
    ]
    const { items, checkThese } = aggregateGroceryLines(lines, ctx())
    expect(checkThese).toEqual([])
    expect(items).toEqual([{ slug: 'onion', name: 'onion', aisle: 'produce', amount: '350 g', have: false }])
  })

  it('cups of flour plus grams of flour convert to one gram total', () => {
    const lines = [
      line({ slug: 'all_purpose_flour', raw: '1 cup flour', qty: 1, unit: 'cup' }),
      line({ slug: 'all_purpose_flour', raw: '100 g flour', qty: 100, unit: 'g' }),
    ]
    const { items } = aggregateGroceryLines(lines, ctx())
    // 1 cup * 240 ml * 0.53 g/ml = 127.2 g; + 100 g = 227.2 g, rounded to "227 g" (>= 10 g is
    // shown as a whole number, formatMetric in features/units/units.ts); staple, so "have".
    expect(items).toEqual([
      { slug: 'all_purpose_flour', name: 'all-purpose flour', aisle: 'pantry', amount: '227 g', have: true },
    ])
  })

  it('1 can plus 400 g of tomatoes convert to one gram total', () => {
    const lines = [
      line({ slug: 'tomatoes', raw: '1 (400 g) can tomatoes', qty: 1, unit: 'can', pkgQty: 400, pkgUnit: 'g' }),
      line({ slug: 'tomatoes', raw: '400 g tomatoes, chopped', qty: 400, unit: 'g' }),
    ]
    const { items } = aggregateGroceryLines(lines, ctx())
    expect(items).toEqual([
      { slug: 'tomatoes', name: 'tomatoes', aisle: 'produce', amount: '800 g', have: false },
    ])
  })

  it('a kitchen item is subtracted: marked "have" and collapsed, not dropped', () => {
    const lines = [line({ slug: 'garlic', raw: '4 cloves garlic', qty: 4, unit: 'clove' })]
    const withoutHave = aggregateGroceryLines(lines, ctx())
    expect(withoutHave.items).toEqual([
      { slug: 'garlic', name: 'garlic', aisle: 'produce', amount: '4 cloves', have: false },
    ])

    const withHave = aggregateGroceryLines(lines, ctx({ haveSlugs: new Set(['garlic']) }))
    expect(withHave.items).toEqual([
      { slug: 'garlic', name: 'garlic', aisle: 'produce', amount: '4 cloves', have: true },
    ])
  })

  it('scales 2 people x 1.5 servings/person on a 4-serving recipe before aggregating', () => {
    const people = 2
    const servingsPerPerson = 1.5
    expect(targetServings(people, servingsPerPerson)).toBe(3)
    const factor = scaleFactor(4, people, servingsPerPerson)
    expect(factor).toBe(0.75)

    // The recipe calls for 200 g onion at 4 servings; scaled to 3 (0.75x) that is 150 g.
    const lines = [line({ slug: 'onion', raw: '200 g onion', qty: 200 * factor, unit: 'g' })]
    const { items } = aggregateGroceryLines(lines, ctx())
    expect(items).toEqual([{ slug: 'onion', name: 'onion', aisle: 'produce', amount: '150 g', have: false }])
  })

  it('never drops an unparseable line: no slug, no quantity, or an unknown unit', () => {
    const lines = [
      line({ slug: null, raw: 'salt to taste', qty: null, unit: null }),
      line({ slug: 'onion', raw: 'onion, a few', qty: null, unit: null }),
      line({ slug: 'garlic', raw: '1 knuckle garlic', qty: 1, unit: 'knuckle' as unknown as Unit }),
    ]
    const { items, checkThese } = aggregateGroceryLines(lines, ctx())
    expect(items).toEqual([])
    expect(checkThese).toEqual([
      { raw: 'salt to taste', reason: 'no canonical ingredient matched' },
      { raw: 'onion, a few', reason: 'no quantity given' },
      { raw: '1 knuckle garlic', reason: 'unit "knuckle" is not recognised' },
    ])
  })

  it('groups items by aisle, alphabetically', () => {
    const { items } = aggregateGroceryLines(
      [
        line({ slug: 'onion', raw: '1 onion', qty: 1, unit: null }),
        line({ slug: 'all_purpose_flour', raw: '100 g flour', qty: 100, unit: 'g' }),
      ],
      ctx(),
    )
    expect(groupItemsByAisle(items).map(([aisle]) => aisle)).toEqual(['pantry', 'produce'])
  })
})
