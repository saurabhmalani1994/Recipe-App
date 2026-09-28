import type { Unit } from '../../corpus/types'
import type { UnitSystem, UnitTable } from '../units/units'
import { convertAmount, formatAmount, unitLabel } from '../units/units'

/**
 * Grocery aggregation (brief S7 #2): scale each plan entry (D11, done by the caller with
 * `features/scaling/scale.ts` before lines reach here), aggregate by canonical slug, convert to
 * one unit per slug using the corpus `units` table and each ingredient's density, and keep
 * packages in counts ("2 x 400 g cans"). A line that cannot be resolved — no slug, no quantity,
 * an unrecognised unit, or one that will not reconcile with the rest of its slug's lines — is
 * never dropped (rule 11): it goes to `checkThese` with its raw text and a reason.
 */

const CONTAINER_UNITS: ReadonlySet<Unit> = new Set(['can', 'jar', 'bottle', 'package'])

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
}

export interface SlugMeta {
  name: string
  aisle: string
  isStaple: boolean
  /** g per ml, when known. */
  density: number | null
  /** grams in one piece, when known. */
  eachG: number | null
}

export interface AggregateContext {
  units: UnitTable
  system: UnitSystem
  metaFor: (slug: string) => SlugMeta
  /** Slugs the kitchen list has ("what I have"); staples count as had regardless. */
  haveSlugs: ReadonlySet<string>
}

export interface AggregatedItem {
  slug: string
  name: string
  aisle: string
  /** Formatted amount, e.g. "800 g", "2 x 400 g cans", "3 cloves". Null when nothing but a
   * bare count with no unit at all ("2 onion" already becomes grams via each_g when known). */
  amount: string
  /** Assumed on hand: a pantry staple, or already in the kitchen list. Shown collapsed. */
  have: boolean
}

export interface CheckThisLine {
  raw: string
  reason: string
}

export interface GroceryBuild {
  items: AggregatedItem[]
  checkThese: CheckThisLine[]
}

type Resolved =
  | { kind: 'grams'; grams: number; container: Container | null }
  | { kind: 'ml'; ml: number; container: Container | null }
  | { kind: 'count'; count: number; unit: Unit | null; container: Container | null }
  | { kind: 'failed'; reason: string }

interface Container {
  unit: Unit
  pkgQty: number
  pkgUnit: Unit
}

function resolveLine(line: GroceryLineInput, meta: SlugMeta, units: UnitTable): Resolved {
  if (line.qty === null) return { kind: 'failed', reason: 'no quantity given' }

  if (!line.unit) {
    if (meta.eachG !== null) return { kind: 'grams', grams: line.qty * meta.eachG, container: null }
    return { kind: 'count', count: line.qty, unit: null, container: null }
  }

  const info = units.get(line.unit)
  if (!info) return { kind: 'failed', reason: `unit "${line.unit}" is not recognised` }

  if (info.dimension === 'mass') {
    if (info.toBase === null) return { kind: 'failed', reason: `unit "${line.unit}" has no size` }
    return { kind: 'grams', grams: line.qty * info.toBase, container: null }
  }

  if (info.dimension === 'volume') {
    if (info.toBase === null) return { kind: 'failed', reason: `unit "${line.unit}" has no size` }
    const ml = line.qty * info.toBase
    if (meta.density !== null) return { kind: 'grams', grams: ml * meta.density, container: null }
    return { kind: 'ml', ml, container: null }
  }

  // count dimension
  if (CONTAINER_UNITS.has(line.unit) && line.pkgQty !== null && line.pkgUnit) {
    const pkgInfo = units.get(line.pkgUnit)
    const container: Container = { unit: line.unit, pkgQty: line.pkgQty, pkgUnit: line.pkgUnit }
    if (pkgInfo && pkgInfo.toBase !== null && pkgInfo.dimension === 'mass') {
      return { kind: 'grams', grams: line.qty * line.pkgQty * pkgInfo.toBase, container }
    }
    if (pkgInfo && pkgInfo.toBase !== null && pkgInfo.dimension === 'volume') {
      const ml = line.qty * line.pkgQty * pkgInfo.toBase
      if (meta.density !== null) return { kind: 'grams', grams: ml * meta.density, container }
      return { kind: 'ml', ml, container }
    }
    return { kind: 'count', count: line.qty, unit: line.unit, container }
  }

  if (meta.eachG !== null) return { kind: 'grams', grams: line.qty * meta.eachG, container: null }
  return { kind: 'count', count: line.qty, unit: line.unit, container: null }
}

