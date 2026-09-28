import { FIXTURE_RECIPES } from '../../corpus/fixture'
import type { Cuisine, CuisineSource } from '../../corpus/types'
import type { Db } from '../../db/types'
import { cuisineTag } from '../cook/labels'
import { getMyRecipe } from '../myRecipes/myRecipesRepo'
import type { FavoriteRef, FavoriteSource } from './favoritesRepo'

/** A favorite, resolved to what a card needs (S11 #1: corpus, fixture and My Recipes mixed). */
export interface FavoriteView {
  key: string
  source: FavoriteSource
  title: string
  cuisine: Cuisine | null
  /** The cuisine to label it with (S22b: a classifier guess under 0.8 is not shown). */
  cuisineTag: Cuisine | null
  totalMin: number | null
  imageUrl: string | null
  /** `/recipe/:id` for fixture and corpus, `/my-recipes/:id/view` for a My Recipe. */
  href: string
}

interface CorpusRow {
  key: string
  title: string
  cuisine: Cuisine | null
  cuisine_source: CuisineSource | null
  cuisine_confidence: number | null
  total_min: number | null
  image_url: string | null
}

/**
 * Resolves favorites in their stored order. A corpus favorite needs `corpusDb` (skipped while
 * it is still opening); one whose recipe no longer exists is dropped, and so counted by the
 * caller as `refs.length - views.length`.
 */
export async function resolveFavorites(
  refs: readonly FavoriteRef[],
  corpusDb: Db | null,
): Promise<FavoriteView[]> {
  const corpusKeys = refs.filter((f) => f.recipeSource === 'corpus').map((f) => f.recipeId)
  const corpusRows = new Map<string, CorpusRow>()
  if (corpusDb && corpusKeys.length > 0) {
    const { rows } = await corpusDb.query<CorpusRow>(
      `SELECT key, title, cuisine, cuisine_source, cuisine_confidence, total_min, image_url
         FROM recipes WHERE key IN (SELECT value FROM json_each(?))`,
      [JSON.stringify(corpusKeys)],
    )
    for (const row of rows) corpusRows.set(row.key, row)
  }

  const views = await Promise.all(
    refs.map(async (ref): Promise<FavoriteView | null> => {
      if (ref.recipeSource === 'fixture') {
        const recipe = FIXTURE_RECIPES.find((r) => r.id === ref.recipeId)
        return recipe
          ? {
              key: recipe.id,
              source: 'fixture',
              title: recipe.title,
              cuisine: recipe.cuisine,
              cuisineTag: recipe.cuisine,
              totalMin: recipe.totalMinutes,
              imageUrl: null,
              href: `/recipe/${recipe.id}`,
            }
          : null
      }
      if (ref.recipeSource === 'corpus') {
        const row = corpusRows.get(ref.recipeId)
        return row
          ? {
              key: row.key,
              source: 'corpus',
              title: row.title,
              cuisine: row.cuisine,
              cuisineTag: cuisineTag(row.cuisine, row.cuisine_source, row.cuisine_confidence),
              totalMin: row.total_min,
              imageUrl: row.image_url,
              href: `/recipe/${encodeURIComponent(row.key)}`,
            }
          : null
      }
      const mine = await getMyRecipe(ref.recipeId)
      return mine
        ? {
            key: mine.id,
            source: 'my',
            title: mine.title,
            cuisine: mine.data.cuisine,
            cuisineTag: mine.data.cuisine,
            totalMin: mine.data.totalMin ?? null,
            imageUrl: null,
            href: `/my-recipes/${encodeURIComponent(mine.id)}/view`,
          }
        : null
    }),
  )
  return views.filter((v): v is FavoriteView => v !== null)
}
