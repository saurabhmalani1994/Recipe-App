import { parseIso8601Duration } from './duration'
import { emptyImportedRecipe, type ImportedRecipe } from './types'

/**
 * schema.org `Recipe` JSON-LD (S12 brief #1), the primary source: BBC Good Food, most WordPress
 * recipe plugins and most blog platforms all embed one `<script type="application/ld+json">`
 * block per page, sometimes several, and sometimes with the `Recipe` node buried in a top-level
 * `@graph` array alongside `WebPage`/`BreadcrumbList`/... nodes (common when an SEO plugin adds
 * its own JSON-LD bundle). This never touches the DOM beyond the `<script>` tags themselves —
 * microdata (`microdata.ts`) is the fallback once no `<script>` gives a usable `Recipe`.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typesOf(node: { [key: string]: JsonValue }): string[] {
  const t = node['@type']
  const list = Array.isArray(t) ? t : t !== undefined && t !== null ? [t] : []
  return list.filter((x): x is string => typeof x === 'string')
}

/** Every `Recipe` node in `html`'s JSON-LD, walking `@graph` and plain arrays at any depth. */
export function extractJsonLdRecipes(html: string): { [key: string]: JsonValue }[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')]
  const out: { [key: string]: JsonValue }[] = []
  for (const script of scripts) {
    let parsed: JsonValue
    try {
      parsed = JSON.parse(script.textContent ?? '') as JsonValue
    } catch {
      continue
    }
    collect(parsed, out)
  }
  return out
}

function collect(node: JsonValue, out: { [key: string]: JsonValue }[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out)
    return
  }
  if (!isRecord(node)) return
  if (node['@graph'] !== undefined) collect(node['@graph'], out)
  if (typesOf(node).some((t) => t.toLowerCase() === 'recipe')) out.push(node)
}

function asStringArray(value: JsonValue | undefined): string[] {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value) ? value : [value]
  return list.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

function firstString(value: JsonValue | undefined): string | null {
  const [first] = asStringArray(value)
  return first ?? null
}

/** `image` can be a string, an array of strings, an `ImageObject`, or an array of those. */
function imageUrl(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first === 'string') return first
  if (isRecord(first)) {
    const url = first.url ?? first.contentUrl
    if (typeof url === 'string') return url
  }
  return null
}

/** Flattens `recipeInstructions`: a plain string, an array of strings, `HowToStep` objects, or
 * `HowToSection` objects (each with its own `itemListElement` of `HowToStep`s). A section's
 * `name` becomes its own step entry so the grouping isn't silently dropped. */
function flattenInstructions(value: JsonValue | undefined): string[] {
  if (value === undefined || value === null) return []
  if (typeof value === 'string') {
    // Some sites put the whole method in one string, one step per line.
    return value
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) return isRecord(value) ? flattenInstructions([value]) : []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) out.push(item.trim())
      continue
    }
    if (!isRecord(item)) continue
    const types = typesOf(item).map((t) => t.toLowerCase())
    if (types.includes('howtosection')) {
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      if (name) out.push(name)
      out.push(...flattenInstructions(item.itemListElement))
      continue
    }
    // HowToStep (or an untyped object with a `text`/`name`).
    const text = item.text ?? item.name
    if (typeof text === 'string' && text.trim()) out.push(text.trim())
  }
  return out
}

export function jsonLdToImported(node: { [key: string]: JsonValue }, sourceUrl: string | null): ImportedRecipe {
  const recipe = emptyImportedRecipe(sourceUrl)
  recipe.title = typeof node.name === 'string' ? node.name.trim() : null
  recipe.ingredients = asStringArray(node.recipeIngredient ?? node.ingredients).map((s) => s.trim())
  recipe.steps = flattenInstructions(node.recipeInstructions)
  recipe.image = imageUrl(node.image)
  recipe.servingsText = firstString(node.recipeYield)
  recipe.prepMin = parseIso8601Duration(firstString(node.prepTime))
  recipe.cookMin = parseIso8601Duration(firstString(node.cookTime))
  recipe.totalMin = parseIso8601Duration(firstString(node.totalTime))
  recipe.cuisine = firstString(node.recipeCuisine)
  recipe.category = firstString(node.recipeCategory)
  return recipe
}
