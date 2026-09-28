// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebDb } from '../../db/webDb'
import { openFixtureDb } from '../../test/fixtureDb'
import {
  avoidHits,
  expandAvoid,
  hiddenNote,
  mergeHiddenTally,
  newHiddenTally,
  recordHidden,
  verdictFor,
  type AvoidHit,
} from './avoid'
import { compareRanked, matchRecipes, RANK_BAND_WIDTH, type MatchQuery, type MatchResult } from './engine'
import type { Taxonomy } from './taxonomy'

/**
 * S16 "ingredients I avoid" (R15, owner D17: "many of the apps felt very southern or mid western,
 * using things like cool whip or sour cream for lots of the recipes, which is not my style").
 * Pure logic (`expandAvoid`, `verdictFor`, the hidden tally) against a hand-built `Taxonomy`, plus
 * the real hide/lower effect on `matchRecipes` against `src/corpus/fixture.db`'s planted kitchen
 * K1 (same as `engine.test.ts`), where `shrimp`'s parent is `shellfish` — a real parent/child pair
 * to exercise "a parent slug covers its children" against.
 */

function fakeTaxonomy(children: Record<string, string[]>): Taxonomy {
  const childrenMap = new Map(Object.entries(children))
  const parent = new Map<string, string>()
  for (const [p, kids] of childrenMap) for (const kid of kids) parent.set(kid, p)
  return {
    names: new Map(),
    parent,
    children: childrenMap,
    staples: new Set(),
    density: new Map(),
    eachG: new Map(),
    flags: new Map(),
  }
}

describe('expandAvoid: a parent slug covers its children, one level, mode-aware', () => {
  const tax = fakeTaxonomy({ sour_cream: ['light_sour_cream', 'fat_free_sour_cream'] })

  it('expands a hide to every direct child, same mode', () => {
    const expanded = expandAvoid(tax, new Map([['sour_cream', 'hide']]))
    expect(expanded.get('sour_cream')).toBe('hide')
    expect(expanded.get('light_sour_cream')).toBe('hide')
    expect(expanded.get('fat_free_sour_cream')).toBe('hide')
  })

  it('expands a lower to every direct child, same mode', () => {
    const expanded = expandAvoid(tax, new Map([['sour_cream', 'lower']]))
    expect(expanded.get('light_sour_cream')).toBe('lower')
  })

  it('does not reach a grandchild, and never covers a sibling of the avoided slug', () => {
    const deep = fakeTaxonomy({ dairy: ['sour_cream'], sour_cream: ['light_sour_cream'] })
    const expanded = expandAvoid(deep, new Map([['dairy', 'hide']]))
    expect(expanded.get('sour_cream')).toBe('hide')
    expect(expanded.has('light_sour_cream')).toBe(false) // two levels down: not covered
  })

  it('a direct hide wins over an inherited lower from a different avoided parent', () => {
    const shared = fakeTaxonomy({ a: ['x'], b: ['x'] })
    const expanded = expandAvoid(shared, new Map([['a', 'lower'], ['b', 'hide']]))
    expect(expanded.get('x')).toBe('hide')
  })
})

describe('verdictFor: hide beats lower; lowerBy counts only lower-mode hits', () => {
  it('no hits: no hide, no drop', () => {
    expect(verdictFor([])).toEqual({ hide: false, hits: [], lowerBy: 0 })
  })

  it('every hit lower-mode: not hidden, drops one band per hit', () => {
    const hits: AvoidHit[] = [
      { slug: 'a', name: 'a', mode: 'lower' },
      { slug: 'b', name: 'b', mode: 'lower' },
    ]
    const verdict = verdictFor(hits)
    expect(verdict.hide).toBe(false)
    expect(verdict.lowerBy).toBe(2)
  })

  it('one hide hit among several lower hits hides it outright, lowerBy is 0', () => {
    const hits: AvoidHit[] = [
      { slug: 'a', name: 'a', mode: 'lower' },
      { slug: 'b', name: 'b', mode: 'hide' },
    ]
    const verdict = verdictFor(hits)
    expect(verdict.hide).toBe(true)
    expect(verdict.lowerBy).toBe(0)
  })
})

