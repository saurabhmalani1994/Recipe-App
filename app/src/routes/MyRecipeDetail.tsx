import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RecipeDetailView, StarButton } from '../components/recipe/RecipeDetailView'
import { Icon } from '../components/ui/Icon'
import { EmptyState } from '../components/ui/Section'
import { cuisineLabel, equipmentLabel } from '../features/cook/labels'
import { isFavorite, setFavorite } from '../features/favorites/favoritesRepo'
import { lineText } from '../features/myRecipes/lines'
import { getMyRecipe } from '../features/myRecipes/myRecipesRepo'
import type { MyRecipe } from '../features/myRecipes/types'
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import { lineStatus } from '../parse'
import { DetailSkeleton } from './CorpusRecipeDetail'

/**
 * `/my-recipes/:id/view` (S22b): a My Recipe laid out like any other recipe, to cook from. Its
 * lines are shown as typed (they are not scaled or converted, so there is no stepper or units
 * toggle); "Edit" opens the editor.
 */
export function MyRecipeDetail() {
  const { id } = useParams<{ id: string }>()
  const [recipe, setRecipe] = useState<MyRecipe | null | undefined>(undefined)
  const [favorite, setFavoriteState] = useState(false)

  useEffect(() => {
    if (!id) return
    let current = true
    void getMyRecipe(id).then((loaded) => {
      if (current) setRecipe(loaded ?? null)
    })
    void isFavorite(id, 'my').then((on) => {
      if (current) setFavoriteState(on)
    })
    return () => {
      current = false
    }
  }, [id])

  if (recipe === undefined) {
    return (
      <section className="screen screen--detail" data-testid="screen-recipe-detail">
        <DetailSkeleton status="Opening your recipe…" />
      </section>
    )
  }
  if (recipe === null || !id) {
    return (
      <section className="screen screen--detail" data-testid="screen-recipe-detail">
        <EmptyState icon="book" title="Recipe not found." />
      </section>
    )
  }

  const current = recipe
  async function toggleFavorite() {
    const next = !favorite
    setFavoriteState(next)
    await setFavorite(current.id, next, 'my')
  }

  const { data } = recipe
  const lines = data.ingredients
    .map((line, i) => ({ text: lineText(line), status: lineStatus(recipe.parsed[i]?.items ?? []) }))
    .filter((line) => line.text.trim() !== '')

  return (
    <section className="screen screen--detail" data-testid="screen-recipe-detail">
      <RecipeDetailView
        title={recipe.title || 'Untitled recipe'}
        cuisine={data.cuisine}
        cuisineLabel={data.cuisine ? cuisineLabel(data.cuisine) : 'My recipe'}
        meta={
          <>
            {data.totalMin != null && (
              <span className="meta__time">
                <Icon name="clock" size={16} />
                {data.totalMin} min total
              </span>
            )}
            <span>Serves {data.servings}</span>
            {data.onePot && <span>One pot</span>}
            {recipe.parentRecipeId && <span className="badge">My version</span>}
          </>
        }
        actions={
          <>
            <StarButton on={favorite} onToggle={() => void toggleFavorite()} />
            <AddToPlanControl
              recipeId={recipe.id}
              recipeSource="my"
              recipeTitle={recipe.title || 'Untitled recipe'}
              variant="pill"
            />
            <Link to={`/my-recipes/${encodeURIComponent(recipe.id)}`} className="button button--quiet">
              <Icon name="edit" size={18} />
              Edit
            </Link>
          </>
        }
        intro={
          data.equipment && data.equipment.length > 0 ? (
            <ul className="chip-wrap detail-equipment" aria-label="Equipment">
              {data.equipment.map((e) => (
                <li key={e} className="chip">
                  {equipmentLabel(e)}
                </li>
              ))}
            </ul>
          ) : null
        }
        // A heading line ("For the sauce:") reads as a sub-heading, not something to tick.
        ingredients={lines.map((line, i) => ({
          key: i,
          text: line.status === 'empty' ? <strong>{line.text}</strong> : line.text,
        }))}
        steps={data.steps.filter((step) => step.trim() !== '')}
        sourceUrl={data.sourceUrl ?? null}
        footer={
          data.notes.trim() ? (
            <section className="detail-notes">
              <h3 className="detail-section__title">Notes</h3>
              <p>{data.notes}</p>
            </section>
          ) : null
        }
      />
    </section>
  )
}
