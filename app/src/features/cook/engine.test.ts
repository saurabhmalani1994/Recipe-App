// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { matchRecipes, missingSummary, type MatchQuery } from './engine'
import { fittingSwaps, loadSwapTable, recipeContexts } from './swaps'
import { expandHave, loadTaxonomy } from './taxonomy'

/**
 * Planted kitchens on src/corpus/fixture.db. The expected values were written before the engine
 * first ran: coverage, filters and candidate counts come from the independent oracle
 * `app/scripts/match_oracle.py` (plain Python over the same file); the substitutions were read
 * off the `substitutions` table by hand.
 */

let db: WebDb

beforeAll(async () => {
  db = await openFixtureDb()
})

afterAll(async () => {
  await db.close()
})

const BASE: MatchQuery = {
  have: [],
  cuisine: null,
  diet: 'everything',
  kitchen: null,
  useOnly: null,
  onePot: false,
  maxMinutes: null,
}

// Pad Thai's core slugs (recipe 283, themealdb:53191) minus fish sauce, plus soy sauce and nori.
const K1 = [
  'bean_sprouts',
  'cayenne',
  'cilantro',
  'green_onion',
  'lime',
  'lime_juice',
  'muscovado_sugar',
  'nori',
  'peanuts',
  'rice_noodles',
  'shrimp',
  'soy_sauce',
  'sweet_chili_sauce',
]

// Kidney Bean Curry's core slugs (recipe 278, themealdb:52868): indian, main, one pot, 32 min.
const K2_RECIPE = 'themealdb:52868'

async function coreOf(recipeId: number): Promise<string[]> {
  const { rows } = await db.query<{ slug: string }>(
    'SELECT slug FROM recipe_slugs WHERE recipe_id = ? AND core = 1',
    [recipeId],
  )
  return rows.map((r) => r.slug)
}

describe('planted kitchen K1: Pad Thai without fish sauce', () => {
  it('ranks Pad Thai first at 11/12 with fish sauce swappable for soy sauce + nori', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1 })
    expect(stats.candidates).toBe(96)
    const top = results[0]
    expect(top.key).toBe('themealdb:53191')
    expect(top.covered).toBe(11)
    expect(top.needed).toBe(12)
    expect(top.missing).toEqual([])
    expect(top.substitutable.map((s) => [s.slug, s.swap.id])).toEqual([
      ['fish_sauce', 'fish_sauce__soy_sauce-nori'],
    ])
    expect(missingSummary(top)).toBe('missing 1: fish sauce, swap: soy sauce + nori')
    // The next four by coverage, from the oracle.
    expect(results.slice(1, 5).map((r) => r.key)).toEqual([
      'foodwishes:the-perfect-margarita-according-to-me',
      'foodcom:000534',
      'foodwishes:nectarine-salsa-stone-cold-delicious',
      'foodcom:000334',
    ])
  })

  it('leaves fish sauce truly missing when the only swap on hand is quality 1 (soy + lime)', async () => {
    const have = K1.filter((s) => s !== 'nori')
    const { results } = await matchRecipes(db, { ...BASE, have })
    const padThai = results.find((r) => r.key === 'themealdb:53191')!
    expect(padThai.substitutable).toEqual([])
    expect(padThai.missing.map((m) => m.slug)).toEqual(['fish_sauce'])
  })

  it('drops Pad Thai under Vegetarian (status no) and keeps 58 candidates', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1, diet: 'vegetarian' })
    expect(stats.candidates).toBe(58)
    expect(results.map((r) => r.key)).not.toContain('themealdb:53191')
    expect(results[0].key).toBe('foodwishes:the-perfect-margarita-according-to-me')
    for (const r of results) expect(['ok', 'adaptable']).toContain(r.diet?.status)
  })

  it('filters by cuisine: thai is Pad Thai alone, vietnamese has 5', async () => {
    const thai = await matchRecipes(db, { ...BASE, have: K1, cuisine: 'thai' })
    expect(thai.results.map((r) => r.key)).toEqual(['themealdb:53191'])
    const vietnamese = await matchRecipes(db, { ...BASE, have: K1, cuisine: 'vietnamese' })
    expect(vietnamese.stats.candidates).toBe(5)
    expect(vietnamese.results[0].key).toBe('themealdb:53247')
  })

  it('one pot (R9: one_pot AND course main) gives 30, led by Shrimp Chow Fun', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1, onePot: true })
    expect(stats.candidates).toBe(30)
    expect(results[0].key).toBe('themealdb:52953')
    for (const r of results) expect(r.course).toBe('main')
  })

  it('under 30 minutes gives 37; a kitchen of only a stovetop gives 50', async () => {
    const quick = await matchRecipes(db, { ...BASE, have: K1, maxMinutes: 30 })
    expect(quick.stats.candidates).toBe(37)
    for (const r of quick.results) expect(r.totalMin).toBeLessThanOrEqual(30)
    const stove = await matchRecipes(db, { ...BASE, have: K1, kitchen: ['stovetop'] })
    expect(stove.stats.candidates).toBe(50)
  })

  it('"use only" the oven gives 6, led by Barbecued Pork Tenderloin', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1, useOnly: ['oven'] })
    expect(stats.candidates).toBe(6)
    expect(results[0].key).toBe('recipenlg:636138')
  })

  it('an empty "my kitchen has" means not set, so it filters nothing', async () => {
    const { stats } = await matchRecipes(db, { ...BASE, have: K1, kitchen: [] })
    expect(stats.candidates).toBe(96)
  })
})

