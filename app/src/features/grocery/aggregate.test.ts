import { describe, expect, it } from 'vitest'
import type { Purchase } from '../../corpus/slugs'
import type { Unit } from '../../corpus/types'
import type { UnitTable } from '../units/units'
import { scaleFactor, targetServings } from '../scaling/scale'
import {
  aggregateGroceryLines,
  CHECK_YOU_HAVE,
  groupItemsByAisle,
  pluralName,
  SEE_RECIPE,
  type AggregateContext,
  type GroceryLineInput,
  type SlugMeta,
} from './aggregate'

/** The slice of `units` (corpus.db) this module needs, matching schema/corpus.sql's seed data
 * (cup is rounded to 240 ml so the S7 sums stay readable). */
const UNITS: UnitTable = new Map([
  ['g', { dimension: 'mass', toBase: 1 }],
  ['kg', { dimension: 'mass', toBase: 1000 }],
  ['lb', { dimension: 'mass', toBase: 453.592 }],
  ['ml', { dimension: 'volume', toBase: 1 }],
  ['cup', { dimension: 'volume', toBase: 240 }],
  ['tbsp', { dimension: 'volume', toBase: 14.7868 }],
  ['tsp', { dimension: 'volume', toBase: 4.92892 }],
  ['can', { dimension: 'count', toBase: null }],
  ['clove', { dimension: 'count', toBase: null }],
  ['piece', { dimension: 'count', toBase: null }],
  ['head', { dimension: 'count', toBase: null }],
  ['bunch', { dimension: 'count', toBase: null }],
  ['sprig', { dimension: 'count', toBase: null }],
])

function meta(
  name: string,
  aisle: string,
  extra: Partial<SlugMeta> = {},
  purchase: Purchase | null = null,
): SlugMeta {
  return { name, aisle, isStaple: false, density: null, eachG: null, purchase, ...extra }
}

/** Legacy slugs (no purchase fields): the S7 cases, which still add up as before. */
const LEGACY: Record<string, SlugMeta> = {
  onion: meta('onion', 'produce', { eachG: 150 }),
  all_purpose_flour: meta('all-purpose flour', 'pantry', { isStaple: true, density: 0.53 }),
  tomatoes: meta('tomatoes', 'produce'),
  bean_sprouts: meta('bean sprouts', 'produce'),
}

/** Slugs with taxonomy purchase fields, as in ingest/taxonomy/ingredients.yaml. */
const SHOP: Record<string, SlugMeta> = {
  garlic: meta(
    'garlic',
    'produce',
    { eachG: 5 },
    {
      shopUnit: 'head',
      yield: { qty: 10, unit: 'clove' },
      buyAs: null,
    },
  ),
  carrot: meta('carrot', 'produce', { eachG: 61 }, { shopUnit: 'piece', yield: null, buyAs: null }),
  mango: meta('mango', 'produce', { eachG: 200 }, { shopUnit: 'piece', yield: null, buyAs: null }),
  lemon: meta('lemon', 'produce', { eachG: 84 }, { shopUnit: 'piece', yield: null, buyAs: null }),
  lemon_juice: meta(
    'lemon juice',
    'produce',
    { density: 1.03 },
    {
      shopUnit: 'piece',
      yield: { qty: 45, unit: 'ml' },
      buyAs: 'lemon',
    },
  ),
  cilantro: meta(
    'cilantro',
    'produce',
    {},
    {
      shopUnit: 'bunch',
      yield: { qty: 1, unit: 'cup' },
      buyAs: null,
    },
  ),
  soy_sauce: meta(
    'soy sauce',
    'pantry',
    { density: 1.15 },
    {
      shopUnit: 'bottle',
      yield: { qty: 250, unit: 'ml' },
      buyAs: null,
    },
  ),
  rice: meta(
    'rice',
    'pantry',
    { density: 0.85 },
    {
      shopUnit: 'pack',
      yield: { qty: 1000, unit: 'g' },
      buyAs: null,
    },
  ),
  egg: meta(
    'egg',
    'dairy',
    { eachG: 50 },
    {
      shopUnit: 'pack',
      yield: { qty: 12, unit: 'piece' },
      buyAs: null,
    },
  ),
  egg_yolk: meta(
    'egg yolk',
    'dairy',
    { eachG: 17 },
    {
      shopUnit: 'pack',
      yield: { qty: 12, unit: 'piece' },
      buyAs: 'egg',
    },
  ),
  ground_beef: meta('ground beef', 'meat', {}, { shopUnit: 'g', yield: null, buyAs: null }),
  canned_tomatoes: meta(
    'canned tomatoes',
    'pantry',
    {},
    {
      shopUnit: 'can',
      yield: { qty: 400, unit: 'g' },
      buyAs: null,
    },
  ),
  thyme: meta(
    'thyme',
    'produce',
    {},
    {
      shopUnit: 'bunch',
      yield: { qty: 20, unit: 'sprig' },
      buyAs: null,
    },
  ),
}

