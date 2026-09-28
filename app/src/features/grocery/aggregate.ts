import type { Purchase, ShopUnit } from '../../corpus/slugs'
import type { Unit } from '../../corpus/types'
import type { UnitSystem, UnitTable } from '../units/units'
import { convertAmount, formatAmount, unitLabel } from '../units/units'

/**
 * Grocery aggregation (brief S7 #2, made shoppable in S7c). Each plan entry is scaled by the
 * caller (`features/scaling/scale.ts`); here the lines are grouped by the slug you actually buy
 * (taxonomy `buy_as`: lemon juice is bought as lemons) and the total is rounded UP to what a shop
 * sells (`shop_unit` + `yield`): "garlic 1 head (need 3 cloves)", "lemons 2 (need 90 ml juice)",
 * "carrot 1 (46 g)", "cilantro 1 bunch (need 2 tbsp)". Pantry bottles/jars/packs needed in small
 * amounts read "check you have some".
 *
 * Nothing is dropped (rule 11):
 * - a line with no canonical ingredient goes to `checkThese` — the only thing that does;
 * - a line with a slug but no usable amount (no quantity, a unit the table does not know, or a
 *   count with its unit missing — see `trustsBareCount`) still puts the item on the list in its
 *   aisle, marked "amount: see recipe" (or "+ more, see recipe" next to the amounts it does have).
 */

const CONTAINER_UNITS: ReadonlySet<Unit> = new Set(['can', 'jar', 'bottle', 'package'])
/** Count units a slug's `each_g` measures (each_g is "one piece"; for garlic, one clove; for
 * celery, one stalk). A "head" or "bunch" of garlic is not 5 g. */
const EACH_UNITS: ReadonlySet<string> = new Set(['piece', 'clove', 'stalk'])
/** Aisles whose bottles, jars and packs are pantry stock: most kitchens have some already. */
const PANTRY_AISLES: ReadonlySet<string> = new Set([
  'pantry',
  'spices',
  'international',
  'beverages',
])
const PANTRY_SHOP_UNITS: ReadonlySet<ShopUnit> = new Set(['bottle', 'jar', 'pack'])
/** Below this share of one bottle/jar/pack, a pantry item reads "check you have some". */
const PANTRY_LARGE_SHARE = 0.5
/** Rounding up forgives a 5% shortfall: 227 g from a 225 g pack is one pack, not two. */
const ROUND_UP_SLACK = 0.05

export const SEE_RECIPE = 'amount: see recipe'
export const CHECK_YOU_HAVE = 'check you have some'

export interface GroceryLineInput {
  /** Canonical ingredient; null when the line could not be resolved to one. */
  slug: string | null
  /** The line as written (or a description), shown verbatim under "Check these". */
  raw: string
  /** Already scaled to the entry's target servings. */
  qty: number | null
  qtyMax: number | null
  unit: Unit | null
  /** Container size ("1 (14 oz) can"); not scaled, see corpusRecipe.ts. */
  pkgQty: number | null
  pkgUnit: Unit | null
  /** The planned recipe the line came from (its title), shown when the list line is tapped. */
  recipe?: string | null
  /** The source never recorded units, so a bare number here is not a piece count (Food.com: see
   * `features/plan/recipeLookup.ts`). */
  unitStripped?: boolean
}

export interface SlugMeta {
  name: string
  aisle: string
  isStaple: boolean
  /** g per ml, when known. */
  density: number | null
  /** grams in one piece, when known. */
  eachG: number | null
  /** Taxonomy purchase fields; null for slugs the taxonomy has none for. */
  purchase?: Purchase | null
}

export interface AggregateContext {
  units: UnitTable
  system: UnitSystem
  metaFor: (slug: string) => SlugMeta
  /** Slugs the kitchen list has ("what I have"); staples count as had regardless. */
  haveSlugs: ReadonlySet<string>
}

export interface AggregatedItem {
  /** The slug bought (the `buy_as` target when there is one). */
  slug: string
  /** As the shopper sees it: plural for more than one piece ("lemons"). */
  name: string
  aisle: string
  /** "1 head (need 3 cloves)", "2 (need 90 ml juice)", "check you have some", "amount: see
   * recipe". */
  amount: string
  /** Assumed on hand: a pantry staple, or already in the kitchen list. Left off the list. */
  have: boolean
  /** Titles of the planned recipes that asked for it, in plan order. */
  sources: string[]
}