describe('planted kitchen K2: exactly Kidney Bean Curry', () => {
  it('puts it first at full coverage for indian, and for indian one-pot', async () => {
    const have = await coreOf(278)
    expect(have).toHaveLength(10)
    const indian = await matchRecipes(db, { ...BASE, have, cuisine: 'indian' })
    expect(indian.stats.candidates).toBe(8)
    expect(indian.results.slice(0, 3).map((r) => r.key)).toEqual([
      K2_RECIPE,
      'themealdb:53400',
      'themealdb:52807',
    ])
    expect(indian.results[0].coverage).toBe(1)
    expect(indian.results[0].missing).toEqual([])
    expect(missingSummary(indian.results[0])).toBeNull()
    const onePot = await matchRecipes(db, { ...BASE, have, cuisine: 'indian', onePot: true })
    expect(onePot.results.map((r) => r.key)).toEqual([K2_RECIPE, 'themealdb:53400'])
  })

  it('breaks the tie at full coverage on quality (any cuisine: 135 candidates)', async () => {
    const have = await coreOf(278)
    const { results, stats } = await matchRecipes(db, { ...BASE, have })
    expect(stats.candidates).toBe(135)
    expect(results.slice(0, 2).map((r) => r.key)).toEqual([K2_RECIPE, 'recipenlg:1271214'])
  })
})

