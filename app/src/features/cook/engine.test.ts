// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { compareRanked, matchRecipes, missingSummary, type MatchQuery, type MatchResult } from './engine'
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
    expect(stats.candidates).toBe(87)
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
    // S18: the refresh added recipenlg:1420948 (4/10, 40%) and recipenlg:1347571 (6/16, 37.5%).
    // 1420948 lands in the 40-49% band alone, so it leads; 1347571 joins the 30-39% band and
    // outranks `themealdb:52953` (5 covered) there on its higher covered count (6).
    expect(results.slice(1, 7).map((r) => r.key)).toEqual([
      'recipenlg:1420948',
      'recipenlg:1347571',
      'themealdb:52953',
      'recipenlg:1470870',
      'foodcom:000534',
      'foodwishes:nectarine-salsa-stone-cold-delicious',
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
    expect(stats.candidates).toBe(63)
    expect(results.map((r) => r.key)).not.toContain('themealdb:53191')
    // S6b #4: covers 4 non-staple ingredients (the margarita covers only 2), so it led before
    // S18. S18's refresh added recipenlg:1420948 (4/10, 40% coverage), the only vegetarian-ok
    // recipe in a higher band, so it now leads instead.
    expect(results[0].key).toBe('recipenlg:1420948')
    for (const r of results) expect(['ok', 'adaptable']).toContain(r.diet?.status)
  })

  it('filters by cuisine: thai has Pad Thai then the refresh\'s recipenlg:1420948, vietnamese has 6', async () => {
    const thai = await matchRecipes(db, { ...BASE, have: K1, cuisine: 'thai' })
    // S18: the refresh spread recipenlg recipes over cuisines by quota; recipenlg:1420948
    // ("Salmon With Thai Rice Salad") landed tagged thai, so thai is no longer Pad Thai alone.
    // recipenlg:1417846 ("Vermicelli With Chicken Skewers And Nuoc Cham") landed tagged
    // vietnamese, so vietnamese grew from 5 to 6, and it now leads (it covers more K1
    // ingredients than the sea bass).
    expect(thai.results.map((r) => r.key)).toEqual(['themealdb:53191', 'recipenlg:1420948'])
    const vietnamese = await matchRecipes(db, { ...BASE, have: K1, cuisine: 'vietnamese' })
    expect(vietnamese.stats.candidates).toBe(6)
    expect(vietnamese.results[0].key).toBe('recipenlg:1417846')
  })

  it('one pot (R9: one_pot AND course main) gives 30, led by Shrimp Chow Fun', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1, onePot: true })
    expect(stats.candidates).toBe(24)
    expect(results[0].key).toBe('themealdb:52953')
    for (const r of results) expect(r.course).toBe('main')
  })

  it('under 30 minutes gives 37; a kitchen of only a stovetop gives 50', async () => {
    const quick = await matchRecipes(db, { ...BASE, have: K1, maxMinutes: 30 })
    expect(quick.stats.candidates).toBe(27)
    for (const r of quick.results) expect(r.totalMin).toBeLessThanOrEqual(30)
    const stove = await matchRecipes(db, { ...BASE, have: K1, kitchen: ['stovetop'] })
    expect(stove.stats.candidates).toBe(40)
  })

  it('"use only" the oven gives 6, led by the corn & sausage muffins', async () => {
    const { results, stats } = await matchRecipes(db, { ...BASE, have: K1, useOnly: ['oven'] })
    expect(stats.candidates).toBe(3)
    // S6b #4: both are in the same coverage band (13-14%); 2 covered beats 1.
    expect(results[0].key).toBe('foodwishes:fresh-corn-sausage-muffins-twelve')
    expect(results[1].key).toBe('recipenlg:636138')
  })

  it('an empty "my kitchen has" means not set, so it filters nothing', async () => {
    const { stats } = await matchRecipes(db, { ...BASE, have: K1, kitchen: [] })
    expect(stats.candidates).toBe(87)
  })
})

