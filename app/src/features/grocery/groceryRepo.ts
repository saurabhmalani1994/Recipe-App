import { getUserDb, type SqlParam } from '../../db'
import { addKitchenItem } from '../kitchen/kitchenRepo'
import { newId } from '../myRecipes/id'
import type { AggregatedItem, CheckThisLine } from './aggregate'

/**
 * Grocery list persistence (brief S7 #3): `grocery_lists` holds one "current" build at a time
 * (the most recently built one); `grocery_items` snapshots what `aggregateGroceryLines` found so
 * ticking a box and reloading shows the same list, not a re-aggregation that could drift if the
 * plan changes underneath it.
 *
 * Column convention (schema/README.md: `app` owns `user.db`'s migrations):
 * - A slug-backed row (from the aggregation) stores the bought slug in `canonical_ingredient`,
 *   the formatted shop amount ("1 head (need 3 cloves)", "amount: see recipe") in `unit`, the
 *   shopper-facing name ("lemons") in `display_name` and the source recipe titles (JSON) in
 *   `sources`; `manual` is 0 and `note` is null. Rows from before v4 have no `display_name` and
 *   fall back to `corpus/slugs.ts` (`ingredientName`), same as the kitchen list.
 * - A "Check these" row (unparseable, rule 11) has `note` set to the reason and
 *   `canonical_ingredient` holding the raw line text, unit/aisle null.
 * - A manual extra item ("paper towels") has `manual = 1` and `canonical_ingredient` holding
 *   whatever the user typed; not slug-backed, so it cannot be added to the kitchen list.
 */

export interface GroceryListItem {
  id: string
  /** A canonical slug for an aggregated item, else the raw/typed text. */
  text: string
  /** Display name (slug-backed rows only; else same as `text`). */
  name: string
  amount: string | null
  aisle: string | null
  checked: boolean
  manual: boolean
  /** Set for a "Check these" row: why it could not be aggregated. */
  note: string | null
  /** True for a normal (non-manual, non-"check these") slug-backed row. */
  isSlug: boolean
  /** The planned recipes the line came from (S7c; empty for manual/older rows). */
  sources: string[]
}

interface GroceryItemRow {
  id: string
  canonical_ingredient: string
  quantity: number | null
  unit: string | null
  aisle: string | null
  checked: number
  manual: number
  note: string | null
  display_name: string | null
  sources: string | null
}

