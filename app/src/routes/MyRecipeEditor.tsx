import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Cuisine } from '../corpus/model'
import type { Equipment } from '../corpus/types'
import { KITCHEN_EQUIPMENT, KITCHEN_EQUIPMENT_LABELS } from '../data/equipment'
import { importedToMyRecipeData } from '../features/importUrl/toMyRecipeData'
import type { ImportedRecipe } from '../features/importUrl/types'
import type { RecipeDiff } from '../features/myRecipes/diff'
import { inferEquipment, inferTotalMinutes } from '../features/myRecipes/inferFromSteps'
import { lineFromText, lineText, parseRecipeLines } from '../features/myRecipes/lines'
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
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import { describeItems, lineStatus } from '../parse'

function emptyLine(): MyRecipeIngredientLine {
  return {
    quantity: null,
    unit: null,
    canonicalIngredient: '',
    form: null,
    optional: false,
    raw: '',
  }
}

export function MyRecipeEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const location = useLocation()
  // "Import from link" (S12): the import screen hands its parsed preview here as router state,
  // pre-filling a new recipe instead of starting blank. Only meaningful for a new recipe.
  const imported = (location.state as { importedRecipe?: ImportedRecipe } | null)?.importedRecipe
  const initial = isNew && imported ? importedToMyRecipeData(imported) : null

  const [title, setTitle] = useState(initial?.title ?? '')
  const [data, setData] = useState<MyRecipeData>(initial?.data ?? emptyMyRecipeData())
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

  function addIngredient() {
    setData((prev) => ({ ...prev, ingredients: [...prev.ingredients, emptyLine()] }))
  }

  function updateIngredientText(index: number, raw: string) {
    setData((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((line, i) =>
        i === index ? lineFromText(raw, line) : line,
      ),
    }))
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

  // What the parser understood from each line, shown under it (S13 #3). Parsing is cheap and
  // deterministic, so it follows every keystroke.
  const parsed = useMemo(() => parseRecipeLines(data), [data])

  // S12b #3 (R13): suggestions for the fields the owner left empty, inferred from the steps
  // (`inferFromSteps.ts`, a small port of ingest/tag/equipment.py and timing.py). Offered, never
  // written on their own — a "no time set" recipe stays that way until the owner accepts one.
  const suggestedMinutes = useMemo(
    () => (data.totalMin == null ? inferTotalMinutes(data.steps) : null),
    [data.totalMin, data.steps],
  )
  const suggestedEquipment = useMemo(
    () => (data.equipment == null ? inferEquipment(data.steps) : []),
    [data.equipment, data.steps],
  )

  function toggleEquipment(item: Equipment) {
    setData((prev) => {
      const current = prev.equipment ?? []
      const next = current.includes(item)
        ? current.filter((e) => e !== item)
        : [...current, item]
      return { ...prev, equipment: next }
    })
  }

  function acceptSuggestedMinutes() {
    if (suggestedMinutes != null) setData((prev) => ({ ...prev, totalMin: suggestedMinutes }))
  }

  function acceptSuggestedEquipment() {
    setData((prev) => ({ ...prev, equipment: [...(prev.equipment ?? []), ...suggestedEquipment] }))
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
      {data.sourceUrl && (
        <p className="screen__placeholder" data-testid="my-recipe-source-url">
          Imported from{' '}
          <a href={data.sourceUrl} target="_blank" rel="noreferrer">
            {data.sourceUrl}
          </a>
        </p>
      )}

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

      {/* S12b #3 (R13): optional filter fields — "under N minutes", "one pot" and "use only
          equipment" in Cook now apply to a My Recipe too, and exclude it (rather than pass it
          through) while any of these three is unset. */}
      <label className="settings-field">
        Total minutes
        <input
          type="number"
          min={0}
          value={data.totalMin ?? ''}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              totalMin: e.target.value === '' ? null : Number(e.target.value) || 0,
            }))
          }
        />
      </label>
      {suggestedMinutes != null && (
        <p className="screen__placeholder" data-testid="suggested-total-min">
          Steps suggest {suggestedMinutes} min total.{' '}
          <button type="button" onClick={acceptSuggestedMinutes}>
            Use {suggestedMinutes} min
          </button>
        </p>
      )}

      <fieldset className="settings-group">
        <legend>One pot</legend>
        <label className="settings-checkbox">
          <input
            type="radio"
            name="one-pot"
            checked={data.onePot === true}
            onChange={() => setData((prev) => ({ ...prev, onePot: true }))}
          />
          Yes
        </label>
        <label className="settings-checkbox">
          <input
            type="radio"
            name="one-pot"
            checked={data.onePot === false}
            onChange={() => setData((prev) => ({ ...prev, onePot: false }))}
          />
          No
        </label>
        <label className="settings-checkbox">
          <input
            type="radio"
            name="one-pot"
            checked={data.onePot == null}
            onChange={() => setData((prev) => ({ ...prev, onePot: null }))}
          />
          Not set
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Equipment</legend>
        {KITCHEN_EQUIPMENT.map((item) => (
          <label key={item} className="settings-checkbox">
            <input
              type="checkbox"
              checked={(data.equipment ?? []).includes(item)}
              onChange={() => toggleEquipment(item)}
            />
            {KITCHEN_EQUIPMENT_LABELS[item]}
          </label>
        ))}
      </fieldset>
      {suggestedEquipment.length > 0 && (
        <p className="screen__placeholder" data-testid="suggested-equipment">
          Steps suggest{' '}
          {suggestedEquipment.map((item) => KITCHEN_EQUIPMENT_LABELS[item]).join(', ')}.{' '}
          <button type="button" onClick={acceptSuggestedEquipment}>
            Use these
          </button>
        </p>
      )}

      <h3>Ingredients</h3>
      <ul className="editor-ingredients">
        {data.ingredients.map((line, i) => {
          const items = parsed[i]?.items ?? []
          const status = lineStatus(items)
          return (
            <li key={i} className="editor-ingredient">
              <div className="editor-ingredient-row">
                <input
                  type="text"
                  aria-label={`Ingredient ${i + 1}`}
                  placeholder="e.g. 2 cups chopped cilantro"
                  value={lineText(line)}
                  onChange={(e) => updateIngredientText(i, e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ingredient ${i + 1}`}
                  onClick={() => removeIngredient(i)}
                >
                  ×
                </button>
              </div>
              {lineText(line).trim() && (
                <p
                  className={`editor-understood editor-understood--${status}`}
                  data-testid={`ingredient-understood-${i + 1}`}
                  data-status={status}
                >
                  {status === 'empty'
                    ? 'Heading: not an ingredient'
                    : status === 'none'
                      ? 'Not understood: this line stays as typed and goes to "Check these"'
                      : describeItems(items)}
                </p>
              )}
            </li>
          )
        })}
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

      {!isNew && id && (
        <AddToPlanControl
          recipeId={id}
          recipeSource="my"
          recipeTitle={title || 'Untitled recipe'}
        />
      )}
    </section>
  )
}