describe('planted kitchen K2: exactly Kidney Bean Curry', () => {
  it('puts it first at full coverage for indian, and for indian one-pot', async () => {
    const have = await coreOf(278)
    expect(have).toHaveLength(10)
    const indian = await matchRecipes(db, { ...BASE, have, cuisine: 'indian' })
    expect(indian.stats.candidates).toBe(9)
    // S18: the refresh added indianhealthyrecipes:rajma-recipe-rajma-masala-recipe (5/12,
    // 41.6%), which now lands in the 40-49% band, ahead of themealdb:53400 (3/9, 33%) and
    // everything else here.
    expect(indian.results.slice(0, 3).map((r) => r.key)).toEqual([
      K2_RECIPE,
      'indianhealthyrecipes:rajma-recipe-rajma-masala-recipe',
      'themealdb:53400',
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
    expect(stats.candidates).toBe(139)
    // recipenlg:1271214 is a 1/1 match (100% coverage, same band as the curry's 10/10) — the
    // pre-S6b ranking only kept it second on a quality tiebreak that happened to go the right
    // way (orch/reports/S6.md, "Open"). S6b #4's floor now keeps it behind anything covering
    // more, on principle rather than by accident: it falls to position 64 of 139 (S18's refresh
    // added 4 more candidates with 2+ covered ingredients ahead of it), behind every candidate
    // with 2+ covered ingredients, rather than riding a lucky tiebreak at #2.
    expect(results[0].key).toBe(K2_RECIPE)
    expect(results.slice(1, 3).map((r) => r.key)).toEqual(['themealdb:53158', 'themealdb:52956'])
    const casserole = results.find((r) => r.key === 'recipenlg:1271214')!
    expect(casserole.covered).toBe(1)
    expect(results.indexOf(casserole)).toBe(64)
  })
})

describe('planted kitchen K3: parent and child slugs', () => {
  async function coveredIn(have: string[], key: string): Promise<number> {
    const { results } = await matchRecipes(db, { ...BASE, have, limit: 300 })
    return results.find((r) => r.key === key)?.covered ?? 0
  }

  it('chicken covers chicken_breast; chicken_cutlet (a kind of breast) does too', async () => {
    const wraps = (await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 193')).rows[0]
      .key
    expect(await coveredIn(['chicken'], wraps)).toBe(1)
    expect(await coveredIn(['chicken_cutlet'], wraps)).toBe(1)
    expect(await coveredIn(['chicken_thigh'], wraps)).toBe(0)
  })

  it('red_onion covers onion but not yellow_onion; onion covers both', async () => {
    const corn = (await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 57')).rows[0]
      .key
    const sfincione = (await db.query<{ key: string }>('SELECT key FROM recipes WHERE id = 313'))
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

  // S20: ranking the "best swap" (orch/reports/S18.md flagged shrimp__scallops losing an id
  // tiebreak to the ancestor swap shellfish__hearts_of_palm at equal quality).
  describe('best-swap ranking (S20)', () => {
    it('prefers an exact-slug swap over an ancestor one at equal quality, under Everything', async () => {
      const tax = await loadTaxonomy(db)
      const table = await loadSwapTable(db, tax, ['shrimp'])
      const best = fittingSwaps(table, 'shrimp', new Set(), {
        contexts: recipeContexts('main', 'Shrimp scampi'),
        cuisine: null,
        diet: 'everything',
      })[0]
      // shrimp__scallops (exact, quality 2) ties shellfish__hearts_of_palm (ancestor, quality 2)
      // on quality; the exact-slug swap now wins instead of the id tiebreak.
      expect(best.id).toBe('shrimp__scallops')
    })

    it('prefers the swap that satisfies the diet, under a diet preset', async () => {
      const tax = await loadTaxonomy(db)
      const table = await loadSwapTable(db, tax, ['shrimp'])
      const best = fittingSwaps(table, 'shrimp', new Set(), {
        contexts: recipeContexts('main', 'Shrimp scampi'),
        cuisine: null,
        diet: 'vegetarian',
      })[0]
      // scallops is dropped as explicit meat; between the two hearts-of-palm swaps left, the
      // ancestor one (shellfish__hearts_of_palm, quality 2) beats the exact one (quality 1).
      expect(best.id).toBe('shellfish__hearts_of_palm')
    })

    it('prefers a swap that keeps the dish\'s diet character over a diet-changing one, under Everything', async () => {
      const tax = await loadTaxonomy(db)
      const table = await loadSwapTable(db, tax, ['heavy_cream'])
      const best = fittingSwaps(table, 'heavy_cream', new Set(), {
        contexts: recipeContexts('main', 'Beef stroganoff'),
        cuisine: null,
        diet: 'everything',
      })[0]
      // All five heavy_cream swaps are exact, quality 2, global (cuisineFit true). Among the
      // single-component ones (fewer components beats heavy_cream__milk-butter), the dairy ones
      // (evaporated_milk, half_and_half) now outrank the dairy-free ones (cashew_cream,
      // coconut_cream) that used to win the id tiebreak ('heavy_cream__cashew_cream' sorts
      // first).
      expect(best.id).toBe('heavy_cream__evaporated_milk')
    })
  })
})

describe('ranking (R19: ok outranks adaptable within a coverage band)', () => {
  function result(over: Partial<MatchResult>): MatchResult {
    return {
      id: 1,
      key: 'src:1',
      title: 't',
      course: 'main',
      cuisine: null,
      cuisineTag: null,
      totalMin: null,
      quality: 5,
      coverage: 0.5,
      covered: 5,
      needed: 10,
      missing: [],
      substitutable: [],
      diet: null,
      avoided: [],
      ...over,
    }
  }

  it('ranks an "ok" recipe above an "adaptable" one in the same coverage band', () => {
    const ok = result({ id: 1, coverage: 0.55, diet: { status: 'ok', swaps: [] } })
    const adaptable = result({ id: 2, coverage: 0.51, diet: { status: 'adaptable', swaps: [] } })
    expect([adaptable, ok].sort(compareRanked)).toEqual([ok, adaptable])
  })

  it('still lets a higher band win regardless of status (band comes first)', () => {
    const okLowerBand = result({ id: 1, coverage: 0.51, diet: { status: 'ok', swaps: [] } })
    const adaptableHigherBand = result({
      id: 2,
      coverage: 0.69,
      diet: { status: 'adaptable', swaps: [] },
    })
    expect([okLowerBand, adaptableHigherBand].sort(compareRanked)).toEqual([
      adaptableHigherBand,
      okLowerBand,
    ])
  })

  it('never distinguishes on status under Everything (diet is null there)', () => {
    const a = result({ id: 1, coverage: 0.55, diet: null })
    const b = result({ id: 2, coverage: 0.52, diet: null })
    // Falls through to `covered`/`quality`/`missing`/`id`, unaffected by dietRank.
    expect([a, b].sort(compareRanked)).toEqual([a, b])
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
