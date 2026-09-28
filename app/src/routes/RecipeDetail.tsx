import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FIXTURE_RECIPES } from '../corpus/fixture'
import { isFavorite, setFavorite } from '../features/favorites/favoritesRepo'
import { forkRecipe } from '../features/myRecipes/myRecipesRepo'
import {
  scaleFactor,
  scaleIngredients,
  targetServings,
  type Units,
} from '../features/scaling/scale'
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
  const [units, setUnits] = useState<Units>('metric')
  const [forking, setForking] = useState(false)

  useEffect(() => {
    if (!id) return
    void isFavorite(id).then(setFavoriteState)
    void getSettings().then((s) => {
      setSettings(s)
      setUnits(s.units)
    })
  }, [id])

  if (!recipe) {
    return (
      <section className="screen" data-testid="screen-recipe-detail">
        <p className="screen__placeholder">Recipe not found.</p>
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

  const people = settings?.peopleDefault ?? 2
  const perPerson = settings?.servingsPerPerson ?? 1.5
  const target = targetServings(people, perPerson)
  const factor = scaleFactor(recipe.servings, people, perPerson)
  const scaled = scaleIngredients(recipe.ingredients, factor)

  return (
    <section className="screen" data-testid="screen-recipe-detail">
      <div className="recipe-detail__header">
        <h2>{recipe.title}</h2>
        <button
          type="button"
          aria-pressed={favorite}
          aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
          className="recipe-detail__favorite"
          onClick={() => void toggleFavorite()}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>

      <div className="recipe-detail__meta">
        <span>
          Serves {target} (for {people} people × {perPerson}/person, recipe makes {recipe.servings})
        </span>
        <label>
          Units
          <select value={units} onChange={(e) => setUnits(e.target.value as Units)}>
            <option value="metric">Metric</option>
            <option value="us">US</option>
          </select>
        </label>
      </div>

      <h3>Ingredients</h3>
      <ul className="recipe-detail__ingredients">
        {scaled.map((line, i) => (
          <li key={i}>
            {line.scaledQuantity ?? ''} {line.unit ?? ''} {line.canonicalIngredient}
            {line.form ? ` (${line.form})` : ''}
          </li>
        ))}
      </ul>

      <h3>Steps</h3>
      <ol className="recipe-detail__steps">
        {recipe.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      <button type="button" disabled={forking} onClick={() => void makeMyVersion()}>
        Make my version
      </button>
    </section>
  )
}
