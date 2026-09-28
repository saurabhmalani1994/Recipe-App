import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Cuisine } from '../corpus/model'
import type { RecipeDiff } from '../features/myRecipes/diff'
import {
  findFixtureRecipe,
  getForkDiff,
  getMyRecipe,
  updateMyRecipe,
  createMyRecipe,
} from '../features/myRecipes/myRecipesRepo'
import {
  emptyMyRecipeData,
  type MyRecipeData,
  type MyRecipeIngredientLine,
} from '../features/myRecipes/types'

function emptyLine(): MyRecipeIngredientLine {
  return { quantity: null, unit: null, canonicalIngredient: '', form: null, optional: false }
}

export function MyRecipeEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [data, setData] = useState<MyRecipeData>(emptyMyRecipeData())
  const [parentRecipeId, setParentRecipeId] = useState<string | null>(null)
  const [diff, setDiff] = useState<RecipeDiff | null>(null)
  const [loaded, setLoaded] = useState(isNew)

  useEffect(() => {
    if (isNew || !id) return
    let mounted = true
    void (async () => {
      const recipe = await getMyRecipe(id)
      if (!recipe || !mounted) return
      setTitle(recipe.title)
      setData(recipe.data)
      setParentRecipeId(recipe.parentRecipeId)
      if (recipe.parentRecipeId) {
        const forkDiff = await getForkDiff(id)
        if (mounted && forkDiff) setDiff(forkDiff)
      }
      setLoaded(true)
    })()
    return () => {
      mounted = false
    }
  }, [id, isNew])

  async function save() {
    if (isNew) {
      const newId = await createMyRecipe(title || 'Untitled recipe', data)
      navigate(`/my-recipes/${newId}`)
      return
    }
    if (!id) return
    await updateMyRecipe(id, title, data)
    if (parentRecipeId) {
      const forkDiff = await getForkDiff(id)
      if (forkDiff) setDiff(forkDiff)
    }
  }

  function updateIngredient(index: number, patch: Partial<MyRecipeIngredientLine>) {
    setData((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
  }

  function addIngredient() {
    setData((prev) => ({ ...prev, ingredients: [...prev.ingredients, emptyLine()] }))
  }

  function removeIngredient(index: number) {
    setData((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== index) }))
  }

  function updateStep(index: number, text: string) {
    setData((prev) => ({ ...prev, steps: prev.steps.map((s, i) => (i === index ? text : s)) }))
  }

  function addStep() {
    setData((prev) => ({ ...prev, steps: [...prev.steps, ''] }))
  }

  function removeStep(index: number) {
    setData((prev) => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }))
  }

  if (!loaded) {
    return (
      <section className="screen" data-testid="screen-my-recipe-editor">
        <p className="screen__placeholder">Loading…</p>
      </section>
    )
  }

  const parent = parentRecipeId ? findFixtureRecipe(parentRecipeId) : undefined

  return (
    <section className="screen" data-testid="screen-my-recipe-editor">
      <h2>{isNew ? 'New recipe' : title || 'Untitled recipe'}</h2>

      {parent && <p className="screen__placeholder">Forked from {parent.title}.</p>}

      {diff && (
        <div className="fork-diff" data-testid="fork-diff">
          <h3>Changes from {parent?.title ?? 'the original'}</h3>
          {diff.ingredientsAdded.length === 0 &&
            diff.ingredientsRemoved.length === 0 &&
            diff.ingredientsChanged.length === 0 &&
            diff.stepsChanged.length === 0 && <p>No changes yet.</p>}
          {diff.ingredientsAdded.length > 0 && (
            <div>
              <strong>Added:</strong>{' '}
              {diff.ingredientsAdded.map((line) => line.canonicalIngredient).join(', ')}
            </div>
          )}
          {diff.ingredientsRemoved.length > 0 && (
            <div>
              <strong>Removed:</strong>{' '}
              {diff.ingredientsRemoved.map((line) => line.canonicalIngredient).join(', ')}
            </div>
          )}
          {diff.ingredientsChanged.length > 0 && (
            <div>
              <strong>Changed:</strong>{' '}
              {diff.ingredientsChanged
                .map(
                  (c) =>
                    `${c.ingredient} (${c.parent.quantity ?? '—'} ${c.parent.unit ?? ''} → ${c.fork.quantity ?? '—'} ${c.fork.unit ?? ''})`,
                )
                .join('; ')}
            </div>
          )}
          {diff.stepsChanged.length > 0 && (
            <div>
              <strong>Steps changed:</strong> step{' '}
              {diff.stepsChanged.map((s) => s.index + 1).join(', ')}
            </div>
          )}
        </div>
      )}

      <label className="settings-field">
        Title
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label className="settings-field">
        Servings
        <input
          type="number"
          min={1}
          value={data.servings}
          onChange={(e) => setData((prev) => ({ ...prev, servings: Number(e.target.value) || 1 }))}
        />
      </label>

      <label className="settings-field">
        Cuisine
        <input
          type="text"
          value={data.cuisine ?? ''}
          onChange={(e) =>
            setData((prev) => ({ ...prev, cuisine: (e.target.value || null) as Cuisine | null }))
          }
        />
      </label>

      <label className="settings-field">
        Tags (comma separated)
        <input
          type="text"
          value={data.tags.join(', ')}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            }))
          }
        />
      </label>

      <h3>Ingredients</h3>
      <ul className="editor-ingredients">
        {data.ingredients.map((line, i) => (
          <li key={i} className="editor-ingredient-row">
            <input
              type="number"
              aria-label={`Ingredient ${i + 1} quantity`}
              value={line.quantity ?? ''}
              onChange={(e) =>
                updateIngredient(i, { quantity: e.target.value ? Number(e.target.value) : null })
              }
            />
            <input
              type="text"
              aria-label={`Ingredient ${i + 1} unit`}
              value={line.unit ?? ''}
              onChange={(e) => updateIngredient(i, { unit: e.target.value || null })}
            />
            <input
              type="text"
              aria-label={`Ingredient ${i + 1} name`}
              value={line.canonicalIngredient}
              onChange={(e) => updateIngredient(i, { canonicalIngredient: e.target.value })}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ingredient ${i + 1}`}
              onClick={() => removeIngredient(i)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={addIngredient}>
        + Ingredient
      </button>

      <h3>Steps</h3>
      <ol className="editor-steps">
        {data.steps.map((step, i) => (
          <li key={i} className="editor-step-row">
            <textarea
              aria-label={`Step ${i + 1}`}
              value={step}
              onChange={(e) => updateStep(i, e.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove step ${i + 1}`}
              onClick={() => removeStep(i)}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={addStep}>
        + Step
      </button>

      <label className="settings-field">
        Notes
        <textarea
          value={data.notes}
          onChange={(e) => setData((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </label>

      <button type="button" onClick={() => void save()}>
        Save
      </button>
    </section>
  )
}
