import { describe, expect, it } from 'vitest'
import { dishInitial, haveLabel, placeholderTone } from './recipeVisuals'

describe('recipe card visuals (S22a)', () => {
  it('uses the dish initial, skipping leading punctuation', () => {
    expect(dishInitial('pad thai')).toBe('P')
    expect(dishInitial('"Best" brownies')).toBe('B')
    expect(dishInitial('海老フライ')).toBe('海')
    expect(dishInitial('…')).toBe('·')
  })

  it('colours a placeholder by cuisine, else by a stable hash of the title (tones 1-8)', () => {
    expect(placeholderTone('thai', 'x')).toBe(placeholderTone('vietnamese', 'y'))
    const tone = placeholderTone(null, 'Weeknight Chana Masala')
    expect(tone).toBe(placeholderTone(null, 'Weeknight Chana Masala'))
    for (const title of ['a', 'bb', 'Soup', 'Pie', 'Stew', 'Tart', 'Salad', 'Curry', 'Rice']) {
      const t = placeholderTone(null, title)
      expect(t).toBeGreaterThanOrEqual(1)
      expect(t).toBeLessThanOrEqual(8)
    }
  })

  it('reads coverage as "You have 7 of 9", or all of them', () => {
    expect(haveLabel(7, 9)).toBe('You have 7 of 9')
    expect(haveLabel(4, 4)).toBe('You have all 4')
    expect(haveLabel(0, 0)).toBeNull()
    expect(haveLabel(undefined, 3)).toBeNull()
  })
})
