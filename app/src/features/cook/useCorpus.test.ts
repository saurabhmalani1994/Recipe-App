import { describe, expect, it } from 'vitest'
import { copyEstimateSeconds } from '../../corpus/config'
import { corpusStatusText } from './useCorpus'

describe('corpusStatusText', () => {
  it('shows the one-time setup line, with its estimate, while the native copy runs', () => {
    expect(corpusStatusText({ state: 'copying', estimateSeconds: 15 })).toBe(
      'Setting up the recipe library (one time, about 15 seconds)…',
    )
    expect(corpusStatusText({ state: 'copying', estimateSeconds: 0 })).toBe(
      'Setting up the recipe library (one time)…',
    )
  })

  it('estimates the copy in 5-second steps, never below 5', () => {
    expect(copyEstimateSeconds(0)).toBe(0)
    expect(copyEstimateSeconds(1024)).toBe(5)
    // The real library bundled in the APK, about 228 MB.
    expect(copyEstimateSeconds(228 * 1024 * 1024)).toBe(15)
  })
})
