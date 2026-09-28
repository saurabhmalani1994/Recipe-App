import { extractJsonLdRecipes, jsonLdToImported } from './jsonld'
import { extractMicrodataRecipe } from './microdata'
import { parsePlainTextRecipe } from './textFallback'
import { hasContent, type ImportedRecipe } from './types'

/** A fetched page, or a paste of the page's saved HTML, always starts with a tag; a paste of
 * just the recipe text does not. */
function looksLikeHtml(content: string): boolean {
  return /^\s*</.test(content) || /<\s*(?:html|body|div|p|script)\b/i.test(content.slice(0, 2000))
}

/** schema.org Recipe JSON-LD, then microdata, then (for HTML with neither) the page's visible
 * text run through the same heuristic a plain-text paste gets. */
function parseHtml(html: string, sourceUrl: string | null): ImportedRecipe {
  for (const node of extractJsonLdRecipes(html)) {
    const recipe = jsonLdToImported(node, sourceUrl)
    if (hasContent(recipe)) return recipe
  }
  const microdata = extractMicrodataRecipe(html, sourceUrl)
  if (microdata && hasContent(microdata)) return microdata

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = doc.body?.textContent ?? ''
  const fallback = parsePlainTextRecipe(text)
  fallback.sourceUrl = sourceUrl
  return fallback
}

/**
 * Parses whatever the import screen has in hand — a fetched page, a pasted copy of a page's
 * HTML, or pasted plain recipe text — into an `ImportedRecipe` (S12 brief #1).
 */
export function parseImportInput(content: string, sourceUrl: string | null): ImportedRecipe {
  if (looksLikeHtml(content)) return parseHtml(content, sourceUrl)
  const recipe = parsePlainTextRecipe(content)
  recipe.sourceUrl = sourceUrl
  return recipe
}
