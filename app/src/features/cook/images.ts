import type { Db } from '../../db/types'

/**
 * `recipes.image_url` for a batch of corpus keys (S22a: Cook's results are photo cards). A key
 * with no row, or a row with no image, is simply absent from the map; the card then shows its
 * cuisine-coloured placeholder.
 */
export async function imagesForKeys(db: Db, keys: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (keys.length === 0) return out
  const { rows } = await db.query<{ key: string; image_url: string | null }>(
    'SELECT key, image_url FROM recipes WHERE key IN (SELECT value FROM json_each(?))',
    [JSON.stringify(keys)],
  )
  for (const row of rows) if (row.image_url) out.set(row.key, row.image_url)
  return out
}
