import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Icon } from '../components/ui/Icon'
import { RecipeCard, RecipeTileSkeleton } from '../components/ui/RecipeCard'
import { EmptyState } from '../components/ui/Section'
import { cuisineLabel } from '../features/cook/labels'
import { listMyRecipes } from '../features/myRecipes/myRecipesRepo'
import type { MyRecipe } from '../features/myRecipes/types'

/** The ways to add a recipe, shared by the FAB's sheet and the empty state. */
function AddOptions() {
  return (
    <div className="option-list">
      <Link to="/my-recipes/new" className="option">
        <span className="option__icon">
          <Icon name="edit" />
        </span>
        <span className="option__text">
          <span className="option__label">New recipe</span>
          <span className="option__hint">Type it in: lines are read as you go.</span>
        </span>
      </Link>
      <Link to="/my-recipes/import" className="option">
        <span className="option__icon">
          <Icon name="link" />
        </span>
        <span className="option__text">
          <span className="option__label">Import from link</span>
          <span className="option__hint">From a recipe page, or its text pasted in.</span>
        </span>
      </Link>
    </div>
  )
}

/**
 * My Recipes (S22b layout): the owner's recipes as a photo-card grid (placeholders in the
 * cuisine's colour, since a typed recipe has no photo). "New recipe" and "Import from link" sit
 * behind a floating + button, in a sheet. The top bar carries the title.
 */
export function MyRecipes() {
  const [recipes, setRecipes] = useState<MyRecipe[] | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void listMyRecipes().then(setRecipes)
  }, [])

  return (
    <section className="screen screen--my-recipes" data-testid="screen-my-recipes">
      {recipes === null && (
        <div className="recipe-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <RecipeTileSkeleton key={i} />
          ))}
        </div>
      )}
      {recipes !== null && recipes.length === 0 && (
        <>
          <EmptyState icon="book" title="Your own recipes live here.">
            Type one in, import one from a link, or open any recipe and tap “Make my version”.
          </EmptyState>
          <AddOptions />
        </>
      )}
      {recipes !== null && recipes.length > 0 && (
        <>
          <p className="list-summary">
            {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
          </p>
          <ul className="recipe-grid" aria-label="My recipes">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <RecipeCard
                  to={`/my-recipes/${encodeURIComponent(recipe.id)}/view`}
                  recipe={{
                    title: recipe.title || 'Untitled recipe',
                    cuisine: recipe.data.cuisine,
                    cuisineLabel: recipe.data.cuisine ? cuisineLabel(recipe.data.cuisine) : null,
                    totalMin: recipe.data.totalMin ?? null,
                  }}
                  note={
                    recipe.parentRecipeId
                      ? 'My version'
                      : recipe.data.sourceUrl
                        ? 'Imported'
                        : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        className="fab"
        aria-label="Add a recipe"
        aria-haspopup="dialog"
        onClick={() => setAdding(true)}
        data-testid="my-recipes-add"
      >
        <Icon name="plus" size={26} />
      </button>

      <BottomSheet open={adding} onClose={() => setAdding(false)} title="Add a recipe">
        <AddOptions />
      </BottomSheet>
    </section>
  )
}