export interface CheckThisLine {
  raw: string
  reason: string
}

export interface GroceryBuild {
  items: AggregatedItem[]
  checkThese: CheckThisLine[]
}

/** One line's amount in every form it can be read as: grams, millilitres, and/or a count. */
interface Qty {
  g: number | null
  ml: number | null
  count: number | null
  /** The count's unit; 'piece' for a bare number. */
  countUnit: Unit | null
}

type LineAmount = { ok: true; qty: Qty; unit: Unit | null } | { ok: false; reason: string }

/**
 * Whether a bare number ("1 carrot", unit 'piece' from the parser) is a real count. The parser
 * gives 'piece' to every number with no unit word, so "3 lemon juice" (Food.com's "3 tablespoons
 * lemon juice" with the unit stripped) arrived as 3 pieces and was shown as "2¼" at 0.75x. A
 * count is only believed for something you count: it has a weight per piece, it is bought by the
 * piece, or its yield is counted (garlic cloves, eggs, bay leaves). "Juice of 2 lemons" is also
 * a count (of the lemons) — except from a source that stripped its units, where "3 lemon juice"
 * is not three lemons' worth.
 */
function trustsBareCount(meta: SlugMeta, unitStripped: boolean, units: UnitTable): boolean {
  if (meta.eachG !== null) return true
  const p = meta.purchase
  if (!p) return !unitStripped
  if (p.buyAs && unitStripped) return false
  if (p.shopUnit === 'piece') return true
  const yieldUnit = p.yield ? units.get(p.yield.unit) : undefined
  return !!yieldUnit && yieldUnit.dimension === 'count'
}

function lineAmount(line: GroceryLineInput, meta: SlugMeta, units: UnitTable): LineAmount {
  if (line.qty === null) return { ok: false, reason: 'no quantity given' }
  const q = line.qty
  const unit = line.unit ?? 'piece'

  if (unit === 'piece') {
    if (!trustsBareCount(meta, !!line.unitStripped, units)) {
      return { ok: false, reason: 'the recipe gives no unit' }
    }
    return {
      ok: true,
      unit: 'piece',
      qty: {
        g: meta.eachG !== null ? q * meta.eachG : null,
        ml: null,
        count: q,
        countUnit: 'piece',
      },
    }
  }

  const info = units.get(unit)
  if (!info) return { ok: false, reason: `unit "${unit}" is not recognised` }

  if (info.dimension === 'mass') {
    if (info.toBase === null) return { ok: false, reason: `unit "${unit}" has no size` }
    const g = q * info.toBase
    return {
      ok: true,
      unit,
      qty: { g, ml: meta.density ? g / meta.density : null, count: null, countUnit: null },
    }
  }

  if (info.dimension === 'volume') {
    if (info.toBase === null) return { ok: false, reason: `unit "${unit}" has no size` }
    const ml = q * info.toBase
    return {
      ok: true,
      unit,
      qty: { g: meta.density ? ml * meta.density : null, ml, count: null, countUnit: null },
    }
  }

  // count dimension: a container with its size ("1 (400 g) can") also knows its weight.
  const out: Qty = { g: null, ml: null, count: q, countUnit: unit }
  if (CONTAINER_UNITS.has(unit) && line.pkgQty !== null && line.pkgUnit) {
    const pkg = units.get(line.pkgUnit)
    if (pkg?.toBase != null && pkg.dimension === 'mass') {
      out.g = q * line.pkgQty * pkg.toBase
      if (meta.density) out.ml = out.g / meta.density
    } else if (pkg?.toBase != null && pkg.dimension === 'volume') {
      out.ml = q * line.pkgQty * pkg.toBase
      if (meta.density) out.g = out.ml * meta.density
    }
  } else if (EACH_UNITS.has(unit) && meta.eachG !== null) {
    out.g = q * meta.eachG
  }
  return { ok: true, unit, qty: out }
}

/** `qty` expressed in `unit` (g, a volume unit, or a count unit), or null when it cannot be. */
function amountIn(qty: Qty, unit: Unit, meta: SlugMeta, units: UnitTable): number | null {
  const info = units.get(unit)
  if (!info) return null
  if (info.dimension === 'mass') return qty.g !== null && info.toBase ? qty.g / info.toBase : null
  if (info.dimension === 'volume') {
    const ml = qty.ml ?? (qty.g !== null && meta.density ? qty.g / meta.density : null)
    return ml !== null && info.toBase ? ml / info.toBase : null
  }
  if (qty.count !== null && (qty.countUnit === unit || qty.countUnit === 'piece')) return qty.count
  if (qty.g !== null && meta.eachG !== null && EACH_UNITS.has(unit)) return qty.g / meta.eachG
  return null
}

