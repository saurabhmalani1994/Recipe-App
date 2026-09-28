// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Cuisine } from '../../corpus/types'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { loadTaxonomy, type Taxonomy } from '../cook/taxonomy'
import {
  buildCookRow,
  buildExploreRow,
  buildFavoritesRow,
  buildSeasonalRow,
} from './rows'

/**
 * Per-row unit tests on `src/corpus/fixture.db` (300 recipes), a fixed date/seed, and fixed
 * favorites/plan history passed in directly (S11 #4) — `home/rows.ts` is pure over the corpus, so
 * these never touch user.db.
 */

let db: WebDb
let tax: Taxonomy

beforeAll(async () => {
  db = await openFixtureDb()
  tax = await loadTaxonomy(db)
})

afterAll(async () => {
  await db.close()
})

// A large enough count that dailyWindow's `items.length <= n` branch always fires, so these tests
// see the row's full ranked list rather than today's (seed-dependent) slice of it.
const NO_WINDOW = 1000

describe('buildCookRow (S11 #2a)', () => {
  // Pad Thai's core slugs minus fish sauce, plus soy sauce and nori — same planted kitchen K1 as
  // `cook/engine.test.ts`.
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

  it('is the engine\'s top result first, coverage carried straight through', async () => {
    const row = await buildCookRow(db, { have: K1, diet: 'everything', seed: 1, count: NO_WINDOW })
    expect(row.id).toBe('cook')
    expect(row.cards[0].key).toBe('themealdb:53191')
    expect(row.cards[0].covered).toBe(11)
    expect(row.cards[0].needed).toBe(12)
  })

  it('is deterministic for the same seed and rotates the window for a different one', async () => {
    const a = await buildCookRow(db, { have: K1, diet: 'everything', seed: 7 })
    const b = await buildCookRow(db, { have: K1, diet: 'everything', seed: 7 })
    expect(a.cards.map((c) => c.key)).toEqual(b.cards.map((c) => c.key))

    const seeds = new Set<string>()
    for (let seed = 0; seed < 8; seed++) {
      const row = await buildCookRow(db, { have: K1, diet: 'everything', seed })
      seeds.add(row.cards[0]?.key ?? '')
    }
    // The floored top result should not always be exactly the same card once the window rotates.
    expect(seeds.size).toBeGreaterThan(1)
  })

  it('respects the diet preset (vegetarian excludes Pad Thai\'s shrimp)', async () => {
    const row = await buildCookRow(db, {
      have: K1,
      diet: 'vegetarian',
      seed: 1,
      count: NO_WINDOW,
    })
    expect(row.cards.some((c) => c.key === 'themealdb:53191')).toBe(false)
  })
})

async function allCuisines(db: WebDb): Promise<Cuisine[]> {
  const { rows } = await db.query<{ cuisine: Cuisine }>(
    'SELECT DISTINCT cuisine FROM recipes WHERE cuisine IS NOT NULL',
  )
  return rows.map((r) => r.cuisine)
}

describe('buildExploreRow (S11 #2b)', () => {
  it('never picks an excluded cuisine, and names it in "why"', async () => {
    const cuisines = await allCuisines(db)
    // Exclude everything except two cuisines, so the pick is forced and easy to check.
    const kept = new Set<Cuisine>(['chinese', 'indian'])
    const excludeCuisines = new Set(cuisines.filter((c) => !kept.has(c)))

    const row = await buildExploreRow(db, tax, {
      have: [],
      diet: 'everything',
      excludeCuisines,
      seed: 3,
    })
    expect(row.cards.length).toBeGreaterThan(0)
    expect(new Set(row.cards.map((c) => c.cuisine))).toEqual(kept)
    for (const card of row.cards) {
      expect(card.why).toBe(
        `You haven't cooked ${card.cuisine === 'chinese' ? 'Chinese' : 'Indian'} lately`,
      )
    }
  })

  it('shows a prompt when every cuisine has been excluded', async () => {
    const excludeCuisines = new Set(await allCuisines(db))
    const row = await buildExploreRow(db, tax, {
      have: [],
      diet: 'everything',
      excludeCuisines,
      seed: 1,
    })
    expect(row.cards).toEqual([])
    expect(row.emptyMessage).toBeTruthy()
  })

  it('picks the cuisine\'s best-quality recipes, highest quality first', async () => {
    const excludeCuisines = new Set(
      (await allCuisines(db)).filter((c) => c !== 'chinese'),
    )
    const row = await buildExploreRow(db, tax, {
      have: [],
      diet: 'everything',
      excludeCuisines,
      seed: 2,
      cuisineCount: 1,
      perCuisine: 5,
    })
    expect(row.cards.every((c) => c.cuisine === 'chinese')).toBe(true)

    const { rows: expected } = await db.query<{ key: string }>(
      `SELECT key FROM recipes WHERE cuisine = 'chinese' ORDER BY quality DESC, id LIMIT 5`,
    )
    expect(row.cards.map((c) => c.key)).toEqual(expected.map((r) => r.key))
  })
})

