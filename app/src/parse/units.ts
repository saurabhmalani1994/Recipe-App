/**
 * Port of `ingest/parse/units.py`: unit aliases -> canonical unit names, and the conversions the
 * parser needs for "plus" amounts. Tables come verbatim from Python (`tables.gen.json`).
 */
import type { Unit } from '../corpus/types'
import tables from './tables.gen.json'
import { reEscape, reSub, rstrip, strip } from './py'

const T = tables.units

export const UNIT_ALIASES: Record<string, string[]> = T.UNIT_ALIASES
export const CASE_SENSITIVE: Record<string, Unit> = T.CASE_SENSITIVE as Record<string, Unit>
export const FRONT_ONLY: ReadonlySet<string> = new Set(T.FRONT_ONLY)
export const POSTFIX: Record<string, Unit> = T.POSTFIX as Record<string, Unit>
export const IMPLICIT_ONE: ReadonlySet<string> = new Set(T.IMPLICIT_ONE)
export const CONTAINERS: ReadonlySet<string> = new Set(T.CONTAINERS)
export const VOLUME_ML: Record<string, number> = T.VOLUME_ML
export const MASS_G: Record<string, number> = T.MASS_G

const ALIAS_TO_UNIT = new Map<string, Unit>()
for (const [unit, aliases] of Object.entries(UNIT_ALIASES)) {
  for (const a of aliases) ALIAS_TO_UNIT.set(a.toLowerCase(), unit as Unit)
}

export function has(map: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key)
}

/** qty in fromUnit expressed in toUnit, or null when they are not the same dimension. */
export function convert(qty: number, fromUnit: string, toUnit: string): number | null {
  for (const table of [VOLUME_ML, MASS_G]) {
    if (has(table, fromUnit) && has(table, toUnit)) return (qty * table[fromUnit]) / table[toUnit]
  }
  return null
}

function aliasPattern(): string {
  const all = [...new Set([...ALIAS_TO_UNIT.keys(), ...Object.keys(CASE_SENSITIVE)])]
  // Longest first; Array.prototype.sort is stable, and among aliases of one length the order
  // cannot change what a match captures.
  all.sort((a, b) => [...b].length - [...a].length)
  return all.map((a) => reEscape(a).replace(/ /g, String.raw`\s*`)).join('|')
}

export const UNIT_ALT = aliasPattern()

/** Canonical unit for a matched alias token (without trailing dot). */
export function lookup(token: string): Unit | null {
  const t = rstrip(strip(token), '.')
  if (has(CASE_SENSITIVE, t)) return CASE_SENSITIVE[t]
  const t2 = reSub(String.raw`\s+`, ' ', t.toLowerCase())
  if (t2 === 't') return 'tsp'
  return ALIAS_TO_UNIT.get(t2) ?? ALIAS_TO_UNIT.get(t2.replaceAll(' ', '')) ?? null
}