function sameShopUnit(countUnit: Unit | null, shop: ShopUnit): boolean {
  if (!countUnit) return false
  if (countUnit === shop) return true
  return shop === 'pack' && countUnit === 'package'
}

/** How many shop units of the bought slug one line needs, or null when it cannot be worked out. */
function shopUnitsFor(
  qty: Qty,
  src: SlugMeta,
  srcIsBought: boolean,
  shop: ShopUnit,
  bought: SlugMeta,
  units: UnitTable,
): number | null {
  // "1 head garlic", "2 cans tomatoes", "1 package cream cheese": already in shop units.
  // "2 carrots" when carrots are bought by the piece, too.
  if (srcIsBought && sameShopUnit(qty.countUnit, shop)) return qty.count
  // "juice of 2 lemons": a bare count of a bought-as slug is a count of what is bought.
  if (!srcIsBought && shop === 'piece' && qty.countUnit === 'piece') return qty.count
  if (shop === 'g') return qty.g
  if (shop === 'ml') return qty.ml ?? (qty.g !== null && src.density ? qty.g / src.density : null)
  const y = src.purchase?.yield ?? null
  if (y) {
    const n = amountIn(qty, y.unit, src, units)
    return n === null ? null : n / y.qty
  }
  if (shop === 'piece' && qty.g !== null && bought.eachG !== null) return qty.g / bought.eachG
  return null
}

function roundUp(n: number): number {
  return Math.max(1, Math.ceil(n - ROUND_UP_SLACK))
}

/** Grams to buy by weight, rounded up to a step a counter would weigh out. */
function roundUpGrams(g: number): number {
  const step = g <= 100 ? 10 : g <= 1000 ? 50 : 100
  return Math.ceil(g / step - 1e-9) * step
}

function formatGrams(grams: number, system: UnitSystem, units: UnitTable): string {
  return formatAmount(convertAmount({ qty: grams, qtyMax: null, unit: 'g' }, system, units, null))
}

function formatMl(ml: number, system: UnitSystem, units: UnitTable): string {
  return formatAmount(convertAmount({ qty: ml, qtyMax: null, unit: 'ml' }, system, units, null))
}

const SHOP_LABELS: Record<Exclude<ShopUnit, 'piece' | 'g' | 'ml'>, [string, string]> = {
  bunch: ['bunch', 'bunches'],
  head: ['head', 'heads'],
  can: ['can', 'cans'],
  bottle: ['bottle', 'bottles'],
  jar: ['jar', 'jars'],
  pack: ['pack', 'packs'],
}

/** A plain English plural for a shopping-list name ("lemon" -> "lemons", "tomato" ->
 * "tomatoes"); names already ending in s are left alone. */
