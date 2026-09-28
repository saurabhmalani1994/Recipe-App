import { ingredientAisle, ingredientName, ingredientPurchase } from '../../corpus/slugs'
import type { Db } from '../../db/types'
import type { Taxonomy } from '../cook/taxonomy'
import { listKitchenItems } from '../kitchen/kitchenRepo'
import { listPlanEntriesInRange, mondayOf, nextWeekStart, weekDays } from '../plan/planRepo'
import { lookupPlanRecipe } from '../plan/recipeLookup'
import { scaleFactor } from '../scaling/scale'
import type { AppSettings } from '../settings/settingsRepo'
import type { UnitTable } from '../units/units'
import { aggregateGroceryLines, type GroceryLineInput, type SlugMeta } from './aggregate'
import { buildGroceryList } from './groceryRepo'

export type ListRange = 'this' | 'next' | 'both'

export interface BuildResult {
  /** Plan entries the list was built from. */
  entries: number
  /** Names left off because the kitchen (or the pantry) already has them. */
  had: string[]
}

/**
 * Builds the current grocery list from the plan (brief S7 #2), for this week, next week or both.
 * Moved out of the List screen (S22b) so Plan can build the list in one tap too.
 */
export async function buildListFromPlan(
  corpus: { db: Db; tax: Taxonomy; units: UnitTable },
  settings: AppSettings,
  range: ListRange,
): Promise<BuildResult> {
  const thisWeek = mondayOf(new Date())
  const next = nextWeekStart(thisWeek)
  const start = range === 'next' ? next : thisWeek
  const to = range === 'this' ? weekDays(thisWeek)[6] : weekDays(next)[6]
  const entries = await listPlanEntriesInRange(start, to)

  const kitchen = await listKitchenItems()
  const haveSlugs = new Set(kitchen.map((k) => k.ingredientId))

  const lines: GroceryLineInput[] = []
  for (const entry of entries) {
    const recipe = await lookupPlanRecipe(corpus, entry)
    if (!recipe) continue
    const factor = recipe.servings
      ? scaleFactor(recipe.servings, entry.people, settings.servingsPerPerson)
      : 1
    for (const line of recipe.lines) {
      lines.push({
        slug: line.slug,
        raw: line.raw,
        qty: line.qty === null ? null : line.qty * factor,
        qtyMax: line.qtyMax === null ? null : line.qtyMax * factor,
        unit: line.unit,
        pkgQty: line.pkgQty,
        pkgUnit: line.pkgUnit,
        recipe: entry.recipeTitle || null,
        unitStripped: line.unitStripped,
      })
    }
  }

  const metaFor = (slug: string): SlugMeta => ({
    name: ingredientName(slug),
    aisle: ingredientAisle(slug),
    isStaple: corpus.tax.staples.has(slug),
    density: corpus.tax.density.get(slug) ?? null,
    eachG: corpus.tax.eachG.get(slug) ?? null,
    purchase: ingredientPurchase(slug),
  })

  const { items, checkThese } = aggregateGroceryLines(lines, {
    units: corpus.units,
    system: settings.units,
    metaFor,
    haveSlugs,
  })

  await buildGroceryList(null, items, checkThese)
  return { entries: entries.length, had: items.filter((i) => i.have).map((i) => i.name) }
}

/** The line the List screen shows after a build (rule 11: nothing leaves without a word). */
export function buildMessage(result: BuildResult): string | null {
  if (result.entries === 0) return 'Nothing planned for this range yet — add some recipes to Plan first.'
  if (result.had.length > 0) {
    return `Left off ${result.had.length} you already have: ${result.had.join(', ')}.`
  }
  return null
}