/** True when every resolved line for a slug is the same container, so the total can stay in
 * package counts ("2 x 400 g cans") instead of collapsing into a converted total. */
function uniformContainer(resolved: Resolved[]): Container | null {
  const first = resolved[0]
  if (first.kind === 'failed' || !first.container) return null
  const c = first.container
  const allSame = resolved.every(
    (r) =>
      r.kind !== 'failed' &&
      r.container &&
      r.container.unit === c.unit &&
      r.container.pkgQty === c.pkgQty &&
      r.container.pkgUnit === c.pkgUnit,
  )
  return allSame ? c : null
}

function formatGrams(grams: number, ctx: AggregateContext): string {
  return formatAmount(convertAmount({ qty: grams, qtyMax: null, unit: 'g' }, ctx.system, ctx.units, null))
}

function formatMl(ml: number, ctx: AggregateContext): string {
  return formatAmount(convertAmount({ qty: ml, qtyMax: null, unit: 'ml' }, ctx.system, ctx.units, null))
}

export function aggregateGroceryLines(
  lines: GroceryLineInput[],
  ctx: AggregateContext,
): GroceryBuild {
  const checkThese: CheckThisLine[] = []
  const bySlug = new Map<string, GroceryLineInput[]>()

  for (const line of lines) {
    if (!line.slug) {
      checkThese.push({ raw: line.raw, reason: 'no canonical ingredient matched' })
      continue
    }
    const group = bySlug.get(line.slug)
    if (group) group.push(line)
    else bySlug.set(line.slug, [line])
  }

  const items: AggregatedItem[] = []

  for (const [slug, groupLines] of bySlug) {
    const meta = ctx.metaFor(slug)
    const resolved = groupLines.map((line) => resolveLine(line, meta, ctx.units))

    const ok: { line: GroceryLineInput; r: Resolved }[] = []
    resolved.forEach((r, i) => {
      if (r.kind === 'failed') checkThese.push({ raw: groupLines[i].raw, reason: r.reason })
      else ok.push({ line: groupLines[i], r })
    })
    if (ok.length === 0) continue

    // A group's lines must agree on a dimension to be summed together; anything that disagrees
    // with the first ok line is set aside under "Check these" rather than silently merged.
    const kind = ok[0].r.kind
    const agreeing = ok.filter((o) => o.r.kind === kind)
    const disagreeing = ok.filter((o) => o.r.kind !== kind)
    for (const o of disagreeing) {
      checkThese.push({
        raw: o.line.raw,
        reason: `does not match the other lines' unit for ${meta.name}`,
      })
    }

    const have = meta.isStaple || ctx.haveSlugs.has(slug)
    const container = uniformContainer(agreeing.map((o) => o.r))
    const amount = formatGroupAmount(agreeing, container, ctx)

    items.push({ slug, name: meta.name, aisle: meta.aisle, amount, have })
  }

  items.sort((a, b) => a.name.localeCompare(b.name))
  return { items, checkThese }
}

function formatGroupAmount(
  agreeing: { line: GroceryLineInput; r: Resolved }[],
  container: Container | null,
  ctx: AggregateContext,
): string {
  if (container) {
    const count = agreeing.reduce((sum, o) => {
      const r = o.r
      if (r.kind === 'grams' || r.kind === 'ml') {
        // grams/ml still carry the original line qty via count fallback path only; container
        // lines resolved as grams/ml store the raw line qty separately, recomputed here.
        return sum + o.line.qty!
      }
      if (r.kind === 'count') return sum + r.count
      return sum
    }, 0)
    const pkg = formatAmount({ qty: container.pkgQty, qtyMax: null, unit: container.pkgUnit })
    return `${count} x ${pkg} ${unitLabel(container.unit, count !== 1)}`
  }

  const kind = agreeing[0].r.kind
  if (kind === 'grams') {
    const total = agreeing.reduce((sum, o) => sum + (o.r as { grams: number }).grams, 0)
    return formatGrams(total, ctx)
  }
  if (kind === 'ml') {
    const total = agreeing.reduce((sum, o) => sum + (o.r as { ml: number }).ml, 0)
    return formatMl(total, ctx)
  }
  // count
  const total = agreeing.reduce((sum, o) => sum + (o.r as { count: number }).count, 0)
  const unit = (agreeing[0].r as { unit: Unit | null }).unit
  const qtyText = formatAmount({ qty: total, qtyMax: null, unit: null })
  if (!unit) return qtyText
  return `${qtyText} ${unitLabel(unit, total !== 1)}`
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
