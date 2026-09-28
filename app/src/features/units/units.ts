import type { Db } from '../../db/types'
import type { Unit, UnitDimension } from '../../corpus/types'

/**
 * Metric / US conversion (S6; ruling "metric by default, a toggle per recipe"), driven by
 * corpus.db's `units` table (ml per unit for volume, g per unit for mass) and each ingredient's
 * `density_g_per_ml`.
 *
 * Metric: mass goes to g (kg from 1,000 g). Cups, fl oz, pints, quarts and gallons go to g when
 * the ingredient's density is known (a cup of flour is weighed in a metric kitchen), else to ml
 * (l from 1,000 ml). Teaspoons and tablespoons stay: both systems use them.
 * US: g and kg go to oz (lb from 16 oz); ml and l go to tsp, tbsp or cups by size. US units stay.
 * Count units (clove, can, piece, ...) never change.
 */

export type UnitSystem = 'metric' | 'us'

export interface UnitInfo {
  dimension: UnitDimension
  /** ml per unit (volume) or g per unit (mass); null for count units. */
  toBase: number | null
}

export type UnitTable = Map<string, UnitInfo>

export interface Amount {
  qty: number
  /** The high end of a range ("2-3 cloves"), else null. */
  qtyMax: number | null
  unit: string | null
}

const cache = new WeakMap<Db, Promise<UnitTable>>()

export function loadUnits(db: Db): Promise<UnitTable> {
  let loaded = cache.get(db)
  if (!loaded) {
    loaded = db
      .query<{
        unit: Unit
        dimension: UnitDimension
        to_base: number | null
      }>('SELECT unit, dimension, to_base FROM units')
      .then(
        ({ rows }) =>
          new Map(rows.map((r) => [r.unit, { dimension: r.dimension, toBase: r.to_base }])),
      )
    cache.set(db, loaded)
  }
  return loaded
}

/** Volume units a metric cook would rather weigh or pour in ml. tsp and tbsp are kept. */
const US_VOLUME = new Set(['cup', 'fl_oz', 'pint', 'quart', 'gallon'])
const METRIC_VOLUME = new Set(['ml', 'l'])
const METRIC_MASS = new Set(['g', 'kg', 'mg'])

function scaleAmount(amount: Amount, factor: number, unit: string): Amount {
  return {
    qty: amount.qty * factor,
    qtyMax: amount.qtyMax === null ? null : amount.qtyMax * factor,
    unit,
  }
}

/** g from 1,000 becomes kg; ml from 1,000 becomes l. */
function metricBig(amount: Amount): Amount {
  if (amount.qty < 1000) return amount
  return scaleAmount(amount, 1 / 1000, amount.unit === 'g' ? 'kg' : 'l')
}

export function convertAmount(
  amount: Amount,
  system: UnitSystem,
  units: UnitTable,
  densityGPerMl: number | null,
): Amount {
  const unit = amount.unit
  if (!unit) return amount
  const info = units.get(unit)
  if (!info || info.toBase === null || info.dimension === 'count') return amount
  const base = info.toBase

  if (system === 'metric') {
    if (info.dimension === 'mass') {
      if (METRIC_MASS.has(unit)) return amount
      return metricBig(scaleAmount(amount, base, 'g'))
    }
    if (!US_VOLUME.has(unit)) return amount
    if (densityGPerMl) return metricBig(scaleAmount(amount, base * densityGPerMl, 'g'))
    return metricBig(scaleAmount(amount, base, 'ml'))
  }

  // US
  if (info.dimension === 'mass') {
    if (!METRIC_MASS.has(unit)) return amount
    const ounces = scaleAmount(amount, base / units.get('oz')!.toBase!, 'oz')
    return ounces.qty >= 16 ? scaleAmount(ounces, 1 / 16, 'lb') : ounces
  }
  if (!METRIC_VOLUME.has(unit)) return amount
  const ml = amount.qty * base
  for (const target of ['cup', 'tbsp', 'tsp'] as const) {
    const size = units.get(target)!.toBase!
    // A quarter cup and up reads as cups; a tablespoon and up as tablespoons.
    const threshold = target === 'cup' ? size / 4 : target === 'tbsp' ? size : 0
    if (ml >= threshold) return scaleAmount(amount, base / size, target)
  }
  return amount
}

const FRACTIONS: [number, string][] = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
  [1, ''],
]

const COARSE = new Set([0, 1 / 4, 1 / 2, 3 / 4, 1])

/**
 * 1.5 -> "1½", 0.33 -> "⅓", 2 -> "2". Values from 10 up are whole numbers. `coarse` rounds to
 * quarters (ounces and pounds are not weighed in eighths).
 */
export function formatFraction(value: number, coarse = false): string {
  if (value >= 10) return String(Math.round(value))
  let whole = Math.floor(value)
  const rest = value - whole
  let best = FRACTIONS[0]
  for (const f of FRACTIONS) {
    if (coarse && !COARSE.has(f[0])) continue
    if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f
  }
  if (best[0] === 1) whole += 1
  if (whole === 0 && best[1] === '') return value > 0 ? '⅛' : '0'
  return `${whole === 0 ? '' : whole}${best[1]}`
}

/** Metric numbers: one decimal under 10, whole numbers under 1,000, two decimals for kg and l. */
function formatMetric(value: number, unit: string): string {
  if (unit === 'kg' || unit === 'l') return String(Math.round(value * 100) / 100)
  if (value < 10) return String(Math.round(value * 10) / 10)
  return String(Math.round(value))
}

const UNIT_LABELS: Record<string, [string, string]> = {
  fl_oz: ['fl oz', 'fl oz'],
  cup: ['cup', 'cups'],
  pint: ['pint', 'pints'],
  quart: ['quart', 'quarts'],
  gallon: ['gallon', 'gallons'],
  piece: ['', ''],
}

/** Abbreviations that take no plural. */
const INVARIANT = new Set(['g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'oz', 'lb'])
const IRREGULAR: Record<string, string> = {
  pinch: 'pinches',
  dash: 'dashes',
  splash: 'splashes',
  bunch: 'bunches',
  leaf: 'leaves',
  loaf: 'loaves',
  inch: 'inches',
}

export function unitLabel(unit: string, plural: boolean): string {
  const label = UNIT_LABELS[unit]
  if (label) return plural ? label[1] : label[0]
  if (!plural || INVARIANT.has(unit)) return unit
  return IRREGULAR[unit] ?? `${unit}s`
}

const METRIC_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'l'])

/** "125 g", "1½ cups", "2-3 cloves"; the unit is left off for plain pieces. */
export function formatAmount(amount: Amount): string {
  const unit = amount.unit
  const fmt = (v: number) =>
    unit && METRIC_UNITS.has(unit)
      ? formatMetric(v, unit)
      : formatFraction(v, unit === 'oz' || unit === 'lb')
  const isRange = amount.qtyMax !== null && amount.qtyMax !== amount.qty
  const qty = isRange ? `${fmt(amount.qty)}-${fmt(amount.qtyMax!)}` : fmt(amount.qty)
  if (!unit) return qty
  // Plural by what is shown: "1 cup" for 1.06 cups, "½ cup", "1½ cups".
  const plural = isRange || !(qty === '1' || /^[⅛¼⅓⅜½⅝⅔¾⅞]$/.test(qty))
  const label = unitLabel(unit, plural)
  return label ? `${qty} ${label}` : qty
}