function parseSources(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

function toItem(row: GroceryItemRow, nameOf: (slug: string) => string): GroceryListItem {
  const isSlug = row.manual === 0 && row.note === null
  return {
    id: row.id,
    text: row.canonical_ingredient,
    name: isSlug
      ? (row.display_name ?? nameOf(row.canonical_ingredient))
      : row.canonical_ingredient,
    amount: row.unit,
    aisle: row.aisle,
    checked: row.checked === 1,
    manual: row.manual === 1,
    note: row.note,
    isSlug,
    sources: parseSources(row.sources),
  }
}

export interface GroceryList {
  id: string
  items: GroceryListItem[]
}

/** The most recently built list, or null when nothing has been built yet. */
export async function getCurrentGroceryList(
  nameOf: (slug: string) => string,
): Promise<GroceryList | null> {
  const db = await getUserDb()
  const list = await db.query<{ id: string }>(
    'SELECT id FROM grocery_lists ORDER BY created_at DESC LIMIT 1',
  )
  const row = list.rows[0]
  if (!row) return null
  const items = await db.query<GroceryItemRow>(
    `SELECT id, canonical_ingredient, quantity, unit, aisle, checked, manual, note, display_name,
            sources
       FROM grocery_items WHERE grocery_list_id = ?`,
    [row.id],
  )
  return { id: row.id, items: items.rows.map((r) => toItem(r, nameOf)) }
}

/** Builds a new "current" list from an aggregation result (brief S7 #2), replacing whichever
 * list was current before. Nothing about the previous list's checked state carries over: a
 * rebuild reflects a changed plan, so it starts fresh (rule 11 still holds — nothing is dropped,
 * every "Check these" line is written too). */
export async function buildGroceryList(
  planId: string | null,
  items: AggregatedItem[],
  checkThese: CheckThisLine[],
): Promise<string> {
  const db = await getUserDb()
  const listId = newId('list')
  return db.transaction(async () => {
    await db.run('INSERT INTO grocery_lists (id, plan_id) VALUES (?, ?)', [listId, planId])
    for (const item of items) {
      if (item.have) continue // "have" items are shown collapsed, not put on the list to buy
      await db.run(
        `INSERT INTO grocery_items
           (id, grocery_list_id, canonical_ingredient, unit, aisle, display_name, sources)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId('item'),
          listId,
          item.slug,
          item.amount,
          item.aisle,
          item.name,
          JSON.stringify(item.sources),
        ],
      )
    }
    for (const line of checkThese) {
      await db.run(
        `INSERT INTO grocery_items (id, grocery_list_id, canonical_ingredient, note)
         VALUES (?, ?, ?, ?)`,
        [newId('item'), listId, line.raw, line.reason],
      )
    }
    return listId
  })
}

export async function setGroceryItemChecked(id: string, checked: boolean): Promise<void> {
  const db = await getUserDb()
  await db.run('UPDATE grocery_items SET checked = ? WHERE id = ?', [checked ? 1 : 0, id])
}

/** A deleted `grocery_items` row, every column as stored, so "Undo" can put it back exactly. */
export type DeletedGroceryItem = Record<string, SqlParam>

/** Deletes one line from the list (S22b: swipe left). Returns the row for `restoreGroceryItem`,
 * or null when it was already gone. */
export async function deleteGroceryItem(id: string): Promise<DeletedGroceryItem | null> {
  const db = await getUserDb()
  const { rows } = await db.query<DeletedGroceryItem>('SELECT * FROM grocery_items WHERE id = ?', [
    id,
  ])
  const row = rows[0]
  if (!row) return null
  await db.run('DELETE FROM grocery_items WHERE id = ?', [id])
  return row
}

/** "Undo" for `deleteGroceryItem`: re-inserts the row as it was (same id, list, tick). */
export async function restoreGroceryItem(row: DeletedGroceryItem): Promise<void> {
  const db = await getUserDb()
  const columns = Object.keys(row)
  await db.run(
    `INSERT OR REPLACE INTO grocery_items (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column]),
  )
}

export async function addManualGroceryItem(listId: string, text: string): Promise<void> {
  const db = await getUserDb()
  await db.run(
    `INSERT INTO grocery_items (id, grocery_list_id, canonical_ingredient, manual)
     VALUES (?, ?, ?, 1)`,
    [newId('item'), listId, text],
  )
}

/** Deletes the current list entirely ("Clear"). */
export async function clearGroceryList(listId: string): Promise<void> {
  const db = await getUserDb()
  await db.transaction(async () => {
    await db.run('DELETE FROM grocery_items WHERE grocery_list_id = ?', [listId])
    await db.run('DELETE FROM grocery_lists WHERE id = ?', [listId])
  })
}

/** "Add ticked to kitchen": every checked, slug-backed item joins the kitchen list ("what I
 * have"), then is removed from the grocery list — it has been bought. Manual items and "Check
 * these" lines are left as they are; there is no slug to add. Returns how many were added. */
export async function addTickedToKitchen(listId: string): Promise<number> {
  const db = await getUserDb()
  const { rows } = await db.query<GroceryItemRow>(
    `SELECT id, canonical_ingredient, quantity, unit, aisle, checked, manual, note, display_name,
            sources
       FROM grocery_items
      WHERE grocery_list_id = ? AND checked = 1 AND manual = 0 AND note IS NULL`,
    [listId],
  )
  for (const row of rows) {
    await addKitchenItem(row.canonical_ingredient)
    await db.run('DELETE FROM grocery_items WHERE id = ?', [row.id])
  }
  return rows.length
}
