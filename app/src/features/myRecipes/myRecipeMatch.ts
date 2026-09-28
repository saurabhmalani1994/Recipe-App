import type { Db } from '../../db/types'
import {
  compareResults,
  type MatchQuery,
  type MatchResult,
  type MissingItem,
  type SubstitutableItem,
} from '../cook/engine'
import { displayName, expandHave, type Taxonomy } from '../cook/taxonomy'
import { fittingSwaps, loadSwapTable, recipeContexts } from '../cook/swaps'
import { myRecipeDietStatus } from './myRecipeDiet'
import type { MyRecipe } from './types'

/**
 * "My Recipes in Cook results" (S12 brief #2, owner: "Upload my own recipes ... to copy an
 * existing version and make a version of it with some modifications"). A JS-side union with the
 * SQL candidates from `matchRecipes`: My Recipes are never in `corpus.db`, so they cannot join
 * `recipe_slugs` the way a corpus recipe does, but the stored slugs from each line's parse
 * (S13) are everything the same coverage/substitution math over `engine.ts` needs.
 *
 * Applies: `have` (coverage, with the same substitution fallback via `fittingSwaps`), `cuisine`
 * (exact match against the recipe's own `MyRecipeData.cuisine`), and `diet` (`myRecipeDiet.ts`).
 * Does not apply: "one pot", "use only equipment" and "under N minutes" — a My Recipe carries no
 * course, equipment or timing data to filter on, so it passes every one of those filters
 * unfiltered rather than being silently dropped by a filter it cannot answer (see
 * orch/reports/S12.md, Open).
 */
export async function matchMyRecipes(
  db: Db,
  tax: Taxonomy,
  recipes: MyRecipe[],
  query: MatchQuery,
): Promise<MatchResult[]> {
  if (recipes.length === 0) return []
  const have = expandHave(tax, query.have)

  // One swap-table query for every slug any My Recipe uses (kitchen substitution and diet
  // substitution both draw on it).
  const targets = new Set<string>()
  for (const recipe of recipes) {
    for (const line of recipe.parsed) {
      for (const item of line.items) if (item.slug) targets.add(item.slug)
    }
  }
  const table = await loadSwapTable(db, tax, targets)

  const results: MatchResult[] = []
  let nextId = -1
  for (const recipe of recipes) {
    if (query.cuisine && recipe.data.cuisine !== query.cuisine) continue

    const allItems = recipe.parsed.flatMap((line) => line.items)
    const context = {
      contexts: recipeContexts('main', recipe.title),
      cuisine: recipe.data.cuisine,
      diet: query.diet,
    }

    const diet = query.diet === 'everything' ? null : myRecipeDietStatus(tax, table, allItems, context)
    if (diet && diet.status === 'no') continue

    // Core: used non-optionally, not a staple — the same definition `matchRecipes` uses for
    // `recipe_slugs.core`. A line with items but none resolved to a slug is "unreadable" (goes
    // to "Check these" in the grocery build too); a blank line or section header has no items.
    const core = new Set<string>()
    let unresolvedCount = 0
    for (const line of recipe.parsed) {
      if (line.items.length === 0) continue
      const hasSlug = line.items.some((item) => item.slug)
      if (!hasSlug) {
        unresolvedCount++
        continue
      }
      for (const item of line.items) {
        if (item.slug && !item.optional && !tax.staples.has(item.slug)) core.add(item.slug)
      }
    }
    const needed = core.size + unresolvedCount
    if (needed === 0) continue

    const lacking = [...core].filter((slug) => !have.has(slug))
    const covered = core.size - lacking.length
    // Matches the SQL candidate query's inner join on `hits`: at least one core slug on hand.
    if (covered === 0) continue

    const missing: MissingItem[] = []
    const substitutable: SubstitutableItem[] = []
    for (const slug of lacking) {
      const best = fittingSwaps(table, slug, have, context)[0]
      if (best?.haveAll) substitutable.push({ slug, name: displayName(tax, slug), swap: best })
      else missing.push({ slug, name: displayName(tax, slug) })
    }
    for (let i = 0; i < unresolvedCount; i++) {
      missing.push({ slug: null, name: 'an ingredient line that could not be read' })
    }

    results.push({
      id: nextId--,
      key: recipe.id,
      title: recipe.title,
      course: 'main',
      cuisine: recipe.data.cuisine,
      totalMin: null,
      quality: 0,
      coverage: covered / needed,
      covered,
      needed,
      missing,
      substitutable,
      diet,
      mine: true,
      myRecipeId: recipe.id,
    })
  }

  results.sort(compareResults)
  return results
}
