import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CheckChip, Segmented, Stepper } from '../components/ui/Controls'
import { Icon } from '../components/ui/Icon'
import { Skeleton } from '../components/ui/Section'
import { useSnackbar } from '../components/ui/Snackbar'
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

type OnePotChoice = 'yes' | 'no' | 'unset'

/**
 * The My Recipe editor (S12, S13; S22b layout). Sections as cards: the basics, the fields Cook's
 * filters read, the ingredient lines (each with what the parser understood right under it), the
 * steps as numbered cards, and notes. Save sits in a bar at the bottom.
 */
export function MyRecipeEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const location = useLocation()
  const { show } = useSnackbar()
  // "Import from link" (S12): the import screen hands its parsed preview here as router state,
  // pre-filling a new recipe instead of starting blank. Only meaningful for a new recipe. "Make
  // my version" on a corpus recipe (S22b) hands its lines over the same way.
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
      show({ message: 'Recipe saved' })
      return
    }
    if (!id) return
    await updateMyRecipe(id, title, data)
    show({ message: 'Changes saved' })
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
      <section className="screen screen--editor" data-testid="screen-my-recipe-editor">
        <Skeleton className="skeleton--title" />
        <p className="visually-hidden" role="status">
          Loading…
        </p>
      </section>
    )
  }

  const parent = parentRecipeId ? findFixtureRecipe(parentRecipeId) : undefined
  const onePot: OnePotChoice = data.onePot === true ? 'yes' : data.onePot === false ? 'no' : 'unset'

  return (
    <section className="screen screen--editor" data-testid="screen-my-recipe-editor">
      <header className="editor-head">
        {!isNew && <p className="kicker">{parent ? 'My version' : 'Editing'}</p>}
        <h2 className="display editor-head__title">
          {isNew ? title || 'New recipe' : title || 'Untitled recipe'}
        </h2>
        {parent && <p className="note-line">Forked from {parent.title}.</p>}
        {data.sourceUrl && (
          <p className="note-line editor-head__source" data-testid="my-recipe-source-url">
            Imported from{' '}
            <a href={data.sourceUrl} target="_blank" rel="noreferrer">
              {data.sourceUrl}
            </a>
          </p>
        )}
        {!isNew && id && (
          <Link to={`/my-recipes/${encodeURIComponent(id)}/view`} className="button button--text">
            <Icon name="book" size={18} />
            View as recipe
          </Link>
        )}
      </header>

      {diff && (
        <div className="card fork-diff" data-testid="fork-diff">
          <h3 className="card__title">Changes from {parent?.title ?? 'the original'}</h3>
          {diff.ingredientsAdded.length === 0 &&
            diff.ingredientsRemoved.length === 0 &&
            diff.ingredientsChanged.length === 0 &&
            diff.stepsChanged.length === 0 && <p>No changes yet.</p>}
          {diff.ingredientsAdded.length > 0 && (
            <p>
              <strong>Added:</strong>{' '}
              {diff.ingredientsAdded.map((line) => line.canonicalIngredient).join(', ')}
            </p>
          )}
          {diff.ingredientsRemoved.length > 0 && (
            <p>
              <strong>Removed:</strong>{' '}
              {diff.ingredientsRemoved.map((line) => line.canonicalIngredient).join(', ')}
            </p>
          )}
          {diff.ingredientsChanged.length > 0 && (
            <p>
              <strong>Changed:</strong>{' '}
              {diff.ingredientsChanged
                .map(
                  (c) =>
                    `${c.ingredient} (${c.parent.quantity ?? '—'} ${c.parent.unit ?? ''} → ${c.fork.quantity ?? '—'} ${c.fork.unit ?? ''})`,
                )
                .join('; ')}
            </p>
          )}
          {diff.stepsChanged.length > 0 && (
            <p>
              <strong>Steps changed:</strong> step{' '}
              {diff.stepsChanged.map((s) => s.index + 1).join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="card editor-card">
        <h3 className="card__title">The basics</h3>
        <label className="field">
          <span className="field__label">Title</span>
          <input
            className="field__control"
            type="text"
            value={title}
            placeholder="What do you call it?"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="field field--row">
          <span className="field__label">Servings</span>
          <Stepper
            label="servings"
            value={data.servings}
            onChange={(servings) => setData((prev) => ({ ...prev, servings }))}
          />
        </div>
        <label className="field">
          <span className="field__label">Cuisine</span>
          <input
            className="field__control"
            type="text"
            value={data.cuisine ?? ''}
            placeholder="e.g. thai"
            onChange={(e) =>
              setData((prev) => ({ ...prev, cuisine: (e.target.value || null) as Cuisine | null }))
            }
          />
        </label>
        <label className="field">
          <span className="field__label">Tags (comma separated)</span>
          <input
            className="field__control"
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
      </div>

      <div className="card editor-card">
        <h3 className="card__title">Ingredients</h3>
        <p className="card__lede">One per line, as you would write it. What was understood shows underneath.</p>
        <ul className="editor-ingredients">
          {data.ingredients.map((line, i) => {
            const items = parsed[i]?.items ?? []
            const status = lineStatus(items)
            return (
              <li key={i} className="editor-ingredient">
                <div className="editor-ingredient-row">
                  <input
                    type="text"
                    className="field__control"
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
                    <Icon name="close" size={20} />
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
        <button type="button" className="button button--quiet editor-add" onClick={addIngredient}>
          + Ingredient
        </button>
      </div>

      <div className="card editor-card">
        <h3 className="card__title">Steps</h3>
        <ol className="editor-steps">
          {data.steps.map((step, i) => (
            <li key={i} className="editor-step">
              <div className="editor-step__head">
                <span className="step-card__number" aria-hidden="true">
                  {i + 1}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => removeStep(i)}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
              <textarea
                className="field__control"
                aria-label={`Step ${i + 1}`}
                rows={3}
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
              />
            </li>
          ))}
        </ol>
        <button type="button" className="button button--quiet editor-add" onClick={addStep}>
          + Step
        </button>
      </div>

      {/* S12b #3 (R13): optional filter fields — "under N minutes", "one pot" and "use only
          equipment" in Cook now apply to a My Recipe too, and exclude it (rather than pass it
          through) while any of these three is unset. */}
      <div className="card editor-card">
        <h3 className="card__title">For Cook’s filters</h3>
        <p className="card__lede">Leave these unset and Cook’s time, one-pot and equipment filters skip this recipe.</p>
        <label className="field">
          <span className="field__label">Total minutes</span>
          <input
            className="field__control field__control--short"
            type="number"
            inputMode="numeric"
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
          <p className="suggestion" data-testid="suggested-total-min">
            <Icon name="clock" size={18} />
            <span>Steps suggest {suggestedMinutes} min total. </span>
            <button type="button" className="button button--text" onClick={acceptSuggestedMinutes}>
              Use {suggestedMinutes} min
            </button>
          </p>
        )}

        <div className="field">
          <span className="field__label" id="one-pot-label">
            One pot
          </span>
          <Segmented<OnePotChoice>
            label="One pot"
            value={onePot}
            onChange={(choice) =>
              setData((prev) => ({
                ...prev,
                onePot: choice === 'yes' ? true : choice === 'no' ? false : null,
              }))
            }
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
              { value: 'unset', label: 'Not set' },
            ]}
          />
        </div>

        <div className="field">
          <span className="field__label">Equipment</span>
          <div className="check-chips" role="group" aria-label="Equipment">
            {KITCHEN_EQUIPMENT.map((item) => (
              <CheckChip
                key={item}
                label={KITCHEN_EQUIPMENT_LABELS[item]}
                checked={(data.equipment ?? []).includes(item)}
                onChange={() => toggleEquipment(item)}
              />
            ))}
          </div>
        </div>
        {suggestedEquipment.length > 0 && (
          <p className="suggestion" data-testid="suggested-equipment">
            <Icon name="pot" size={18} />
            <span>
              Steps suggest{' '}
              {suggestedEquipment.map((item) => KITCHEN_EQUIPMENT_LABELS[item]).join(', ')}.{' '}
            </span>
            <button type="button" className="button button--text" onClick={acceptSuggestedEquipment}>
              Use these
            </button>
          </p>
        )}
      </div>

      <div className="card editor-card">
        <label className="field">
          <span className="field__label card__title">Notes</span>
          <textarea
            className="field__control"
            rows={3}
            value={data.notes}
            onChange={(e) => setData((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </label>
      </div>

      <div className="action-bar">
        {!isNew && id && (
          <AddToPlanControl
            recipeId={id}
            recipeSource="my"
            recipeTitle={title || 'Untitled recipe'}
            variant="pill"
          />
        )}
        <button
          type="button"
          className="button button--primary action-bar__button"
          onClick={() => void save()}
        >
          <Icon name="check" size={20} />
          Save
        </button>
      </div>
    </section>
  )
}
