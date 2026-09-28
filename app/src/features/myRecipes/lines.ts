import { parseLine, parseToStored, PARSER_VERSION, type ParsedLine } from '../../parse'
import type { MyRecipeData, MyRecipeIngredientLine } from './types'

/**
 * My Recipes ingredient lines as raw text (S13). The editor keeps what the owner typed in
 * `raw`; the structured fields (`quantity`, `unit`, `canonicalIngredient`) follow from the parse,
 * so the fork diff keeps working on them. What the parser understood (slug, qty, unit per item)
 * is stored beside the recipe in `my_recipes.parsed` (user.db v5), one entry per line.
 */

/** The line as the owner reads it. Lines saved before S13 (and fixture lines copied into a
 * fork) have no `raw`; one is composed from their fields ("2 tbsp vegetable oil"). The fixture's
 * placeholder unit 'unit' ("1 unit onion") is a bare count, so it is left out. */
export function lineText(line: MyRecipeIngredientLine): string {
  if (line.raw !== undefined) return line.raw
  const parts: string[] = []
  if (line.quantity !== null) parts.push(String(line.quantity))
  if (line.unit && line.unit !== 'unit') parts.push(line.unit)
  parts.push(line.canonicalIngredient)
  return parts.join(' ').trim()
}

/** The line after the owner typed `raw`: the structured fields re-read from it. `form` is kept
 * (the parser's prep words are not the fixture's form vocabulary), and so is the name while the
 * line still names the same ingredient, so a fork's diff reads "changed", not "removed chicken
 * thigh, added chicken thighs". */
export function lineFromText(raw: string, prev: MyRecipeIngredientLine): MyRecipeIngredientLine {
  const first = parseLine(raw)[0]
  const prevSlug = parseLine(lineText(prev))[0]?.slug ?? null
  const sameIngredient = first?.slug != null && first.slug === prevSlug
  return {
    ...prev,
    raw,
    quantity: first?.qty ?? null,
    unit: first?.unit ?? null,
    canonicalIngredient: sameIngredient
      ? prev.canonicalIngredient
      : (first?.raw_name ?? raw.trim()),
    optional: first?.optional ?? false,
  }
}

/** Parse every ingredient line of a recipe, in order. */
export function parseRecipeLines(data: MyRecipeData): ParsedLine[] {
  return data.ingredients.map((line) => parseToStored(lineText(line)))
}

/**
 * The stored parse when it is current for these lines, else a fresh one. Stale means: written
 * by another parser version, missing (a row from before user.db v5, or a restored old backup),
 * or not matching the lines one for one.
 */
export function currentParse(
  data: MyRecipeData,
  stored: ParsedLine[] | null,
  storedVersion: number | null,
): { parsed: ParsedLine[]; reparsed: boolean } {
  const fresh =
    stored !== null &&
    storedVersion === PARSER_VERSION &&
    stored.length === data.ingredients.length &&
    stored.every((p, i) => p.raw === lineText(data.ingredients[i]))
  if (fresh) return { parsed: stored, reparsed: false }
  return { parsed: parseRecipeLines(data), reparsed: true }
}