const META: Record<string, SlugMeta> = { ...LEGACY, ...SHOP }

function ctx(overrides: Partial<AggregateContext> = {}): AggregateContext {
  return {
    units: UNITS,
    system: 'metric',
    metaFor: (slug) => META[slug] ?? meta(slug, 'other'),
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

/** name + amount only: what the shopper reads. */
function shown(lines: GroceryLineInput[], c: AggregateContext = ctx()) {
  return aggregateGroceryLines(lines, c).items.map((i) => `${i.name}: ${i.amount}`)
}

describe('grocery aggregation (S7 #2, expected lists written first)', () => {
  it('2 recipes using onion, one as pieces and one in grams, sum to one total', () => {
    const lines = [
      line({ slug: 'onion', raw: '1 onion', qty: 1, unit: null }),
      line({ slug: 'onion', raw: '200 g onion, diced', qty: 200, unit: 'g' }),
    ]
    const { items, checkThese } = aggregateGroceryLines(lines, ctx())
    expect(checkThese).toEqual([])
    expect(items).toEqual([
      { slug: 'onion', name: 'onion', aisle: 'produce', amount: '350 g', have: false, sources: [] },
    ])
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
      {
        slug: 'all_purpose_flour',
        name: 'all-purpose flour',
        aisle: 'pantry',
        amount: '227 g',
        have: true,
        sources: [],
      },
    ])
  })

  it('1 can plus 400 g of tomatoes convert to one gram total', () => {
    const lines = [
      line({
        slug: 'tomatoes',
        raw: '1 (400 g) can tomatoes',
        qty: 1,
        unit: 'can',
        pkgQty: 400,
        pkgUnit: 'g',
      }),
      line({ slug: 'tomatoes', raw: '400 g tomatoes, chopped', qty: 400, unit: 'g' }),
    ]
    expect(shown(lines)).toEqual(['tomatoes: 800 g'])
  })

  it('a kitchen item is subtracted: marked "have", not dropped', () => {
    const lines = [line({ slug: 'garlic', raw: '4 cloves garlic', qty: 4, unit: 'clove' })]
    const withoutHave = aggregateGroceryLines(lines, ctx())
    expect(withoutHave.items).toMatchObject([
      { slug: 'garlic', name: 'garlic', amount: '1 head (need 4 cloves)', have: false },
    ])

    const withHave = aggregateGroceryLines(lines, ctx({ haveSlugs: new Set(['garlic']) }))
    expect(withHave.items).toMatchObject([{ slug: 'garlic', have: true }])
  })

  it('scales 2 people x 1.5 servings/person on a 4-serving recipe before aggregating', () => {
    const people = 2
    const servingsPerPerson = 1.5
    expect(targetServings(people, servingsPerPerson)).toBe(3)
    const factor = scaleFactor(4, people, servingsPerPerson)
    expect(factor).toBe(0.75)

    // The recipe calls for 200 g onion at 4 servings; scaled to 3 (0.75x) that is 150 g.
    const lines = [line({ slug: 'onion', raw: '200 g onion', qty: 200 * factor, unit: 'g' })]
    expect(shown(lines)).toEqual(['onion: 150 g'])
  })

  it('never drops a line: only a line with no ingredient goes to "Check these" (S7c #4)', () => {
    const lines = [
      line({ slug: null, raw: 'salt to taste', qty: null, unit: null }),
      line({ slug: 'onion', raw: 'onion, a few', qty: null, unit: null }),
      line({ slug: 'garlic', raw: '1 knuckle garlic', qty: 1, unit: 'knuckle' as unknown as Unit }),
    ]
    const { items, checkThese } = aggregateGroceryLines(lines, ctx())
    expect(checkThese).toEqual([
      { raw: 'salt to taste', reason: 'no canonical ingredient matched' },
    ])
    expect(items).toMatchObject([
      { slug: 'garlic', aisle: 'produce', amount: SEE_RECIPE },
      { slug: 'onion', aisle: 'produce', amount: SEE_RECIPE },
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

describe('shoppable list: shop units, rounded up to what you can buy (S7c #3)', () => {
  it('garlic 1 head (need 3 cloves)', () => {
    expect(shown([line({ slug: 'garlic', qty: 3, unit: 'clove' })])).toEqual([
      'garlic: 1 head (need 3 cloves)',
    ])
  })

  it('12 cloves need 2 heads', () => {
    expect(shown([line({ slug: 'garlic', qty: 12, unit: 'clove' })])).toEqual([
      'garlic: 2 heads (need 12 cloves)',
    ])
  })

  it('carrot 1 (46 g): ¾ of a carrot is bought as one, its weight shown', () => {
    expect(shown([line({ slug: 'carrot', qty: 0.75, unit: 'piece' })])).toEqual([
      'carrot: 1 (46 g)',
    ])
  })

  it('whole pieces stay a plain count', () => {
    expect(shown([line({ slug: 'carrot', qty: 2, unit: 'piece' })])).toEqual(['carrots: 2'])
  })

  it('lemons 2 (need 90 ml juice): lemon juice is bought as lemons', () => {
    expect(shown([line({ slug: 'lemon_juice', qty: 90, unit: 'ml' })])).toEqual([
      'lemons: 2 (need 90 ml juice)',
    ])
  })

  it('6 tbsp of lemon juice (88.7 ml) is still 2 lemons, said in tbsp', () => {
    expect(shown([line({ slug: 'lemon_juice', qty: 6, unit: 'tbsp' })])).toEqual([
      'lemons: 2 (need 6 tbsp juice)',
    ])
  })

  it('"juice of 2 lemons" plus a whole lemon is 3 lemons', () => {
    const lines = [
      line({ slug: 'lemon_juice', raw: 'juice of 2 lemons', qty: 2, unit: 'piece' }),
      line({ slug: 'lemon', raw: '1 lemon, sliced', qty: 1, unit: 'piece' }),
    ]
    expect(shown(lines)).toEqual(['lemons: 3 (need juice of 2 + 1)'])
  })

  it('cilantro 1 bunch', () => {
    expect(shown([line({ slug: 'cilantro', qty: 2, unit: 'tbsp' })])).toEqual([
      'cilantro: 1 bunch (need 2 tbsp)',
    ])
  })

  it('3 cups of cilantro is 3 bunches; a "1 bunch" line counts as one', () => {
    const lines = [
      line({ slug: 'cilantro', qty: 2, unit: 'cup' }),
      line({ slug: 'cilantro', qty: 1, unit: 'bunch' }),
    ]
    expect(shown(lines)).toEqual(['cilantro: 3 bunches (need 480 ml + 1 bunch)'])
  })

  it('thyme sprigs round up to a bunch', () => {
    expect(shown([line({ slug: 'thyme', qty: 4, unit: 'sprig' })])).toEqual([
      'thyme: 1 bunch (need 4 sprigs)',
    ])
  })

  it('soy sauce in a small amount: "check you have some"', () => {
    expect(shown([line({ slug: 'soy_sauce', qty: 1, unit: 'tbsp' })])).toEqual([
      `soy sauce: ${CHECK_YOU_HAVE} (need 1 tbsp)`,
    ])
  })

  it('soy sauce in a large amount (over half a bottle): buy a bottle', () => {
    expect(shown([line({ slug: 'soy_sauce', qty: 200, unit: 'ml' })])).toEqual([
      'soy sauce: 1 bottle (need 200 ml)',
    ])
  })

  it('a pantry pack bought in bulk: rice needed at 1.5 kg is 2 packs', () => {
    expect(shown([line({ slug: 'rice', qty: 1.5, unit: 'kg' })])).toEqual([
      'rice: 2 packs (need 1.5 kg)',
    ])
  })

  it('by weight: ground beef rounded up to the next 50 g', () => {
    expect(shown([line({ slug: 'ground_beef', qty: 1, unit: 'lb' })])).toEqual([
      'ground beef: 500 g',
    ])
  })

  it('cans: 1 (400 g) can plus a plain can is 2 cans', () => {
    const lines = [
      line({ slug: 'canned_tomatoes', qty: 1, unit: 'can', pkgQty: 400, pkgUnit: 'g' }),
      line({ slug: 'canned_tomatoes', qty: 1, unit: 'can' }),
    ]
    expect(shown(lines)).toEqual(['canned tomatoes: 2 cans (need 400 g + 1 can)'])
  })

  it('egg yolks are bought as eggs, by the pack', () => {
    const lines = [
      line({ slug: 'egg', qty: 2, unit: 'piece' }),
      line({ slug: 'egg_yolk', qty: 3, unit: 'piece' }),
    ]
    expect(shown(lines)).toEqual(['egg: 1 pack (need 2 + 3 yolks)'])
  })

  it('a kitchen item that is bought as something else: have lemons covers lemon juice', () => {
    const lines = [line({ slug: 'lemon_juice', qty: 30, unit: 'ml' })]
    expect(aggregateGroceryLines(lines, ctx({ haveSlugs: new Set(['lemon']) })).items[0].have).toBe(
      true,
    )
  })

  it('each line keeps its source recipes, once each, in plan order (shown when tapped)', () => {
    const lines = [
      line({ slug: 'garlic', qty: 2, unit: 'clove', recipe: 'Nasi Goreng' }),
      line({ slug: 'garlic', qty: 1, unit: 'clove', recipe: 'Mango Salad' }),
      line({ slug: 'garlic', qty: null, recipe: 'Nasi Goreng' }),
    ]
    expect(aggregateGroceryLines(lines, ctx()).items[0].sources).toEqual([
      'Nasi Goreng',
      'Mango Salad',
    ])
  })
})

describe('missing amounts are not "Check these" (S7c #4)', () => {
  it('no quantity: the item is on the list in its aisle, "amount: see recipe"', () => {
    const { items, checkThese } = aggregateGroceryLines(
      [line({ slug: 'carrot', raw: 'carrot', qty: null })],
      ctx(),
    )
    expect(checkThese).toEqual([])
    expect(items).toMatchObject([{ name: 'carrot', aisle: 'produce', amount: SEE_RECIPE }])
  })

  it('a known amount plus a missing one: rounded up from what is known, "+ more, see recipe"', () => {
    const lines = [
      line({ slug: 'carrot', qty: 0.75, unit: 'piece' }),
      line({ slug: 'carrot', qty: null }),
    ]
    expect(shown(lines)).toEqual(['carrot: 1 (46 g + more, see recipe)'])
  })

  it('a pantry bottle with no amount: "check you have some"', () => {
    expect(shown([line({ slug: 'soy_sauce', qty: null })])).toEqual([
      `soy sauce: ${CHECK_YOU_HAVE}`,
    ])
  })

  it('a staple with no amount is "have", not "Check these"', () => {
    const { items, checkThese } = aggregateGroceryLines(
      [line({ slug: 'all_purpose_flour', qty: null })],
      ctx(),
    )
    expect(checkThese).toEqual([])
    expect(items).toMatchObject([{ slug: 'all_purpose_flour', have: true }])
  })
})

describe('unit-less amounts: the "¾" bug (S7c #1)', () => {
  // The exact input that broke: Food.com's "Green Mango Salad With Cilantro Vinaigrette" at
  // 0.75x. The source ships "3" and "lemon juice" in separate columns with no unit, the parser
  // gives the bare number the unit 'piece', and the S7 list printed "lemon juice 2¼",
  // "soy sauce ¾", "cilantro ¾", "bean sprouts ¾" (a piece has no label).
  const foodcom = (slug: string, qty: number) =>
    line({ slug, raw: `${qty} ${slug}`, qty: qty * 0.75, unit: 'piece', unitStripped: true })

  it('never shows a bare fraction for something you do not count', () => {
    const lines = [
      foodcom('lemon_juice', 3),
      foodcom('soy_sauce', 1),
      foodcom('cilantro', 1),
      foodcom('bean_sprouts', 1),
      foodcom('mango', 1),
      foodcom('carrot', 1),
    ]
    expect(shown(lines)).toEqual([
      `bean sprouts: ${SEE_RECIPE}`,
      'carrot: 1 (46 g)',
      `cilantro: ${SEE_RECIPE}`,
      `lemon: ${SEE_RECIPE}`,
      'mango: 1 (150 g)',
      `soy sauce: ${CHECK_YOU_HAVE}`,
    ])
    for (const text of shown(lines)) expect(text).not.toMatch(/: [\d¼½¾⅓⅔⅛]+$/u)
  })

  it('the same bare count from a source that keeps its units is still a count', () => {
    // "juice of 3 lemons" parses to lemon_juice, 3 pieces: three lemons.
    const lines = [line({ slug: 'lemon_juice', qty: 3, unit: 'piece' })]
    expect(shown(lines)).toEqual(['lemons: 3 (need juice of 3)'])
  })

  it('a bare count of a slug with no purchase fields and no weight is "see recipe" only when unit-stripped', () => {
    expect(shown([line({ slug: 'bean_sprouts', qty: 2, unit: 'piece' })])).toEqual([
      'bean sprouts: 2',
    ])
    expect(
      shown([line({ slug: 'bean_sprouts', qty: 2, unit: 'piece', unitStripped: true })]),
    ).toEqual([`bean sprouts: ${SEE_RECIPE}`])
  })
})

describe('pluralName', () => {
  it('pluralises the list names', () => {
    expect(['lemon', 'tomato', 'cherry', 'peach', 'bean sprouts'].map(pluralName)).toEqual([
      'lemons',
      'tomatoes',
      'cherries',
      'peaches',
      'bean sprouts',
    ])
  })
})
