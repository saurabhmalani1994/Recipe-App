import { describe, expect, it } from 'vitest'
import { perishableSlugsForEntry, shareHints } from './shareHints'

describe('shares ingredients hint', () => {
  it('flags herbs and half-used containers, not ordinary pantry items', () => {
    const isHerb = (slug: string) => slug === 'cilantro'
    const slugs = perishableSlugsForEntry(
      [
        { slug: 'cilantro', unit: null },
        { slug: 'coconut_milk', unit: 'can' },
        { slug: 'rice', unit: 'g' },
      ],
      isHerb,
    )
    expect(slugs).toEqual(new Set(['cilantro', 'coconut_milk']))
  })

  it('hints two days that both use the same bunch of coriander, not a day that does not', () => {
    const hints = shareHints(
      [
        { id: 'mon', slugs: new Set(['cilantro', 'lime']) },
        { id: 'wed', slugs: new Set(['cilantro']) },
        { id: 'fri', slugs: new Set(['garlic']) },
      ],
      (slug) => slug.replace(/_/g, ' '),
    )
    expect(hints.get('mon')).toEqual(['cilantro'])
    expect(hints.get('wed')).toEqual(['cilantro'])
    expect(hints.has('fri')).toBe(false)
  })
})
