import type { Db } from '../../db/types'
import type { AvoidIngredient, AvoidMode } from '../settings/settingsRepo'
import { displayName, type Taxonomy } from './taxonomy'

/**
 * "Ingredients I avoid" (S16; R15, owner D17: "many of the apps felt very southern or mid
 * western, using things like cool whip or sour cream for lots of the recipes, which is not my
 * style"). Applied everywhere recipes are suggested — Cook (the engine and Mine), the Home rows,
 * and Surprise me — and marked on the recipe detail. A pure module over `Taxonomy`, like
 * `taxonomy.ts` and `swaps.ts`: no React, no user.db (that's `settingsRepo.ts`).
 */

/** slug -> mode, as `settingsRepo.listAvoidIngredients()` stores it. */
export type AvoidList = Map<string, AvoidMode>

export function avoidListFrom(rows: readonly AvoidIngredient[]): AvoidList {
  return new Map(rows.map((r) => [r.slug, r.mode]))
}

/**
 * Expands the avoid list so a parent slug covers its children — the same one-level rule
 * `taxonomy.ts`'s `expandHave` uses ("sour cream" avoided covers its varieties; it does not reach
 * further down, and siblings never cover each other). When a slug is reachable both directly and
 * through a parent with a different mode, 'hide' wins (the stricter of the two).
 */
export function expandAvoid(tax: Taxonomy, avoid: AvoidList): AvoidList {
  const out: AvoidList = new Map()
  const set = (slug: string, mode: AvoidMode) => {
    const existing = out.get(slug)
    if (!existing || (existing === 'lower' && mode === 'hide')) out.set(slug, mode)
  }
  for (const [slug, mode] of avoid) {
    set(slug, mode)
    for (const child of tax.children.get(slug) ?? []) set(child, mode)
  }
  return out
}

export interface AvoidHit {
  slug: string
  name: string
  mode: AvoidMode
}

/** Which of `slugs` (a recipe's core ingredient slugs) are on the (already expanded) avoid
 * list. */
export function avoidHits(
  tax: Taxonomy,
  expanded: AvoidList,
  slugs: Iterable<string>,
): AvoidHit[] {
  const hits: AvoidHit[] = []
  for (const slug of slugs) {
    const mode = expanded.get(slug)
    if (mode) hits.push({ slug, name: displayName(tax, slug), mode })
  }
  return hits
}

export interface AvoidVerdict {
  /** True when the recipe should be dropped from the list entirely (rule 11: never silently —
   * the caller must fold it into a `HiddenTally` instead of just discarding it). */
  hide: boolean
  hits: AvoidHit[]
  /** How many coverage bands (engine.ts `RANK_BAND_WIDTH`) to drop this recipe by. Always 0 when
   * `hide` is true — a hidden recipe has no rank left to drop. */
  lowerBy: number
}

/** One hide-mode hit is enough to hide the recipe outright; short of that, it drops one band per
 * lower-mode hit (brief S16 #2). */
export function verdictFor(hits: AvoidHit[]): AvoidVerdict {
  const hide = hits.some((h) => h.mode === 'hide')
  return { hide, hits, lowerBy: hide ? 0 : hits.filter((h) => h.mode === 'lower').length }
}

/** Tallies hidden recipes and which avoided slug(s) hid each one, for the "12 hidden: sour
 * cream" note (rule 11: a drop is never silent). */
export interface HiddenTally {
  count: number
  bySlug: Map<string, { name: string; count: number }>
}

export function newHiddenTally(): HiddenTally {
  return { count: 0, bySlug: new Map() }
}

/** Call once per recipe hidden, with the hit list that produced the hide verdict. */
export function recordHidden(tally: HiddenTally, hits: readonly AvoidHit[]): void {
  tally.count++
  for (const hit of hits) {
    if (hit.mode !== 'hide') continue
    const existing = tally.bySlug.get(hit.slug)
    if (existing) existing.count++
    else tally.bySlug.set(hit.slug, { name: hit.name, count: 1 })
  }
}

export function mergeHiddenTally(into: HiddenTally, from: HiddenTally): void {
  into.count += from.count
  for (const [slug, { name, count }] of from.bySlug) {
    const existing = into.bySlug.get(slug)
    if (existing) existing.count += count
    else into.bySlug.set(slug, { name, count })
  }
}

/** "12 hidden: sour cream, cool whip" — most-cited avoided ingredient first. Null when nothing
 * was hidden, so a caller shows this only when there is something to say. */
export function hiddenNote(tally: HiddenTally): string | null {
  if (tally.count === 0) return null
  const names = [...tally.bySlug.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((v) => v.name)
  return `${tally.count} hidden: ${names.join(', ')}`
}

interface AvoidSlugRow {
  recipe_id: number
  slug: string
}

/**
 * Which avoided slugs (expanded for parent coverage) each of `recipeIds` uses as a core
 * ingredient — for callers that only have recipe ids and no ingredient lines in hand yet
 * (`home/rows.ts`, `home/surprise.ts`; `engine.ts` and `myRecipeMatch.ts` already have the core
 * slugs loaded and check `avoidHits` directly).
 */
export async function loadAvoidHits(
  db: Db,
  tax: Taxonomy,
  avoid: AvoidList,
  recipeIds: readonly number[],
): Promise<Map<number, AvoidHit[]>> {
  const out = new Map<number, AvoidHit[]>()
  if (avoid.size === 0 || recipeIds.length === 0) return out
  const expanded = expandAvoid(tax, avoid)
  const { rows } = await db.query<AvoidSlugRow>(
    `SELECT recipe_id, slug FROM recipe_slugs
      WHERE core = 1
        AND recipe_id IN (SELECT value FROM json_each(?))
        AND slug IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(recipeIds), JSON.stringify([...expanded.keys()])],
  )
  for (const row of rows) {
    const mode = expanded.get(row.slug)
    if (!mode) continue
    const list = out.get(row.recipe_id)
    const hit: AvoidHit = { slug: row.slug, name: displayName(tax, row.slug), mode }
    if (list) list.push(hit)
    else out.set(row.recipe_id, [hit])
  }
  return out
}
