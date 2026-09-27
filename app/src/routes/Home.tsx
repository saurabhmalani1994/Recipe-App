import { Link } from 'react-router-dom'
import { FIXTURE_RECIPES } from '../corpus/fixture'

export function Home() {
  return (
    <section className="screen" data-testid="screen-home">
      <h2>Home</h2>
      <p className="screen__placeholder">
        Cook with what I have, explore a cuisine, like your favorites, and seasonal / quick
        weeknight rows land here once the matching engine ships (out of scope for this slice).
      </p>

      <div className="home-shortcuts">
        <Link to="/favorites">★ Favorites</Link>
        <Link to="/kitchen">🧺 What I have</Link>
      </div>

      <h3>Recipes</h3>
      <ul className="recipe-list">
        {FIXTURE_RECIPES.map((recipe) => (
          <li key={recipe.id}>
            <Link to={`/recipe/${recipe.id}`}>{recipe.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
