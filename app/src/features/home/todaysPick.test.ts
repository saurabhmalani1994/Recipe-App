import { describe, expect, it } from 'vitest'
import type { Course } from '../../corpus/types'
import { cuisineTag } from '../cook/labels'
import { pickTodaysHero } from './todaysPick'
import type { HomeCard, HomeRow } from './types'

function card(key: string, course: Course): HomeCard {
  return {
    key,
    title: key,
    cuisine: null,
    cuisineTag: null,
    course,
    totalMin: null,
    imageUrl: null,
    covered: 0,
    needed: 0,
  }
}

describe("Today's pick (S22b: prefers course=main)", () => {
  it('skips a dessert at the head of the seasonal row for a main further down it', () => {
    const rows: HomeRow[] = [
      { id: 'seasonal', title: 's', cards: [card('cake', 'dessert'), card('stew', 'main')] },
      { id: 'cook', title: 'c', cards: [card('curry', 'main')] },
    ]
    expect(pickTodaysHero(rows)).toEqual({ card: rows[0].cards[1], from: 'seasonal' })
  })

  it('moves on to the next row when a row has no main', () => {
    const rows: HomeRow[] = [
      { id: 'cook', title: 'c', cards: [card('curry', 'main')] },
      { id: 'seasonal', title: 's', cards: [card('cake', 'dessert'), card('dip', 'snack')] },
    ]
    expect(pickTodaysHero(rows)?.card.key).toBe('curry')
  })

  it('falls back to the first card when no row has a main, and to null when all are empty', () => {
    const rows: HomeRow[] = [
      { id: 'explore', title: 'e', cards: [card('tart', 'dessert')] },
      { id: 'seasonal', title: 's', cards: [] },
    ]
    expect(pickTodaysHero(rows)?.card.key).toBe('tart')
    expect(pickTodaysHero([{ id: 'cook', title: 'c', cards: [] }])).toBeNull()
  })
})

describe('cuisine tag (S22b: a classifier guess shows only at confidence >= 0.8)', () => {
  it('hides a classifier cuisine under 0.8 and keeps it at 0.8 or above', () => {
    expect(cuisineTag('thai', 'classifier', 0.79)).toBeNull()
    expect(cuisineTag('thai', 'classifier', null)).toBeNull()
    expect(cuisineTag('thai', 'classifier', 0.8)).toBe('thai')
    expect(cuisineTag('thai', 'classifier', 0.97)).toBe('thai')
  })

  it('always shows a source label or a title marker, and nothing without a cuisine', () => {
    expect(cuisineTag('thai', 'source_label', 0.1)).toBe('thai')
    expect(cuisineTag('thai', 'title_marker', null)).toBe('thai')
    expect(cuisineTag(null, 'classifier', 0.99)).toBeNull()
  })
})