describe('planted kitchen K3: parent and child slugs', () => {
  async function coveredIn(have: string[], key: string): Promise<number> {
    const { results } = await matchRecipes(db, { ...BASE, have, limit: 300 })
    return results.find((r) => r.key === key)?.covered ?? 0
  }

  it('chicken covers chicken_breast; chicken_cutlet (a kind of breast) does too', async () => {
    const wraps = (await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 74')).rows[0]
      .key
    expect(await coveredIn(['chicken'], wraps)).toBe(1)
    expect(await coveredIn(['chicken_cutlet'], wraps)).toBe(1)
    expect(await coveredIn(['chicken_thigh'], wraps)).toBe(0)
  })

  it('red_onion covers onion but not yellow_onion; onion covers both', async () => {
    const corn = (await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 80')).rows[0]
      .key
    const sfincione = (await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 119'))
      .rows[0].key
    expect(await coveredIn(['red_onion'], corn)).toBe(1)
    expect(await coveredIn(['red_onion'], sfincione)).toBe(0)
    expect(await coveredIn(['onion'], corn)).toBe(1)
    expect(await coveredIn(['onion'], sfincione)).toBe(1)
  })

  it('expands one level down and all the way up, never sideways', async () => {
    const tax = await loadTaxonomy(db)
    const have = expandHave(tax, ['chicken', 'salt_cod'])
    expect(have.has('chicken_drumsticks')).toBe(true) // child
    expect(have.has('chicken_legs')).toBe(false) // grandchild
    expect(have.has('cod')).toBe(true) // parent
    expect(have.has('fish')).toBe(true) // grandparent
    expect(have.has('black_cod')).toBe(false) // sibling
    expect(have.has('salt')).toBe(true) // staple, always assumed
  })
})

describe('substitutions: context and diet', () => {
  it('a stir-fry-only swap does not fit a dessert; an "any" swap does', async () => {
    const tax = await loadTaxonomy(db)
    const table = await loadSwapTable(db, tax, ['fish_sauce'])
    const have = expandHave(tax, ['soy_sauce', 'nori', 'vegan_fish_sauce'])
    const dessert = fittingSwaps(table, 'fish_sauce', have, {
      contexts: recipeContexts('dessert', 'Lime tart'),
      cuisine: null,
      diet: 'everything',
    })
    expect(dessert.map((s) => s.id)).toEqual(['fish_sauce__vegan_fish_sauce'])
    const main = fittingSwaps(table, 'fish_sauce', have, {
      contexts: recipeContexts('main', 'Pad Thai'),
      cuisine: 'thai',
      diet: 'everything',
    })
    expect(main.map((s) => s.id)).toEqual([
      'fish_sauce__vegan_fish_sauce',
      'fish_sauce__soy_sauce-nori',
      'fish_sauce__anchovy_paste-water',
    ])
  })

  it('drops swaps the diet rules out (R7 vegetarian: explicit meat; R8 no red meat)', async () => {
    const tax = await loadTaxonomy(db)
    const table = await loadSwapTable(db, tax, ['beef_stock'])
    const ids = (diet: 'everything' | 'vegetarian' | 'no_red_meat') =>
      fittingSwaps(table, 'beef_stock', new Set(), {
        contexts: recipeContexts('main', 'Beef stew'),
        cuisine: null,
        diet,
      })
        .map((s) => s.id)
        .sort()
    expect(ids('everything')).toEqual([
      'beef_stock__beef_bouillon',
      'beef_stock__chicken_stock-soy_sauce',
      'beef_stock__mushroom_stock',
      'beef_stock__vegetable_stock-soy_sauce-tomato_paste',
    ])
    expect(ids('no_red_meat')).toEqual([
      'beef_stock__chicken_stock-soy_sauce',
      'beef_stock__mushroom_stock',
      'beef_stock__vegetable_stock-soy_sauce-tomato_paste',
    ])
    expect(ids('vegetarian')).toEqual([
      'beef_stock__mushroom_stock',
      'beef_stock__vegetable_stock-soy_sauce-tomato_paste',
    ])
  })
})

describe('engine invariants over the whole fixture', () => {
  it('its core count equals recipes.core_slug_count for every recipe it scores', async () => {
    const { rows } = await db.query<{ slug: string }>('SELECT slug FROM ingredients')
    const everything = rows.map((r) => r.slug)
    const { results, stats } = await matchRecipes(db, { ...BASE, have: everything, limit: 400 })
    const counts = new Map(
      (
        await db.query<{ key: string; n: number; u: number }>(
          'SELECT key, core_slug_count AS n, unresolved_count AS u FROM recipes',
        )
      ).rows.map((r) => [r.key, r.n + r.u]),
    )
    // Every recipe with a core slug: 300 minus those whose lines are all staples or unreadable.
    const { rows: withCore } = await db.query<{ n: number }>(
      'SELECT count(*) AS n FROM recipes WHERE core_slug_count > 0',
    )
    expect(stats.candidates).toBe(withCore[0].n)
    for (const r of results) {
      expect(r.needed).toBe(counts.get(r.key))
      expect(r.missing.every((m) => m.slug === null)).toBe(true)
      expect(r.substitutable).toEqual([])
    }
  })

  it('returns nothing, and says so, for an empty kitchen', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: [] })
    // Staples are never core, so they alone match no recipe.
    expect(results).toEqual([])
    expect(stats).toEqual({ candidates: 0, scored: 0 })
  })
})

describe('latency on fixture.db', () => {
  it('reports p50 and p95 over 60 searches', async () => {
    const kitchens = [K1, await coreOf(278), ['chicken', 'onion', 'garlic', 'rice', 'tomatoes']]
    const queries: MatchQuery[] = []
    for (const have of kitchens) {
      queries.push({ ...BASE, have })
      queries.push({ ...BASE, have, diet: 'vegetarian', maxMinutes: 30 })
      queries.push({ ...BASE, have, onePot: true, kitchen: ['stovetop', 'oven'] })
      queries.push({ ...BASE, have, useOnly: ['oven'] })
    }
    await matchRecipes(db, queries[0]) // warm the taxonomy cache
    const times: number[] = []
    for (let i = 0; i < 60; i++) {
      const start = performance.now()
      await matchRecipes(db, queries[i % queries.length])
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const p50 = times[Math.floor(times.length * 0.5)]
    const p95 = times[Math.floor(times.length * 0.95)]
    console.log(`ENGINE_LATENCY fixture.db p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=60`)
    expect(p95).toBeLessThan(250)
  })
})
