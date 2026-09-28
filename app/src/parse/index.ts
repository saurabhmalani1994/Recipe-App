/**
 * The app's ingredient-line parser (S13): `parseLine` is the TypeScript port of
 * `ingest/parse/parser.py`; the rest turns its output into what My Recipes stores and shows.
 */
import { ingredientName } from '../corpus/slugs'
import type { Unit } from '../corpus/types'
import { formatAmount } from '../features/units/units'
import { parseLine, type ParsedItem } from './parser'

export { parseLine, type ParsedItem } from './parser'

/**
 * Bumped whenever the parser's output for a line can change (a port change, a regenerated
 * slugs.json). Stored with each My Recipe's parsed lines; a stale or missing version is parsed
 * again on read (`features/myRecipes/myRecipesRepo.ts`).
 */
export const PARSER_VERSION = 1

/** What My Recipes keeps of a parsed item: enough to scale it, shop for it and match it. */
export interface StoredItem {
  slug: string | null
  qty: number | null
  qtyMax: number | null
  unit: Unit | null
  pkgQty: number | null
  pkgUnit: Unit | null
  optional: boolean
}

/** One ingredient line as typed, with what the parser understood from it. */
export interface ParsedLine {
  raw: string
  items: StoredItem[]
}

export function toStoredItem(item: ParsedItem): StoredItem {
  return {
    slug: item.slug,
    qty: item.qty,
    qtyMax: item.qty_max,
    unit: item.unit,
    pkgQty: item.pkg?.qty ?? null,
    pkgUnit: item.pkg?.unit ?? null,
    optional: item.optional,
  }
}

export function parseToStored(raw: string): ParsedLine {
  return { raw, items: parseLine(raw).map(toStoredItem) }
}

/** How a line reads back: 'ok' (every item has an ingredient), 'partial' (some do), 'none'
 * (nothing recognised: the editor marks it), 'empty' (blank or a section header). */
export type LineStatus = 'ok' | 'partial' | 'none' | 'empty'

export function lineStatus(items: StoredItem[]): LineStatus {
  if (items.length === 0) return 'empty'
  const known = items.filter((i) => i.slug !== null).length
  if (known === items.length) return 'ok'
  return known === 0 ? 'none' : 'partial'
}

/** "2 cups → cilantro"; "salt" when there is no amount; "? (not recognised)" for an item with
 * no ingredient. Several items are joined with " + ". */
export function describeItems(items: StoredItem[]): string {
  return items
    .map((item) => {
      const name = item.slug ? ingredientName(item.slug) : '? (not recognised)'
      if (item.qty === null) return name
      const amount = formatAmount({ qty: item.qty, qtyMax: item.qtyMax, unit: item.unit })
      return `${amount} → ${name}`
    })
    .join(' + ')
}
