import type { Db } from '../../db/types'
import type { Course, IngredientFlag, SubContext } from '../../corpus/types'
import type { AppDiet } from './engine'
import { ancestors, displayName, type Taxonomy } from './taxonomy'

/**
 * Substitutions from the curated table (`substitutions` + `substitution_components`) that fit a
 * recipe: a context the recipe cooks in, and no diet flag the active preset rules out.
 */

export interface SwapComponent {
  slug: string
  name: string
  amount: number
  /** 'x' is a multiple of the target's quantity; otherwise a unit per `per_unit`. */
  unit: string
}

export interface SwapOption {
  id: string
  /** The slug this swap replaces (the missing slug, or a broader slug above it). */
  target: string
  quality: number
  perUnit: string | null
  components: SwapComponent[]
  note: string | null
  flavorEffect: string
  /** Every component is on hand (after staples and parent/child expansion). */
  haveAll: boolean
}

/** Swaps of at least this quality count as "missing, but a substitute works" (brief S6). */
export const MIN_SWAP_QUALITY = 2

const SAVORY: SubContext[] = [
  'sauce',
  'braise',
  'soup',
  'stir_fry',
  'marinade',
  'dressing',
  'frying',
  'garnish',
]

const COURSE_CONTEXTS: Record<Course, SubContext[]> = {
  main: SAVORY,
  side: SAVORY,
  snack: SAVORY,
  breakfast: [...SAVORY, 'baking'],
  dessert: ['dessert', 'baking', 'garnish'],
  baking: ['baking', 'dessert'],
  drink: ['beverage'],
  sauce_condiment: ['sauce', 'dressing', 'marinade', 'garnish'],
}

const TITLE_CONTEXTS: [RegExp, SubContext][] = [
  [
    /\b(bake[ds]?|baking|cakes?|breads?|muffins?|cookies?|biscuits?|scones?|pies?|tarts?|pastry|pastries|brownies?|loaf|buns?|rolls|cobbler|crumble|traybake)\b/i,
    'baking',
  ],
  [/\b(salads?|slaw)\b/i, 'dressing'],
  [/\b(smoothies?|shakes?|lassi|tea|coffee|cocktails?|punch|lemonade|juice|latte)\b/i, 'beverage'],
  [/\b(ice cream|puddings?|custard|mousse|sorbet|fudge)\b/i, 'dessert'],
]

/** The substitution contexts a recipe cooks in, from its course and title. 'any' always fits. */
export function recipeContexts(course: Course, title: string): Set<SubContext> {
  const out = new Set<SubContext>(['any', ...COURSE_CONTEXTS[course]])
  for (const [pattern, context] of TITLE_CONTEXTS) {
    if (pattern.test(title)) out.add(context)
  }
  return out
}

/** The ingredient flag a diet preset rules out (R7: vegetarian is explicit meat; R8). */
export function forbiddenFlag(diet: AppDiet): IngredientFlag | null {
  if (diet === 'vegetarian') return 'explicit_meat'
  if (diet === 'no_red_meat') return 'red_meat'
  return null
}

interface SwapRow {
  id: string
  target: string
  quality: number
  per_unit: string | null
  contexts: string
  cuisines: string
  flags: string
  note: string | null
  flavor_effect: string
  slug: string
  amount: number
  unit: string
}

export interface LoadedSwap {
  option: Omit<SwapOption, 'haveAll'>
  contexts: SubContext[]
  cuisines: string[]
  flags: IngredientFlag[]
}