export function pluralName(name: string): string {
  if (/s$/.test(name)) return name
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`
  if (/(sh|ch|x|z|[^aeiou]o)$/.test(name)) return `${name}es`
  return `${name}s`
}

/** Near enough to a whole number to be shown as a count ("2 eggs", not "100 g"). */
function isWhole(n: number): boolean {
  return Math.abs(n - Math.round(n)) < ROUND_UP_SLACK
}

/**
 * What one source slug's lines add up to, for the "(need ...)" note: "3 cloves", "90 ml",
 * "2 tbsp", "46 g" (¾ of a carrot reads better as a weight), "2" (whole pieces stay counts).
 * Lines that disagree on a dimension are joined with " + " rather than dropped.
 */
function needText(
  entries: { unit: Unit | null; qty: Qty }[],
  meta: SlugMeta,
  ctx: AggregateContext,
): { text: string; bareCount: number | null } {
  // Every line in the same volume/mass unit: say it in that unit ("2 tbsp"), converted only as
  // the unit system asks (cups become ml/g in metric).
  const first = entries[0].unit
  const firstInfo = first ? ctx.units.get(first) : undefined
  if (
    first &&
    firstInfo?.toBase &&
    firstInfo.dimension !== 'count' &&
    entries.every((e) => e.unit === first)
  ) {
    const base = entries.reduce(
      (sum, e) => sum + ((firstInfo.dimension === 'mass' ? e.qty.g : e.qty.ml) ?? 0),
      0,
    )
    const amount = convertAmount(
      { qty: base / firstInfo.toBase, qtyMax: null, unit: first },
      ctx.system,
      ctx.units,
      meta.density,
    )
    return { text: formatAmount(amount), bareCount: null }
  }

  let g = 0
  let ml = 0
  let hasG = false
  let hasMl = false
  let pieces = 0
  let piecesG = 0
  let piecesAllWeighed = true
  let hasPieces = false
  const counts = new Map<string, number>()
  const addCount = (unit: string, n: number) => counts.set(unit, (counts.get(unit) ?? 0) + n)
  for (const { unit, qty } of entries) {
    const info = unit ? ctx.units.get(unit) : undefined
    if (info?.dimension === 'mass') {
      g += qty.g ?? 0
      hasG = true
    } else if (info?.dimension === 'volume') {
      ml += qty.ml ?? 0
      hasMl = true
    } else if (!unit || unit === 'piece') {
      hasPieces = true
      pieces += qty.count ?? 0
      if (qty.g !== null) piecesG += qty.g
      else piecesAllWeighed = false
    } else if (CONTAINER_UNITS.has(unit) && qty.g !== null) {
      g += qty.g
      hasG = true
    } else if (CONTAINER_UNITS.has(unit) && qty.ml !== null) {
      ml += qty.ml
      hasMl = true
    } else {
      // cloves, stalks, sprigs, bunches, unsized cans: kept as counted ("3 cloves")
      addCount(unit, qty.count ?? 0)
    }
  }
  let bareCount: number | null = null
  if (hasPieces) {
    // weighed pieces join a weight total ("1 onion" + "200 g onion" = 350 g); ¾ of a carrot
    // reads better as 46 g; whole pieces on their own stay a count ("2 eggs")
    if (piecesAllWeighed && (hasG || !isWhole(pieces))) {
      g += piecesG
      hasG = true
    } else {
      bareCount = Math.max(1, Math.ceil(pieces - ROUND_UP_SLACK))
    }
  }
  // Volume and weight of the same thing: one total, by weight, when the density is known.
  if (hasG && hasMl && meta.density) {
    g += ml * meta.density
    hasMl = false
  }
  const parts: string[] = []
  if (hasG) parts.push(formatGrams(g, ctx.system, ctx.units))
  if (hasMl) parts.push(formatMl(ml, ctx.system, ctx.units))
  for (const [unit, n] of counts) {
    const whole = Math.max(1, Math.ceil(n - ROUND_UP_SLACK))
    parts.push(`${whole} ${unitLabel(unit, whole !== 1)}`)
  }
  if (parts.length > 0) {
    if (bareCount !== null) parts.unshift(String(bareCount))
    return { text: parts.join(' + '), bareCount: null }
  }
  return { text: bareCount === null ? '' : String(bareCount), bareCount }
}

/**
 * How a source slug bought as something else is named in the "(need ...)" note: "lemon juice"
 * bought as lemons is "juice" ("need 90 ml juice"); a bare count of it is "juice of 2" when its
 * yield is not counted, and "2 yolks" when it is (egg yolks from a pack of eggs).
 */
function describeNeed(
  text: string,
  bareCount: number | null,
  src: SlugMeta,
  bought: SlugMeta,
  units: UnitTable,
): string {
  const prefix = `${bought.name} `
  const label = src.name.startsWith(prefix) ? src.name.slice(prefix.length) : src.name
  if (bareCount === null) return `${text} ${label}`
  const yieldUnit = src.purchase?.yield ? units.get(src.purchase.yield.unit) : undefined
  if (yieldUnit && yieldUnit.dimension !== 'count') return `${label} of ${bareCount}`
  return `${bareCount} ${bareCount === 1 ? label : pluralName(label)}`
}

export function aggregateGroceryLines(
  lines: GroceryLineInput[],
  ctx: AggregateContext,
): GroceryBuild {
  const checkThese: CheckThisLine[] = []
  const byBought = new Map<string, GroceryLineInput[]>()

  for (const line of lines) {
    if (!line.slug) {
      checkThese.push({ raw: line.raw, reason: 'no canonical ingredient matched' })
      continue
    }
    const bought = ctx.metaFor(line.slug).purchase?.buyAs ?? line.slug
    const group = byBought.get(bought)
    if (group) group.push(line)
    else byBought.set(bought, [line])
  }

  const items: AggregatedItem[] = []
  for (const [slug, groupLines] of byBought) {
    items.push(aggregateOne(slug, groupLines, ctx))
  }
  items.sort((a, b) => a.name.localeCompare(b.name))
  return { items, checkThese }
}

function aggregateOne(
  slug: string,
  groupLines: GroceryLineInput[],
  ctx: AggregateContext,
): AggregatedItem {
  const bought = ctx.metaFor(slug)
  const shop = bought.purchase?.shopUnit ?? null

  const sources: string[] = []
  const srcSlugs = new Set<string>()
  // per source slug, in first-seen order: the amounts it adds up to
  const needs = new Map<string, { unit: Unit | null; qty: Qty }[]>()
  let unknown = false
  let shopTotal = 0
  let unconvertible = false

  for (const line of groupLines) {
    const srcSlug = line.slug!
    srcSlugs.add(srcSlug)
    if (line.recipe && !sources.includes(line.recipe)) sources.push(line.recipe)
    const src = srcSlug === slug ? bought : ctx.metaFor(srcSlug)
    const amount = lineAmount(line, src, ctx.units)
    if (!amount.ok) {
      unknown = true
      continue
    }
    const list = needs.get(srcSlug)
    if (list) list.push({ unit: amount.unit, qty: amount.qty })
    else needs.set(srcSlug, [{ unit: amount.unit, qty: amount.qty }])
    if (shop) {
      const n = shopUnitsFor(amount.qty, src, srcSlug === slug, shop, bought, ctx.units)
      if (n === null) unconvertible = true
      else shopTotal += n
    }
  }

  const needParts: string[] = []
  for (const [srcSlug, entries] of needs) {
    const src = srcSlug === slug ? bought : ctx.metaFor(srcSlug)
    const { text, bareCount } = needText(entries, src, ctx)
    if (!text) continue
    needParts.push(srcSlug === slug ? text : describeNeed(text, bareCount, src, bought, ctx.units))
  }
  const need = needParts.join(' + ')
  const known = needs.size > 0

  const have =
    bought.isStaple || ctx.haveSlugs.has(slug) || [...srcSlugs].every((s) => ctx.haveSlugs.has(s))

  let name = bought.name
  let amount: string
  const more = unknown ? ' + more, see recipe' : ''

  if (!shop) {
    // No purchase fields for this slug: the plain total, as the recipes add up.
    amount = known ? `${need}${more}` : SEE_RECIPE
  } else if (!known) {
    amount =
      PANTRY_SHOP_UNITS.has(shop) && PANTRY_AISLES.has(bought.aisle) ? CHECK_YOU_HAVE : SEE_RECIPE
  } else if (
    PANTRY_SHOP_UNITS.has(shop) &&
    PANTRY_AISLES.has(bought.aisle) &&
    shopTotal < PANTRY_LARGE_SHARE
  ) {
    amount = `${CHECK_YOU_HAVE} (need ${need}${more})`
  } else if (shop === 'g' || shop === 'ml') {
    // bought by weight or volume: the total, rounded up to what a counter measures out
    const total = roundUpGrams(shopTotal)
    const main =
      shop === 'g'
        ? formatGrams(total, ctx.system, ctx.units)
        : formatMl(total, ctx.system, ctx.units)
    const note = unconvertible ? ` (need ${need})` : ''
    amount = shopTotal > 0 ? `${main}${note}${more}` : `${need}${more}`
  } else {
    const count = roundUp(shopTotal)
    if (shop === 'piece') {
      if (count !== 1) name = pluralName(name)
      // "carrot 1 (46 g)": the weight of the thing itself needs no "need"
      const plain = srcSlugs.size === 1 && srcSlugs.has(slug)
      if (plain && need === String(count) && !more) amount = String(count)
      else amount = `${count} (${plain ? '' : 'need '}${need}${more})`
    } else {
      const [one, many] = SHOP_LABELS[shop]
      amount = `${count} ${count === 1 ? one : many} (need ${need}${more})`
    }
  }

  return { slug, name, aisle: bought.aisle, amount, have, sources }
}

/** Groups aggregated items by aisle, aisles sorted alphabetically, items within by name. */
export function groupItemsByAisle(items: AggregatedItem[]): [string, AggregatedItem[]][] {
  const groups = new Map<string, AggregatedItem[]>()
  for (const item of items) {
    const group = groups.get(item.aisle)
    if (group) group.push(item)
    else groups.set(item.aisle, [item])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}
