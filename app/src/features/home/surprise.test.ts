// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import { newHiddenTally } from '../cook/avoid'
import { loadTaxonomy, type Taxonomy } from '../cook/taxonomy'
import { pickSurprise } from './surprise'

let db: WebDb
let tax: Taxonomy

beforeAll(async () => {
  db = await openFixtureDb()
  tax = await loadTaxonomy(db)
})

afterAll(async () => {
  await db.close()
})

describe('pickSurprise (S11 #2: "Surprise me")', () => {
  it('only ever picks a recipe at or above the quality floor', async () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
      const card = await pickSurprise(db, tax, { have: [], diet: 'everything', random: () => random })
      expect(card).not.toBeNull()
      const { rows } = await db.query<{ quality: number }>(
        'SELECT quality FROM recipes WHERE key = ?',
        [card?.key ?? ''],
      )
      expect(rows[0].quality).toBeGreaterThanOrEqual(0.6)
    }
  })

  it('respects the diet preset', async () => {
    const card = await pickSurprise(db, tax, { have: [], diet: 'vegetarian', random: () => 0 })
    expect(card).not.toBeNull()
    const { rows } = await db.query<{ status: string }>(
      "SELECT status FROM recipe_diet WHERE recipe_id = (SELECT id FROM recipes WHERE key = ?) AND preset = 'vegetarian'",
      [card?.key ?? ''],
    )
    expect(['ok', 'adaptable']).toContain(rows[0]?.status)
  })

  it('is a different recipe for a different roll of `random`', async () => {
    const a = await pickSurprise(db, tax, { have: [], diet: 'everything', random: () => 0 })
    const b = await pickSurprise(db, tax, { have: [], diet: 'everything', random: () => 0.999 })
    expect(a?.key).not.toBe(b?.key)
  })

  it('returns null when no recipe meets an impossible floor', async () => {
    const card = await pickSurprise(db, tax, {
      have: [],
      diet: 'everything',
      qualityFloor: 2,
      random: () => 0,
    })
    expect(card).toBeNull()
  })
})

// S16 "ingredients I avoid".
describe('pickSurprise: "ingredients I avoid"', () => {
  it('never draws a hide-mode avoided recipe, and tallies it (rule 11)', async () => {
    const random = () => 0
    const baseline = await pickSurprise(db, tax, { have: [], diet: 'everything', random })
    expect(baseline).not.toBeNull()
    const { rows } = await db.query<{ slug: string }>(
      `SELECT slug FROM recipe_slugs
        WHERE core = 1 AND recipe_id = (SELECT id FROM recipes WHERE key = ?)`,
      [baseline!.key],
    )
    const avoidedSlug = rows[0].slug
    const tally = newHiddenTally()
    const card = await pickSurprise(db, tax, {
      have: [],
      diet: 'everything',
      random,
      avoid: new Map([[avoidedSlug, 'hide']]),
      hiddenTally: tally,
    })
    expect(card?.key).not.toBe(baseline!.key)
    expect(tally.count).toBeGreaterThan(0)
    expect(tally.bySlug.has(avoidedSlug)).toBe(true)
  })

  it('draws from the avoid-free pool over a lower-mode one when both exist', async () => {
    const random = () => 0
    const baseline = await pickSurprise(db, tax, { have: [], diet: 'everything', random })
    const { rows } = await db.query<{ slug: string }>(
      `SELECT slug FROM recipe_slugs
        WHERE core = 1 AND recipe_id = (SELECT id FROM recipes WHERE key = ?)`,
      [baseline!.key],
    )
    const avoidedSlug = rows[0].slug
    const card = await pickSurprise(db, tax, {
      have: [],
      diet: 'everything',
      random,
      avoid: new Map([[avoidedSlug, 'lower']]),
    })
    // Not hidden, so it stays in the pool — but the avoid-free pool is non-empty (263 recipes at
    // this floor, only a handful use any one ingredient), so it never gets the first draw.
    expect(card).not.toBeNull()
    expect(card?.key).not.toBe(baseline!.key)
  })
})
