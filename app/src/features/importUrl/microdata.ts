import { parseIso8601Duration } from './duration'
import { emptyImportedRecipe, type ImportedRecipe } from './types'

/**
 * schema.org `Recipe` microdata (`itemscope`/`itemtype`/`itemprop`), the fallback once
 * `jsonld.ts` finds no `<script type="application/ld+json">` `Recipe`. Several WordPress recipe
 * plugins (WPRM among them) render this alongside, or instead of, JSON-LD.
 */

function isRecipeScope(el: Element): boolean {
  const type = el.getAttribute('itemtype') ?? ''
  return el.hasAttribute('itemscope') && /\/recipe$/i.test(type.trim())
}

export function findMicrodataRecipeRoot(doc: Document): Element | null {
  return [...doc.querySelectorAll('[itemscope][itemtype]')].find(isRecipeScope) ?? null
}

/** The text an `itemprop` element carries: `content`/`datetime` when present (a `<meta>` or
 * `<time>`), `src`/`href` for an image or link, else the element's own text. */
function propValue(el: Element): string | null {
  const content = el.getAttribute('content')
  if (content !== null) return content
  if (el.tagName === 'TIME') return el.getAttribute('datetime') ?? el.textContent?.trim() ?? null
  if (el.tagName === 'IMG') return el.getAttribute('src')
  if (el.tagName === 'A') return el.getAttribute('href')
  const text = el.textContent?.trim()
  return text ? text : null
}

/** Every direct match for `itemprop="name"` under `root`, excluding ones that belong to a
 * *different* nested `itemscope` (so a step's own `name`/`text` isn't read as the recipe's). */
function ownProps(root: Element, name: string): Element[] {
  return [...root.querySelectorAll(`[itemprop="${name}"]`)].filter((el) => {
    let scope = el.parentElement
    while (scope && scope !== root) {
      if (scope.hasAttribute('itemscope')) return false
      scope = scope.parentElement
    }
    return true
  })
}

function propText(root: Element, name: string): string | null {
  const [el] = ownProps(root, name)
  return el ? propValue(el) : null
}

function propTextAll(root: Element, name: string): string[] {
  return ownProps(root, name)
    .map(propValue)
    .filter((v): v is string => v !== null && v.trim() !== '')
}

function topLevelOnly(elements: Element[]): Element[] {
  return elements.filter((el) => !elements.some((other) => other !== el && other.contains(el)))
}

/** `recipeInstructions`: `HowToStep`/`HowToSection` scopes when present, else `itemprop="text"`
 * elements directly, else the container's own text split into lines. */
function microdataSteps(root: Element): string[] {
  const scoped = [...root.querySelectorAll('[itemscope][itemtype]')].filter((el) => {
    const type = (el.getAttribute('itemtype') ?? '').toLowerCase()
    return type.endsWith('howtostep') || type.endsWith('howtosection')
  })
  if (scoped.length === 0) {
    const texts = propTextAll(root, 'text')
    if (texts.length > 0) return texts
    return (root.textContent ?? '')
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  const out: string[] = []
  for (const el of topLevelOnly(scoped)) {
    const type = (el.getAttribute('itemtype') ?? '').toLowerCase()
    if (type.endsWith('howtosection')) {
      const name = propText(el, 'name')
      if (name) out.push(name)
      out.push(...microdataSteps(el))
    } else {
      const text = propText(el, 'text') ?? el.textContent?.trim() ?? ''
      if (text) out.push(text)
    }
  }
  return out
}

export function extractMicrodataRecipe(html: string, sourceUrl: string | null): ImportedRecipe | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = findMicrodataRecipeRoot(doc)
  if (!root) return null

  const recipe = emptyImportedRecipe(sourceUrl)
  recipe.title = propText(root, 'name')
  recipe.ingredients = propTextAll(root, 'recipeIngredient')
  const instructionsRoot = ownProps(root, 'recipeInstructions')[0] ?? root
  recipe.steps = microdataSteps(instructionsRoot)
  recipe.image = propText(root, 'image')
  recipe.servingsText = propText(root, 'recipeYield')
  recipe.prepMin = parseIso8601Duration(propText(root, 'prepTime'))
  recipe.cookMin = parseIso8601Duration(propText(root, 'cookTime'))
  recipe.totalMin = parseIso8601Duration(propText(root, 'totalTime'))
  recipe.cuisine = propText(root, 'recipeCuisine')
  recipe.category = propText(root, 'recipeCategory')
  return recipe
}
