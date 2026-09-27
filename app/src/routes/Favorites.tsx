import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FIXTURE_RECIPES } from '../corpus/fixture'
import { listFavoriteIds } from '../features/favorites/favoritesRepo'

export function Favorites() {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    void listFavoriteIds().then(setIds)
  }, [])

  const recipes = ids
    .map((id) => FIXTURE_RECIPES.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is (typeof FIXTURE_RECIPES)[number] => recipe !== undefined)

  return (
    <section className="screen" data-testid="screen-favorites">
      <h2>Favorites</h2>
      {recipes.length === 0 && (
        <p className="screen__placeholder">
          No favorites yet. Open a recipe and tap the star to save it here.
        </p>
      )}
      <ul className="recipe-list">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link to={`/recipe/${recipe.id}`}>{recipe.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
