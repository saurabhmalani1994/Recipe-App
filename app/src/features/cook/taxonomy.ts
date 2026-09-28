import type { Db } from '../../db/types'

/**
 * The slice of `corpus.db`'s `ingredients` table the engine, the recipe view and unit conversion
 * need, loaded once per connection (1,553 rows on the fixture, a few thousand on the real corpus).
 */
export interface Taxonomy {
  names: Map<string, string>
  parent: Map<string, string>
  children: Map<string, string[]>
  staples: Set<string>
  /** g per ml, falling back to the parent's when a variety has none. */
  density: Map<string, number>
  /** grams in one piece. */
  eachG: Map<string, number>
}

interface IngredientRow {
  slug: string
  name: string
  parent: string | null
  is_staple: number
  density_g_per_ml: number | null
  each_g: number | null
}

const cache = new WeakMap<Db, Promise<Taxonomy>>()

export function loadTaxonomy(db: Db): Promise<Taxonomy> {
  let loaded = cache.get(db)
  if (!loaded) {
    loaded = readTaxonomy(db)
    cache.set(db, loaded)
  }
  return loaded
}

async function readTaxonomy(db: Db): Promise<Taxonomy> {
  const { rows } = await db.query<IngredientRow>(
    'SELECT slug, name, parent, is_staple, density_g_per_ml, each_g FROM ingredients',
  )
  const tax: Taxonomy = {
    names: new Map(),
    parent: new Map(),
    children: new Map(),
    staples: new Set(),
    density: new Map(),
    eachG: new Map(),
  }
  for (const row of rows) {
    tax.names.set(row.slug, row.name)
    if (row.parent) {
      tax.parent.set(row.slug, row.parent)
      const siblings = tax.children.get(row.parent)
      if (siblings) siblings.push(row.slug)
      else tax.children.set(row.parent, [row.slug])
    }
    if (row.is_staple) tax.staples.add(row.slug)
    if (row.density_g_per_ml) tax.density.set(row.slug, row.density_g_per_ml)
    if (row.each_g) tax.eachG.set(row.slug, row.each_g)
  }
  for (const row of rows) {
    if (tax.density.has(row.slug)) continue
    const inherited = ancestors(tax, row.slug).find((a) => tax.density.has(a))
    if (inherited) tax.density.set(row.slug, tax.density.get(inherited)!)
  }
  return tax
}

/** Parent, grandparent, ... of `slug` (cycle-safe). */
export function ancestors(tax: Taxonomy, slug: string): string[] {
  const out: string[] = []
  const seen = new Set([slug])
  let current = tax.parent.get(slug)
  while (current && !seen.has(current)) {
    out.push(current)
    seen.add(current)
    current = tax.parent.get(current)
  }
  return out
}

export function displayName(tax: Taxonomy, slug: string): string {
  return tax.names.get(slug) ?? slug.replace(/_/g, ' ')
}

/**
 * What the cook can be shown to have: the given slugs, every staple (`is_staple`: always assumed),
 * and for each slug its ancestors plus its direct children. A variety is an instance of every
 * broader slug above it (roma_tomato covers tomatoes, and bacon_bits covers bacon), and the
 * broader slug covers its own varieties one level down (tomatoes covers roma_tomato). It does not
 * reach further down, so "fish" does not cover "salt_cod", and siblings never cover each other.
 */
export function expandHave(tax: Taxonomy, have: Iterable<string>): Set<string> {
  const out = new Set<string>(tax.staples)
  for (const slug of have) {
    out.add(slug)
    for (const a of ancestors(tax, slug)) out.add(a)
    for (const child of tax.children.get(slug) ?? []) out.add(child)
  }
  return out
}
