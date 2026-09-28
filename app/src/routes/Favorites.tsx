import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FIXTURE_RECIPES } from '../corpus/fixture'
import type { Cuisine } from '../corpus/types'
import { cuisineLabel } from '../features/cook/labels'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { listFavorites, type FavoriteRef } from '../features/favorites/favoritesRepo'
import { getMyRecipe } from '../features/myRecipes/myRecipesRepo'

interface FavoriteView {
  key: string
  title: string
  cuisine: Cuisine | null
  /** `/recipe/:id` for fixture and corpus, `/my-recipes/:id` for a fork (routes/App.tsx). */
  href: string
}

async function resolveFavorite(
  favorite: FavoriteRef,
  corpusTitles: Map<string, { title: string; cuisine: Cuisine | null }>,
): Promise<FavoriteView | null> {
  if (favorite.recipeSource === 'fixture') {
    const recipe = FIXTURE_RECIPES.find((r) => r.id === favorite.recipeId)
    return recipe
      ? { key: recipe.id, title: recipe.title, cuisine: recipe.cuisine, href: `/recipe/${recipe.id}` }
      : null
  }
  if (favorite.recipeSource === 'corpus') {
    const found = corpusTitles.get(favorite.recipeId)
    return found
      ? {
          key: favorite.recipeId,
          title: found.title,
          cuisine: found.cuisine,
          href: `/recipe/${encodeURIComponent(favorite.recipeId)}`,
        }
      : null
  }
  const myRecipe = await getMyRecipe(favorite.recipeId)
  return myRecipe
    ? {
        key: myRecipe.id,
        title: myRecipe.title,
        cuisine: myRecipe.data.cuisine,
        href: `/my-recipes/${encodeURIComponent(myRecipe.id)}`,
      }
    : null
}

/** S11 #1: "the favorites list mixes corpus and fixture/My Recipes favorites." Corpus and My
 * Recipes favorites both need a lookup (corpus.db, my_recipes) the fixture ones don't. */
export function Favorites() {
  const { status, corpus } = useCorpus()
  const [refs, setRefs] = useState<FavoriteRef[] | null>(null)
  const [views, setViews] = useState<FavoriteView[]>([])

  useEffect(() => {
    void listFavorites().then(setRefs)
  }, [])

  useEffect(() => {
    const favorites = refs
    if (!favorites) return
    let current = true
    const corpusKeys = favorites.filter((f) => f.recipeSource === 'corpus').map((f) => f.recipeId)

    async function resolve() {
      const corpusTitles = new Map<string, { title: string; cuisine: Cuisine | null }>()
      if (corpus && corpusKeys.length > 0) {
        const { rows } = await corpus.db.query<{
          key: string
          title: string
          cuisine: Cuisine | null
        }>(
          'SELECT key, title, cuisine FROM recipes WHERE key IN (SELECT value FROM json_each(?))',
          [JSON.stringify(corpusKeys)],
        )
        for (const row of rows) corpusTitles.set(row.key, { title: row.title, cuisine: row.cuisine })
      }
      const resolved = await Promise.all(
        (favorites ?? []).map((f) => resolveFavorite(f, corpusTitles)),
      )
      if (current) setViews(resolved.filter((v): v is FavoriteView => v !== null))
    }
    void resolve()
    return () => {
      current = false
    }
  }, [refs, corpus])

  const waitingOnCorpus =
    refs !== null && refs.some((f) => f.recipeSource === 'corpus') && !corpus
  const notReady = waitingOnCorpus ? corpusStatusText(status) : null

  return (
    <section className="screen" data-testid="screen-favorites">
      <h2>Favorites</h2>
      {refs !== null && views.length === 0 && !notReady && (
        <p className="screen__placeholder">
          No favorites yet. Open a recipe and tap the star to save it here.
        </p>
      )}
      {notReady && <p className="screen__placeholder">{notReady}</p>}
      <ul className="recipe-list">
        {views.map((recipe) => (
          <li key={recipe.key}>
            <Link to={recipe.href}>
              {recipe.title}
              {recipe.cuisine ? ` · ${cuisineLabel(recipe.cuisine)}` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
