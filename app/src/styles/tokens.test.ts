import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * S22a quality gate: every text colour the design system puts on a surface meets WCAG AA
 * (4.5:1, the body-text bar, applied to every pair including placeholders), in light AND dark. Reads the real `tokens.css`, so a tweak that breaks contrast fails here.
 */
const TOKENS_CSS = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf-8')

type Rgba = [number, number, number, number]

/** The custom properties declared in the first `:root { ... }` after `from`. */
function rootVars(from: number): Map<string, string> {
  const start = TOKENS_CSS.indexOf(':root {', from)
  const end = TOKENS_CSS.indexOf('}', start)
  const block = TOKENS_CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
  const vars = new Map<string, string>()
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    vars.set(match[1], match[2].trim())
  return vars
}

const LIGHT = rootVars(0)
const DARK = new Map([...LIGHT, ...rootVars(TOKENS_CSS.indexOf('prefers-color-scheme: dark'))])

function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(value)
  if (rgba) return [+rgba[1], +rgba[2], +rgba[3], +rgba[4]]
  throw new Error(`not a colour: ${value}`)
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** [text token, surface token, minimum ratio]. */
const PAIRS: [string, string, number][] = []
for (const surface of ['--bg', '--surface', '--surface-2', '--surface-3']) {
  PAIRS.push(['--text', surface, 4.5], ['--text-2', surface, 4.5])
}
for (const surface of ['--bg', '--surface', '--surface-2']) {
  PAIRS.push(['--accent', surface, 4.5], ['--herb', surface, 4.5])
}
PAIRS.push(
  ['--on-accent', '--accent', 4.5],
  ['--on-accent-soft', '--accent-soft', 4.5],
  ['--text', '--accent-soft', 4.5],
  ['--on-herb-soft', '--herb-soft', 4.5],
  // S22b: swipe actions (tick, delete) and the undo snackbar.
  ['--on-herb', '--herb', 4.5],
  ['--on-danger', '--danger', 4.5],
  ['--on-inverse', '--inverse-surface', 4.5],
  ['--inverse-accent', '--inverse-surface', 4.5],
  // S22b: the delete action's colour also marks "you avoid this" text on the page.
  ['--danger', '--bg', 4.5],
  ['--danger', '--surface', 4.5],
)
for (let i = 1; i <= 8; i++) PAIRS.push([`--ph-${i}-fg`, `--ph-${i}-bg`, 4.5])

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('design tokens (%s)', (_theme, vars) => {
  const colour = (name: string): Rgba => {
    const value = vars.get(name)
    if (!value) throw new Error(`missing token ${name}`)
    return parse(value)
  }

  it.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    const ratio = contrast(colour(fg), colour(bg))
    expect(ratio, `${fg} on ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min)
  })

  it('text over a photo scrim stays readable even on a pure white photo', () => {
    const scrimOnWhite = over(colour('--scrim'), [255, 255, 255, 1])
    expect(contrast(colour('--on-scrim'), scrimOnWhite)).toBeGreaterThanOrEqual(4.5)
  })
})
