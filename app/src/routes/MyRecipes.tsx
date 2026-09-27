import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyRecipes } from '../features/myRecipes/myRecipesRepo'
import type { MyRecipe } from '../features/myRecipes/types'

export function MyRecipes() {
  const [recipes, setRecipes] = useState<MyRecipe[]>([])

  useEffect(() => {
    void listMyRecipes().then(setRecipes)
  }, [])

  return (
    <section className="screen" data-testid="screen-my-recipes">
      <h2>My Recipes</h2>
      <p className="screen__placeholder">
        Your own recipes and forks ("make my version") land here.
      </p>
      <Link to="/my-recipes/new" className="my-recipes__new">
        + New recipe
      </Link>
      {recipes.length === 0 && <p className="screen__placeholder">Nothing yet.</p>}
      <ul className="recipe-list">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link to={`/my-recipes/${recipe.id}`}>
              {recipe.title}
              {recipe.parentRecipeId ? ' (fork)' : ''}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
