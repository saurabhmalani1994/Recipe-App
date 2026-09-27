import { describe, expect, it } from 'vitest'
import { ingredientAisle, ingredientName, searchIngredientSlugs } from './slugs'

describe('ingredient slug search', () => {
  it('finds cilantro by cilantro, coriander or dhania', () => {
    for (const query of ['cilantro', 'coriander', 'dhania']) {
      const slugs = searchIngredientSlugs(query).map((s) => s.slug)
      expect(slugs).toContain('cilantro')
    }
  })

  it('is case-insensitive and matches a substring', () => {
    expect(searchIngredientSlugs('CILANTRO').map((s) => s.slug)).toContain('cilantro')
    expect(searchIngredientSlugs('cilan').map((s) => s.slug)).toContain('cilantro')
  })

  it('returns nothing for an empty query', () => {
    expect(searchIngredientSlugs('')).toEqual([])
  })

  it('looks up name and aisle by slug', () => {
    expect(ingredientName('cilantro')).toBe('cilantro')
    expect(ingredientAisle('cilantro')).toBe('produce')
  })
})
