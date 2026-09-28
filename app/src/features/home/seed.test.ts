import { describe, expect, it } from 'vitest'
import { dailyWindow, isoDay, mulberry32, seedFromDate, seededPick, seededShuffle } from './seed'

describe('isoDay / seedFromDate', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(isoDay(new Date(2026, 10, 30))).toBe('2026-11-30')
  })

  it('is stable for the same day and changes on the next day', () => {
    const seedA = seedFromDate(new Date(2026, 6, 14, 8, 0, 0))
    const seedB = seedFromDate(new Date(2026, 6, 14, 22, 0, 0))
    const seedC = seedFromDate(new Date(2026, 6, 15))
    expect(seedA).toBe(seedB)
    expect(seedA).not.toBe(seedC)
  })
})

describe('mulberry32', () => {
  it('is deterministic: same seed gives the same sequence', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('gives a different sequence for a different seed', () => {
    const a = mulberry32(1)()
    const b = mulberry32(2)()
    expect(a).not.toBe(b)
  })

  it('stays in [0, 1)', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('seededShuffle', () => {
  it('is a permutation of the input, deterministic for the same rand sequence', () => {
    const items = [1, 2, 3, 4, 5]
    const shuffled = seededShuffle(items, mulberry32(9))
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items)
    expect(seededShuffle(items, mulberry32(9))).toEqual(shuffled)
  })

  it('does not mutate the input', () => {
    const items = [1, 2, 3]
    seededShuffle(items, mulberry32(1))
    expect(items).toEqual([1, 2, 3])
  })
})

describe('seededPick', () => {
  it('picks n distinct items deterministically, same seed+salt gives the same picks', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const first = seededPick(items, 2, 100, 'explore-cuisines')
    const second = seededPick(items, 2, 100, 'explore-cuisines')
    expect(first).toEqual(second)
    expect(first).toHaveLength(2)
    expect(new Set(first).size).toBe(2)
  })

  it('a different salt can pick a different subset from the same pool', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const forExplore = seededPick(items, 2, 100, 'explore-cuisines')
    const forSomethingElse = seededPick(items, 2, 100, 'something-else')
    // Not asserted to always differ (small pool, small n could coincide), just that both are
    // valid, well-formed picks from the pool.
    for (const pick of [forExplore, forSomethingElse]) {
      for (const item of pick) expect(items).toContain(item)
    }
  })
})

describe('dailyWindow', () => {
  const items = Array.from({ length: 20 }, (_, i) => i)

  it('returns everything unwindowed when there are not more than n items', () => {
    expect(dailyWindow([1, 2, 3], 8, 1, 'row')).toEqual([1, 2, 3])
  })

  it('returns n consecutive items from the ranked list, in their original order', () => {
    const window = dailyWindow(items, 5, 42, 'cook')
    expect(window).toHaveLength(5)
    for (let i = 1; i < window.length; i++) expect(window[i]).toBe(window[i - 1] + 1)
  })

  it('is deterministic for a fixed seed and salt', () => {
    expect(dailyWindow(items, 5, 42, 'cook')).toEqual(dailyWindow(items, 5, 42, 'cook'))
  })

  it('a different seed can land on a different window', () => {
    const windows = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => dailyWindow(items, 5, seed, 'cook')[0]),
    )
    expect(windows.size).toBeGreaterThan(1)
  })
})
