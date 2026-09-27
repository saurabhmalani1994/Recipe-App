import { getUserDb } from '../../db'
import { ingredientAisle, ingredientName } from '../../corpus/slugs'

export interface KitchenItem {
  ingredientId: string
  name: string
  aisle: string
}

function toKitchenItem(ingredientId: string): KitchenItem {
  return {
    ingredientId,
    name: ingredientName(ingredientId),
    aisle: ingredientAisle(ingredientId),
  }
}

/** Every ingredient the user has ("what I have"), including pre-seeded pantry staples. */
export async function listKitchenItems(): Promise<KitchenItem[]> {
  const db = await getUserDb()
  const result = await db.query<{ ingredient_id: string }>(
    'SELECT ingredient_id FROM kitchen_items',
  )
  return result.rows
    .map((row) => toKitchenItem(row.ingredient_id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function isInKitchen(slug: string): Promise<boolean> {
  const db = await getUserDb()
  const result = await db.query<{ ingredient_id: string }>(
    'SELECT ingredient_id FROM kitchen_items WHERE ingredient_id = ?',
    [slug],
  )
  return result.rows.length > 0
}

export async function addKitchenItem(slug: string): Promise<void> {
  const db = await getUserDb()
  await db.run('INSERT OR IGNORE INTO kitchen_items (ingredient_id) VALUES (?)', [slug])
}

export async function removeKitchenItem(slug: string): Promise<void> {
  const db = await getUserDb()
  await db.run('DELETE FROM kitchen_items WHERE ingredient_id = ?', [slug])
}

/** Groups kitchen items by aisle, aisles sorted alphabetically, items within an aisle by name. */
export function groupByAisle(items: KitchenItem[]): [string, KitchenItem[]][] {
  const groups = new Map<string, KitchenItem[]>()
  for (const item of items) {
    const group = groups.get(item.aisle)
    if (group) group.push(item)
    else groups.set(item.aisle, [item])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}
