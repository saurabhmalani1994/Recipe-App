import type { Db } from '../../db/types'
import type { Equipment } from '../../corpus/types'
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

/** A My Recipe an active filter excluded for lacking data (R13), not for genuinely failing it —
 * Cook.tsx turns these into "N of your recipes hidden: <reasons>". */
export interface HiddenMyRecipe {
  title: string
  reasons: string[]
}

export interface MyRecipeMatchOutput {
  results: MatchResult[]
  hidden: HiddenMyRecipe[]
}

/** Every currently-active filter this My Recipe has no value for, human-readable. Checked
 * before the filters themselves run, so a recipe never falls through one silently (rule 11). */
function missingFilterFields(recipe: MyRecipe, query: MatchQuery): string[] {
  const reasons: string[] = []
  if (query.onePot && (recipe.data.onePot === null || recipe.data.onePot === undefined)) {
    reasons.push('one-pot not set')
  }
  const needsEquipment =
    (query.kitchen && query.kitchen.length > 0) || (query.useOnly && query.useOnly.length > 0)
  if (needsEquipment && (recipe.data.equipment === null || recipe.data.equipment === undefined)) {
    reasons.push('no equipment set')
  }
  if (
    query.maxMinutes !== null &&
    (recipe.data.totalMin === null || recipe.data.totalMin === undefined)
  ) {
    reasons.push('no time set')
  }
  return reasons
}

/** Every equipment `recipe` uses is in `allowed` (the SQL side's `equipmentSubset`, minus the
 * either/or `recipe_equipment_alternatives` table a My Recipe has no equivalent of). */
function equipmentSubset(recipeEquipment: Equipment[] | null | undefined, allowed: Equipment[]): boolean {
  return (recipeEquipment ?? []).every((e) => allowed.includes(e))
}

/**
 * "My Recipes in Cook results" (S12 brief #2, owner: "Upload my own recipes ... to copy an
 * existing version and make a version of it with some modifications"). A JS-side union with the
 * SQL candidates from `matchRecipes`: My Recipes are never in `corpus.db`, so they cannot join
 * `recipe_slugs` the way a corpus recipe does, but the stored slugs from each line's parse
 * (S13) are everything the same coverage/substitution math over `engine.ts` needs.
 *
 * Applies: `have` (coverage, with the same substitution fallback via `fittingSwaps`), `cuisine`
 * (exact match against the recipe's own `MyRecipeData.cuisine`), `diet` (`myRecipeDiet.ts`), and
 * — S12b #3 (R13), closing S12's Open note — "one pot", "use only equipment" and "under N
 * minutes" against `MyRecipeData.onePot`/`equipment`/`totalMin`. Those three fields are
 * optional (typed in the editor, or accepted from an `inferFromSteps.ts` suggestion): when one
 * of them is unset and its filter is active, the recipe is excluded rather than passed through
 * (rule 11) and reported back in `hidden`, so Cook.tsx can tell the owner why ("N of your
 * recipes hidden: no time set").
 */
export async function matchMyRecipes(
  db: Db,
  tax: Taxonomy,
  recipes: MyRecipe[],
  query: MatchQuery,
): Promise<MyRecipeMatchOutput> {
  if (recipes.length === 0) return { results: [], hidden: [] }
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
  const hidden: HiddenMyRecipe[] = []
  let nextId = -1
  for (const recipe of recipes) {
    if (query.cuisine && recipe.data.cuisine !== query.cuisine) continue

    // R13: "one pot", "use only equipment" and "under N minutes" now apply to a My Recipe too
    // (S12's Open note) — from the optional fields the editor collects or infers
    // (`inferFromSteps.ts`). Rule 11: a My Recipe with no value for an active filter is
    // excluded, not passed through, and counted in `hidden` so Cook.tsx can say why.
    const reasons = missingFilterFields(recipe, query)
    if (reasons.length > 0) {
      hidden.push({ title: recipe.title, reasons })
      continue
    }
    if (query.onePot && !recipe.data.onePot) continue
    if (query.maxMinutes !== null && (recipe.data.totalMin ?? Infinity) > query.maxMinutes) continue
    if (query.kitchen && query.kitchen.length > 0 && !equipmentSubset(recipe.data.equipment, query.kitchen))
      continue
    if (
      query.useOnly &&
      query.useOnly.length > 0 &&
      !(
        equipmentSubset(recipe.data.equipment, query.useOnly) &&
        recipe.data.equipment!.some((e) => query.useOnly!.includes(e))
      )
    )
      continue

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
      totalMin: recipe.data.totalMin ?? null,
      // R12: the owner's own recipes worked well by definition (that's why they're saved), so
      // a My Recipe ranks as the top quality within its coverage band rather than sinking below
      // a same-band corpus recipe on the quality tiebreak (compareRanked/compareLegacy).
      quality: 1,
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
  return { results, hidden }
}