/** Every swap of at least `minQuality` whose target is one of `targets`, components in order. */
async function loadSwaps(
  db: Db,
  tax: Taxonomy,
  targets: string[],
  minQuality: number,
): Promise<Map<string, LoadedSwap[]>> {
  const byTarget = new Map<string, LoadedSwap[]>()
  if (targets.length === 0) return byTarget
  const { rows } = await db.query<SwapRow>(
    `SELECT s.id, s.target, s.quality, s.per_unit, s.contexts, s.cuisines, s.flags, s.note,
            s.flavor_effect, c.slug, c.amount, c.unit
       FROM substitutions AS s
       JOIN substitution_components AS c ON c.substitution_id = s.id
      WHERE s.target IN (SELECT value FROM json_each(?)) AND s.quality >= ?
      ORDER BY s.target, s.id, c.position`,
    [JSON.stringify(targets), minQuality],
  )
  let last: LoadedSwap | null = null
  for (const row of rows) {
    if (!last || last.option.id !== row.id) {
      last = {
        option: {
          id: row.id,
          target: row.target,
          quality: row.quality,
          perUnit: row.per_unit,
          components: [],
          note: row.note,
          flavorEffect: row.flavor_effect,
        },
        contexts: JSON.parse(row.contexts) as SubContext[],
        cuisines: JSON.parse(row.cuisines) as string[],
        flags: JSON.parse(row.flags) as IngredientFlag[],
      }
      const list = byTarget.get(row.target)
      if (list) list.push(last)
      else byTarget.set(row.target, [last])
    }
    last.option.components.push({
      slug: row.slug,
      name: displayName(tax, row.slug),
      amount: row.amount,
      unit: row.unit,
    })
  }
  return byTarget
}

export interface SwapContext {
  contexts: Set<SubContext>
  cuisine: string | null
  diet: AppDiet
}

/** Swaps loaded for a set of slugs (and the broader slugs above them), ready to filter. */
export interface SwapTable {
  tax: Taxonomy
  byTarget: Map<string, LoadedSwap[]>
}

/** One query for every slug in `slugs`; `minQuality` defaults to MIN_SWAP_QUALITY. */
export async function loadSwapTable(
  db: Db,
  tax: Taxonomy,
  slugs: Iterable<string>,
  minQuality = MIN_SWAP_QUALITY,
): Promise<SwapTable> {
  const targets = new Set<string>()
  for (const slug of slugs) {
    targets.add(slug)
    for (const a of ancestors(tax, slug)) targets.add(a)
  }
  return { tax, byTarget: await loadSwaps(db, tax, [...targets], minQuality) }
}

/**
 * The swaps for `slug` that fit `context` (a swap for a broader slug above it fits too), best
 * first: the ones you have everything for, then quality, then an exact-slug swap over one
 * written for a broader ancestor slug, then (S20, Everything preset only) a swap that keeps the
 * dish's diet character (shares a diet flag with `slug` itself, e.g. a seafood-for-seafood swap)
 * over a diet-changing one — under a diet preset every surviving swap already satisfies that
 * diet, so this step is skipped there — then one written for this cuisine (or 'global'), then
 * fewer components, then id.
 */
export function fittingSwaps(
  table: SwapTable,
  slug: string,
  have: Set<string>,
  context: SwapContext,
): SwapOption[] {
  const banned = forbiddenFlag(context.diet)
  const origFlags = table.tax.flags.get(slug) ?? []
  const preferCharacter = context.diet === 'everything' && origFlags.length > 0
  const options: (SwapOption & { exactMatch: boolean; keepsCharacter: boolean; cuisineFit: boolean })[] = []
  for (const target of [slug, ...ancestors(table.tax, slug)]) {
    for (const swap of table.byTarget.get(target) ?? []) {
      if (!swap.contexts.some((c) => context.contexts.has(c))) continue
      if (banned && swap.flags.includes(banned)) continue
      // A swap back to the slug itself is no swap.
      if (swap.option.components.some((c) => c.slug === slug)) continue
      options.push({
        ...swap.option,
        haveAll: swap.option.components.every((c) => have.has(c.slug)),
        exactMatch: target === slug,
        keepsCharacter: preferCharacter && origFlags.some((f) => swap.flags.includes(f)),
        cuisineFit:
          swap.cuisines.includes('global') ||
          (context.cuisine !== null && swap.cuisines.includes(context.cuisine)),
      })
    }
  }
  options.sort(
    (a, b) =>
      Number(b.haveAll) - Number(a.haveAll) ||
      b.quality - a.quality ||
      Number(b.exactMatch) - Number(a.exactMatch) ||
      Number(b.keepsCharacter) - Number(a.keepsCharacter) ||
      Number(b.cuisineFit) - Number(a.cuisineFit) ||
      a.components.length - b.components.length ||
      a.id.localeCompare(b.id),
  )
  return options.map(({ exactMatch, keepsCharacter, cuisineFit, ...option }) => {
    void exactMatch
    void keepsCharacter
    void cuisineFit
    return option
  })
}

/** "soy sauce + nori" */
export function swapLabel(option: SwapOption): string {
  return option.components.map((c) => c.name).join(' + ')
}
