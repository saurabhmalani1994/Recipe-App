import { getUserDb } from '../../db'

export async function listFavoriteIds(): Promise<string[]> {
  const db = await getUserDb()
  const result = await db.query<{ recipe_id: string }>(
    'SELECT recipe_id FROM favorites ORDER BY created_at DESC',
  )
  return result.rows.map((row) => row.recipe_id)
}

export async function isFavorite(recipeId: string): Promise<boolean> {
  const db = await getUserDb()
  const result = await db.query<{ recipe_id: string }>(
    'SELECT recipe_id FROM favorites WHERE recipe_id = ?',
    [recipeId],
  )
  return result.rows.length > 0
}

export async function setFavorite(recipeId: string, on: boolean): Promise<void> {
  const db = await getUserDb()
  if (on) {
    await db.run('INSERT OR IGNORE INTO favorites (recipe_id) VALUES (?)', [recipeId])
  } else {
    await db.run('DELETE FROM favorites WHERE recipe_id = ?', [recipeId])
  }
}
