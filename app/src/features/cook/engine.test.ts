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
    // Re-ranked by S6b's floor and coverage band (#4). Before: the margarita (2/4, 50%) ranked
    // second, ahead of every recipe below it here, on raw coverage alone (orch/reports/S6.md,
    // "Open"). After: the floor (covered < 3 may not outrank a bigger covered count) drops it
    // behind everything down to `themealdb:53368` (5 covered), and coverage is banded to 10
    // points so `themealdb:52953`/`recipenlg:1470870`/`foodcom:000534`/the salsa (all 29-37%)
    // rank by covered count (5, 4, 3, 3) rather than by their raw percentages.
    expect(results.slice(1, 7).map((r) => r.key)).toEqual([
      'themealdb:52953',
      'recipenlg:1470870',
      'foodcom:000534',
      'foodwishes:nectarine-salsa-stone-cold-delicious',
      'themealdb:53368',
      'foodwishes:the-perfect-margarita-according-to-me',
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
    // S6b #4: covers 4 non-staple ingredients (the margarita covers only 2), so it now leads.
    expect(results[0].key).toBe('recipenlg:1470870')
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

  it('"use only" the oven gives 6, led by the corn & sausage muffins', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1, useOnly: ['oven'] })
    expect(stats.candidates).toBe(6)
    // S6b #4: both are in the same coverage band (13-14%); 2 covered beats 1.
    expect(results[0].key).toBe('foodwishes:fresh-corn-sausage-muffins-twelve')
    expect(results[1].key).toBe('recipenlg:636138')
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
    // S6b #4: themealdb:52805, 52807 and recipenlg:1564326 all land in the 20-29% band;
    // covered count (4, then 3, then 2) now breaks the tie instead of quality.
    expect(indian.results.slice(0, 3).map((r) => r.key)).toEqual([
      K2_RECIPE,
      'themealdb:53400',
      'themealdb:52805',
    ])
    expect(indian.results[0].coverage).toBe(1)
    expect(indian.results[0].missing).toEqual([])
    expect(missingSummary(indian.results[0])).toBeNull()
    const onePot = await matchRecipes(db, { ...BASE, have, cuisine: 'indian', onePot: true })
    expect(onePot.results.map((r) => r.key)).toEqual([K2_RECIPE, 'themealdb:53400'])
  })

  it('the floor keeps a 1-ingredient 100% match from outranking the curry (135 candidates)', async () => {
    const have = await coreOf(278)
    const { results, stats } = await matchRecipes(db, { ...BASE, have, limit: 200 })
    expect(stats.candidates).toBe(135)
    // recipenlg:1271214 is a 1/1 match (100% coverage, same band as the curry's 10/10) — the
    // pre-S6b ranking only kept it second on a quality tiebreak that happened to go the right
    // way (orch/reports/S6.md, "Open"). S6b #4's floor now keeps it behind anything covering
    // more, on principle rather than by accident: it falls to position 66 (of 135), behind
    // every candidate with 2+ covered ingredients, rather than riding a lucky tiebreak at #2.
    expect(results[0].key).toBe(K2_RECIPE)
    expect(results.slice(1, 3).map((r) => r.key)).toEqual(['themealdb:53158', 'themealdb:52956'])
    const casserole = results.find((r) => r.key === 'recipenlg:1271214')!
    expect(casserole.covered).toBe(1)
    expect(results.indexOf(casserole)).toBe(65)
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
    expect(stats).toEqual({ candidates: 0, scored: 0, hidden: { count: 0, bySlug: new Map() } })
  })
})

async function latency(target: WebDb, kitchens: string[][]): Promise<[number, number]> {
  const queries: MatchQuery[] = []
  for (const have of kitchens) {
    queries.push({ ...BASE, have })
    queries.push({ ...BASE, have, diet: 'vegetarian', maxMinutes: 30 })
    queries.push({ ...BASE, have, onePot: true, kitchen: ['stovetop', 'oven'] })
    queries.push({ ...BASE, have, useOnly: ['oven'] })
  }
  await matchRecipes(target, queries[0]) // warm the taxonomy cache
  const times: number[] = []
  for (let i = 0; i < 60; i++) {
    const start = performance.now()
    await matchRecipes(target, queries[i % queries.length])
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return [times[Math.floor(times.length * 0.5)], times[Math.floor(times.length * 0.95)]]
}

const PANTRY = ['chicken', 'onion', 'garlic', 'rice', 'tomatoes', 'eggs', 'milk', 'cheddar']

describe('latency', () => {
  it('on fixture.db: p50 and p95 over 60 searches', async () => {
    const [p50, p95] = await latency(db, [K1, await coreOf(278), PANTRY])
    console.log(`ENGINE_LATENCY fixture.db p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=60`)
    expect(p95).toBeLessThan(250)
  })

  // Skipped unless S6_BENCH_DB names a bigger corpus.db build (e.g. the 5k sample).
  const bench = process.env.S6_BENCH_DB
  it.skipIf(!bench)('on $S6_BENCH_DB: p50 and p95 over 60 searches', async () => {
    const big = await openFixtureDb(bench)
    const [p50, p95] = await latency(big, [K1, PANTRY])
    console.log(`ENGINE_LATENCY ${bench} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=60`)
    await big.close()
  })
})