describe('buildFavoritesRow (S11 #2c)', () => {
  it('shows a prompt with no favorites yet', async () => {
    const row = await buildFavoritesRow(db, tax, {
      have: [],
      diet: 'everything',
      favoriteKeys: [],
      seed: 1,
    })
    expect(row.cards).toEqual([])
    expect(row.emptyMessage).toMatch(/star a recipe/i)
  })

  it('ranks by slug Jaccard + cuisine/course match, excluding the favorite itself', async () => {
    // Pad Thai (thai, main): its closest corpus neighbours by shared core ingredients are two
    // other noodle-and-shrimp mains (computed independently against fixture.db, not by running
    // this code first).
    const row = await buildFavoritesRow(db, tax, {
      have: [],
      diet: 'everything',
      favoriteKeys: ['themealdb:53191'],
      seed: 5,
      count: NO_WINDOW,
    })
    expect(row.cards.some((c) => c.key === 'themealdb:53191')).toBe(false)
    const keys = row.cards.map((c) => c.key)
    expect(keys.slice(0, 2)).toEqual(['themealdb:52953', 'themealdb:53368'])
  })

  it('is deterministic for the same seed', async () => {
    const params = {
      have: [],
      diet: 'everything' as const,
      favoriteKeys: ['themealdb:53191'],
      seed: 9,
    }
    const a = await buildFavoritesRow(db, tax, params)
    const b = await buildFavoritesRow(db, tax, params)
    expect(a.cards.map((c) => c.key)).toEqual(b.cards.map((c) => c.key))
  })
})

describe('buildSeasonalRow (S11 #2d)', () => {
  // 2025-07-14 is a Monday (weekday); 2025-07-19 is a Saturday (weekend).
  const weekday = new Date(2025, 6, 14)
  const weekend = new Date(2025, 6, 19)

  it('on a weekday, shows weeknight recipes using in-season produce for the month', async () => {
    const row = await buildSeasonalRow(db, tax, {
      have: [],
      diet: 'everything',
      date: weekday,
      seed: 1,
      count: NO_WINDOW,
    })
    expect(row.title).toMatch(/weeknight/i)
    expect(row.cards.length).toBeGreaterThan(0)
    expect(row.cards.slice(0, 2).map((c) => c.key)).toEqual([
      'foodcom:000566',
      'foodcom:000719',
    ])
    for (const card of row.cards) expect(card.totalMin).toBeLessThanOrEqual(30)
  })

  it('on a weekend, shows longer project recipes instead', async () => {
    const row = await buildSeasonalRow(db, tax, {
      have: [],
      diet: 'everything',
      date: weekend,
      seed: 1,
      count: NO_WINDOW,
    })
    expect(row.title).toMatch(/weekend/i)
    expect(row.cards.slice(0, 2).map((c) => c.key)).toEqual([
      'foodcom:000334',
      'foodcom:000777',
    ])
  })

  it('is deterministic for the same date and seed', async () => {
    const params = { have: [], diet: 'everything' as const, date: weekday, seed: 4 }
    const a = await buildSeasonalRow(db, tax, params)
    const b = await buildSeasonalRow(db, tax, params)
    expect(a.cards.map((c) => c.key)).toEqual(b.cards.map((c) => c.key))
  })
})