describe('avoidHits', () => {
  it('finds only the slugs present in the expanded avoid map', () => {
    const tax = fakeTaxonomy({})
    const expanded = new Map([['sour_cream', 'hide' as const]])
    const hits = avoidHits(tax, expanded, ['sour_cream', 'flour', 'salt'])
    expect(hits).toEqual([{ slug: 'sour_cream', name: 'sour cream', mode: 'hide' }])
  })
})

describe('hidden tally and its note: rule 11, a drop is counted, never silent', () => {
  it('is null with nothing hidden', () => {
    expect(hiddenNote(newHiddenTally())).toBeNull()
  })

  it('"N hidden: <names>", most-cited avoided ingredient first', () => {
    const tally = newHiddenTally()
    recordHidden(tally, [{ slug: 'sour_cream', name: 'sour cream', mode: 'hide' }])
    recordHidden(tally, [{ slug: 'sour_cream', name: 'sour cream', mode: 'hide' }])
    recordHidden(tally, [
      { slug: 'sour_cream', name: 'sour cream', mode: 'hide' },
      { slug: 'cool_whip', name: 'cool whip', mode: 'hide' },
    ])
    expect(tally.count).toBe(3) // 3 recipes hidden...
    expect(hiddenNote(tally)).toBe('3 hidden: sour cream, cool whip') // ...sour cream cited 3x
  })

  it('a hide-recorded hit list may include lower-mode hits (ignored in the tally)', () => {
    const tally = newHiddenTally()
    recordHidden(tally, [
      { slug: 'a', name: 'a', mode: 'lower' },
      { slug: 'b', name: 'b', mode: 'hide' },
    ])
    expect([...tally.bySlug.keys()]).toEqual(['b'])
  })

  it('mergeHiddenTally combines counts from two tallies (S16 #2: Cook + Mine, or four Home rows)', () => {
    const a = newHiddenTally()
    recordHidden(a, [{ slug: 'sour_cream', name: 'sour cream', mode: 'hide' }])
    const b = newHiddenTally()
    recordHidden(b, [{ slug: 'sour_cream', name: 'sour cream', mode: 'hide' }])
    recordHidden(b, [{ slug: 'cool_whip', name: 'cool whip', mode: 'hide' }])
    mergeHiddenTally(a, b)
    expect(a.count).toBe(3)
    expect(a.bySlug.get('sour_cream')?.count).toBe(2)
    expect(a.bySlug.get('cool_whip')?.count).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------
// Real effect on matchRecipes, against src/corpus/fixture.db.
// ---------------------------------------------------------------------------------------------

let db: WebDb

beforeAll(async () => {
  db = await openFixtureDb()
})

afterAll(async () => {
  await db.close()
})

// Same planted kitchen as engine.test.ts K1: Pad Thai's core slugs minus fish sauce, plus soy
// sauce and nori. Without any avoid list, Pad Thai (themealdb:53191, core includes `shrimp`,
// whose taxonomy parent is `shellfish`) ranks first at 11/12.
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

const BASE: MatchQuery = {
  have: K1,
  cuisine: null,
  diet: 'everything',
  kitchen: null,
  useOnly: null,
  onePot: false,
  maxMinutes: null,
}

describe('matchRecipes: hide drops the recipe and is tallied, never silently (rule 11)', () => {
  it('avoiding the exact slug (shrimp) hides Pad Thai', async () => {
    const { results, stats } = await matchRecipes(db, {
      ...BASE,
      avoid: new Map([['shrimp', 'hide']]),
    })
    expect(results.map((r) => r.key)).not.toContain('themealdb:53191')
    expect(stats.hidden.count).toBeGreaterThan(0)
    expect(stats.hidden.bySlug.get('shrimp')?.name).toBe('shrimp')
    expect(hiddenNote(stats.hidden)).toMatch(/^\d+ hidden: /)
  })

  it('avoiding the parent (shellfish) also hides Pad Thai via its child shrimp', async () => {
    const { results, stats } = await matchRecipes(db, {
      ...BASE,
      avoid: new Map([['shellfish', 'hide']]),
    })
    expect(results.map((r) => r.key)).not.toContain('themealdb:53191')
    // The hit is tallied under the slug the recipe actually used (shrimp), not the parent —
    // the note names the ingredient the recipe called for.
    expect(stats.hidden.bySlug.has('shrimp')).toBe(true)
  })

  it('an avoid the recipe never used (garlic) leaves Pad Thai showing, unmarked', async () => {
    const { results, stats } = await matchRecipes(db, {
      ...BASE,
      avoid: new Map([['garlic', 'hide']]),
    })
    const padThai = results.find((r) => r.key === 'themealdb:53191')
    expect(padThai).toBeDefined()
    expect(padThai!.avoided).toEqual([])
    // Other candidates in the same 96-recipe pool do use garlic core, so they are correctly
    // hidden and tallied under garlic's own name (rule 11) even though Pad Thai itself wasn't.
    expect(stats.hidden.count).toBeGreaterThan(0)
    expect(stats.hidden.bySlug.get('garlic')?.name).toBe('garlic')
  })
})

describe('matchRecipes: lower keeps the recipe but drops it a coverage band per hit', () => {
  it('one avoided-lower hit drops exactly one band (RANK_BAND_WIDTH = 0.1), honest counts kept', async () => {
    const { results, stats } = await matchRecipes(db, {
      ...BASE,
      avoid: new Map([['shrimp', 'lower']]),
    })
    expect(stats.hidden.count).toBe(0) // never hidden — only ranked lower
    const padThai = results.find((r) => r.key === 'themealdb:53191')
    expect(padThai).toBeDefined()
    expect(padThai!.covered).toBe(11) // the honest count is untouched...
    expect(padThai!.needed).toBe(12)
    expect(padThai!.coverage).toBeCloseTo(11 / 12 - 0.1, 10) // ...only the ranking fraction moves
    expect(padThai!.avoided).toEqual([{ slug: 'shrimp', name: 'shrimp', mode: 'lower' }])
  })

  it('parent coverage applies to "lower" too (shellfish -> shrimp)', async () => {
    const { results } = await matchRecipes(db, { ...BASE, avoid: new Map([['shellfish', 'lower']]) })
    const padThai = results.find((r) => r.key === 'themealdb:53191')
    expect(padThai?.avoided.map((a) => a.slug)).toEqual(['shrimp'])
  })

  it('11 lower-mode hits on a 91.7% recipe clamp its coverage at 0, never negative', async () => {
    // Every K1 ingredient avoided as "lower" — the 11 of them that are actually Pad Thai's core
    // ingredients would drop it 11 bands off 91.7%, which the clamp holds at 0 instead of -8.3%.
    const avoid = new Map(K1.map((slug) => [slug, 'lower' as const]))
    const { results, stats } = await matchRecipes(db, { ...BASE, avoid })
    expect(stats.hidden.count).toBe(0)
    const padThai = results.find((r) => r.key === 'themealdb:53191')
    expect(padThai!.coverage).toBe(0)
    expect(padThai!.covered).toBe(11) // still the honest count — only ranking moved
  })
})

describe('compareRanked: a lower-mode band drop actually reorders two same-covered results', () => {
  // Two results tied on everything the tie-break chain checks except coverage: this isolates
  // "drops one band" as the thing that decides between them, the way it would once `matchRecipes`
  // has applied `verdict.lowerBy * RANK_BAND_WIDTH` to one of them.
  function result(coverage: number, id: number): MatchResult {
    return {
      id,
      key: `r${id}`,
      title: `r${id}`,
      course: 'main',
      cuisine: null,
      totalMin: null,
      quality: 0.8,
      coverage,
      covered: 5,
      needed: 10,
      missing: [],
      substitutable: [],
      avoided: [],
      diet: null,
    }
  }

  it('same band: id decides (a stand-in for "no avoid difference")', () => {
    const a = result(0.55, 1)
    const b = result(0.58, 2)
    expect([a, b].sort(compareRanked)).toEqual([a, b]) // same band (5), a's lower id wins the tie
  })

  it('one RANK_BAND_WIDTH drop moves a from band 5 into band 4, behind b', () => {
    const undropped = result(0.55, 1)
    const dropped = result(0.55 - RANK_BAND_WIDTH, 1) // exactly what the engine does for lowerBy=1
    const b = result(0.58, 2)
    expect([undropped, b].sort(compareRanked)).toEqual([undropped, b]) // before the drop: a first
    expect([dropped, b].sort(compareRanked)).toEqual([b, dropped]) // after: b first
  })
})
