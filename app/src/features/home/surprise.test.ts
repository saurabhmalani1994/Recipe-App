// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
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
