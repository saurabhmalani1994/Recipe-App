import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RecipeCard, RecipeTileSkeleton } from '../components/ui/RecipeCard'
import { EmptyState } from '../components/ui/Section'
import { cuisineLabel } from '../features/cook/labels'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { listFavorites, type FavoriteRef } from '../features/favorites/favoritesRepo'
import { resolveFavorites, type FavoriteView } from '../features/favorites/resolve'

/** S11 #1: "the favorites list mixes corpus and fixture/My Recipes favorites." S22b lays them out
 * as a photo-card grid. The top bar carries the title. */
export function Favorites() {
  const { status, corpus } = useCorpus()
  const [refs, setRefs] = useState<FavoriteRef[] | null>(null)
  const [views, setViews] = useState<FavoriteView[] | null>(null)

  useEffect(() => {
    void listFavorites().then(setRefs)
  }, [])

  useEffect(() => {
    if (!refs) return
    let current = true
    void resolveFavorites(refs, corpus?.db ?? null).then((resolved) => {
      if (current) setViews(resolved)
    })
    return () => {
      current = false
    }
  }, [refs, corpus])

  const waitingOnCorpus = refs !== null && refs.some((f) => f.recipeSource === 'corpus') && !corpus
  const notReady = waitingOnCorpus ? corpusStatusText(status) : null

  return (
    <section className="screen screen--favorites" data-testid="screen-favorites">
      {notReady && (
        <p className="status-line" role="status">
          {notReady}
        </p>
      )}
      {refs !== null && refs.length === 0 && (
        <EmptyState
          icon="star"
          title="No favorites yet."
          action={
            <Link to="/cook" className="button button--primary">
              Find a recipe
            </Link>
          }
        >
          Open a recipe and tap the star to keep it here.
        </EmptyState>
      )}
      {views === null && refs !== null && refs.length > 0 && (
        <div className="recipe-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <RecipeTileSkeleton key={i} />
          ))}
        </div>
      )}
      {views && views.length > 0 && (
        <ul className="recipe-grid" aria-label="Favorites">
          {views.map((recipe) => (
            <li key={`${recipe.source}-${recipe.key}`}>
              <RecipeCard
                to={recipe.href}
                recipe={{
                  title: recipe.title,
                  cuisine: recipe.cuisine,
                  cuisineLabel: recipe.cuisineTag ? cuisineLabel(recipe.cuisineTag) : null,
                  totalMin: recipe.totalMin,
                  imageUrl: recipe.imageUrl,
                }}
                note={recipe.source === 'my' ? 'My recipe' : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
