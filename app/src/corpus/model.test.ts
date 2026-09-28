import { describe, expect, it } from 'vitest'
import { decodeDietSwaps } from './model'

describe('decodeDietSwaps (schema 4 short form, S19)', () => {
  it('reads the exact text ingest/build/build_corpus.pack_swaps writes', () => {
    // the string test_build.py pins for pack_swaps
    const text =
      '[{"b":"pork__vegetarian_meat","i":"diced pancetta","q":3,"s":"pancetta","u":"meat substitute",' +
      '"v":"s","x":["vegetarian_meat"]},{"f":true,"i":"anchovy","v":"o"}]'
    expect(decodeDietSwaps(text)).toStrictEqual([
      {
        item: 'diced pancetta',
        slug: 'pancetta',
        use: 'meat substitute',
        use_slug: ['vegetarian_meat'],
        via: 'substitution',
        sub_id: 'pork__vegetarian_meat',
        quality: 3,
      },
      { item: 'anchovy', slug: null, use: null, via: 'omit', from_steps: true },
    ])
  })

  it('passes a long-form element through and treats null as no swaps', () => {
    const long = { item: 'bacon', slug: 'bacon', use: null, via: 'alternative' }
    expect(decodeDietSwaps(JSON.stringify([long]))).toStrictEqual([long])
    expect(decodeDietSwaps(null)).toStrictEqual([])
  })
})
