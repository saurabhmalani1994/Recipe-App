import { getUserDb } from '../../db'

/** Same three sources a plan entry's recipe id can resolve to (`features/plan/planRepo.ts`'s
 * `RecipeSource`, not imported directly to avoid a favorites -> plan dependency). Corpus
 * favorites are keyed by `recipes.key`; fixture and My Recipes keep their old ids. Existing rows
 * (written before S11) are all fixture favorites — the only kind that existed then. */
export type FavoriteSource = 'corpus' | 'fixture' | 'my'

export interface FavoriteRef {
  recipeId: string
  recipeSource: FavoriteSource
}

interface FavoriteRow {
  recipe_id: string
  recipe_source: FavoriteSource
}

/** Every favorite, newest first, mixing all three sources (S11 #1: "the favorites list mixes
 * corpus and fixture/My Recipes favorites"). */
export async function listFavorites(): Promise<FavoriteRef[]> {
  const db = await getUserDb()
  const result = await db.query<FavoriteRow>(
    'SELECT recipe_id, recipe_source FROM favorites ORDER BY created_at DESC',
  )
  return result.rows.map((row) => ({ recipeId: row.recipe_id, recipeSource: row.recipe_source }))
}

/** Favorite ids, optionally narrowed to one source. Defaults to every source for callers (like
 * `home/homeRepo.ts`) that resolve each id against its own source afterwards; existing callers
 * that only ever dealt with fixture ids (`routes/Plan.tsx`'s picker) get the same ids back as
 * before, since a lookup against `FIXTURE_RECIPES` alone already drops anything else. */
export async function listFavoriteIds(source?: FavoriteSource): Promise<string[]> {
  const all = await listFavorites()
  return (source ? all.filter((f) => f.recipeSource === source) : all).map((f) => f.recipeId)
}

export async function isFavorite(recipeId: string, source: FavoriteSource = 'fixture'): Promise<boolean> {
  const db = await getUserDb()
  const result = await db.query<{ recipe_id: string }>(
    'SELECT recipe_id FROM favorites WHERE recipe_id = ? AND recipe_source = ?',
    [recipeId, source],
  )
  return result.rows.length > 0
}

export async function setFavorite(
  recipeId: string,
  on: boolean,
  source: FavoriteSource = 'fixture',
): Promise<void> {
  const db = await getUserDb()
  if (on) {
    await db.run('INSERT OR IGNORE INTO favorites (recipe_id, recipe_source) VALUES (?, ?)', [
      recipeId,
      source,
    ])
  } else {
    await db.run('DELETE FROM favorites WHERE recipe_id = ? AND recipe_source = ?', [
      recipeId,
      source,
    ])
  }
}
