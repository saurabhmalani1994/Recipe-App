import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RecipeDetailView, StarButton } from '../components/recipe/RecipeDetailView'
import { Icon } from '../components/ui/Icon'
import { EmptyState } from '../components/ui/Section'
import { FIXTURE_RECIPES } from '../corpus/fixture'
import { cuisineLabel, equipmentLabel } from '../features/cook/labels'
import { isFavorite, setFavorite } from '../features/favorites/favoritesRepo'
import { forkRecipe } from '../features/myRecipes/myRecipesRepo'
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import { scaleIngredients, targetServings } from '../features/scaling/scale'
import { getSettings, type AppSettings } from '../features/settings/settingsRepo'
import { CorpusRecipeDetail } from './CorpusRecipeDetail'

/**
 * `/recipe/:id`: a hand-written fixture recipe by its id (r01..r20, still used by Home and
 * Favorites), else a corpus recipe by its stable `recipes.key` (S6, linked from Cook).
 */
export function RecipeDetail() {
  const { id } = useParams<{ id: string }>()
  if (id && !FIXTURE_RECIPES.some((r) => r.id === id)) {
    return <CorpusRecipeDetail key={id} recipeKey={id} />
  }
  return <FixtureRecipeDetail id={id} />
}

function FixtureRecipeDetail({ id }: { id: string | undefined }) {
  const navigate = useNavigate()
  const recipe = FIXTURE_RECIPES.find((r) => r.id === id)

  const [favorite, setFavoriteState] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [people, setPeople] = useState<number | null>(null)
  const [forking, setForking] = useState(false)

  useEffect(() => {
    if (!id) return
    void isFavorite(id).then(setFavoriteState)
    void getSettings().then(setSettings)
  }, [id])

  if (!recipe) {
    return (
      <section className="screen screen--detail" data-testid="screen-recipe-detail">
        <EmptyState icon="search" title="Recipe not found." />
      </section>
    )
  }

  // `recipe` is a `Recipe` from here on, but TS narrowing doesn't carry into the nested
  // closures below, so pin it to a definitely-defined local.
  const currentRecipe = recipe

  async function toggleFavorite() {
    const next = !favorite
    setFavoriteState(next)
    await setFavorite(currentRecipe.id, next)
  }

  async function makeMyVersion() {
    setForking(true)
    try {
      const forkId = await forkRecipe(currentRecipe)
      navigate(`/my-recipes/${forkId}`)
    } finally {
      setForking(false)
    }
  }

  const headCount = people ?? settings?.peopleDefault ?? 2
  const perPerson = settings?.servingsPerPerson ?? 1.5
  const target = targetServings(headCount, perPerson)
  const factor = recipe.servings > 0 ? target / recipe.servings : 1
  const scaled = scaleIngredients(recipe.ingredients, factor)

  return (
    <section className="screen screen--detail" data-testid="screen-recipe-detail">
      <RecipeDetailView
        title={recipe.title}
        cuisine={recipe.cuisine}
        cuisineLabel={cuisineLabel(recipe.cuisine)}
        meta={
          <>
            <span className="meta__time">
              <Icon name="clock" size={16} />
              {recipe.totalMinutes} min total
            </span>
            <span>Serves {recipe.servings}</span>
            {recipe.onePot && <span>One pot</span>}
          </>
        }
        actions={
          <>
            <StarButton on={favorite} onToggle={() => void toggleFavorite()} />
            <AddToPlanControl
              recipeId={recipe.id}
              recipeSource="fixture"
              recipeTitle={recipe.title}
              variant="pill"
            />
            <button
              type="button"
              className="button button--quiet"
              disabled={forking}
              onClick={() => void makeMyVersion()}
            >
              <Icon name="edit" size={18} />
              Make my version
            </button>
          </>
        }
        servings={{ people: headCount, onPeopleChange: setPeople, target }}
        intro={
          recipe.equipment.length > 0 && (
            <ul className="chip-wrap detail-equipment" aria-label="Equipment">
              {recipe.equipment.map((e) => (
                <li key={e} className="chip">
                  {equipmentLabel(e)}
                </li>
              ))}
            </ul>
          )
        }
        ingredients={scaled.map((line, i) => ({
          key: i,
          text: [
            line.scaledQuantity ?? '',
            line.unit && line.unit !== 'unit' ? line.unit : '',
            line.canonicalIngredient,
          ]
            .filter((part) => part !== '')
            .join(' ')
            .concat(line.form ? ` (${line.form})` : ''),
        }))}
        // The hand-written fixture's source links are example.com placeholders: not shown.
        steps={recipe.steps}
      />
    </section>
  )
}
