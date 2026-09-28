import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  corpusScale,
  formatLine,
  loadCorpusRecipe,
  recipeSwaps,
  type CorpusRecipe,
} from '../features/cook/corpusRecipe'
import { cuisineLabel, equipmentLabel } from '../features/cook/labels'
import { swapLabel, type SwapOption } from '../features/cook/swaps'
import { expandHave } from '../features/cook/taxonomy'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import { getSettings, type AppSettings } from '../features/settings/settingsRepo'
import type { UnitSystem } from '../features/units/units'
import { DIET_PRESET_LABELS, useDiet } from '../state/diet'

/**
 * A corpus recipe (S6): ingredients scaled (D11) and converted (metric / US), each with its best
 * swap from the substitution table, then steps, equipment and time. `have` comes from the Cook
 * search that linked here (router state), else from the kitchen list.
 */
export function CorpusRecipeDetail({ recipeKey }: { recipeKey: string }) {
  const { status, corpus } = useCorpus()
  const { preset } = useDiet()
  const location = useLocation()
  const fromSearch = (location.state as { have?: string[] } | null)?.have ?? null

  const [recipe, setRecipe] = useState<CorpusRecipe | null | undefined>(undefined)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [units, setUnits] = useState<UnitSystem>('metric')
  const [have, setHave] = useState<string[] | null>(fromSearch)
  const [swaps, setSwaps] = useState<Map<string, SwapOption>>(new Map())

  useEffect(() => {
    void getSettings().then((s) => {
      setSettings(s)
      setUnits(s.units)
    })
    if (!fromSearch) {
      void listKitchenItems().then((items) => setHave(items.map((i) => i.ingredientId)))
    }
  }, [fromSearch])

  useEffect(() => {
    if (!corpus) return
    let current = true
    void loadCorpusRecipe(corpus.db, corpus.tax, recipeKey, preset).then((loaded) => {
      if (current) setRecipe(loaded)
    })
    return () => {
      current = false
    }
  }, [corpus, recipeKey, preset])

  const haveSet = corpus && have ? expandHave(corpus.tax, have) : null

  useEffect(() => {
    if (!corpus || !recipe || !have) return
    let current = true
    void recipeSwaps(corpus.db, corpus.tax, recipe, expandHave(corpus.tax, have), preset).then(
      (found) => {
        if (current) setSwaps(found)
      },
    )
    return () => {
      current = false
    }
  }, [corpus, recipe, have, preset])

  if (!corpus || recipe === undefined) {
    return (
      <section className="screen" data-testid="screen-recipe-detail">
        <p className="screen__placeholder">
          {corpusStatusText(status) ?? 'Opening the recipe library…'}
        </p>
      </section>
    )
  }
  if (recipe === null) {
    return (
      <section className="screen" data-testid="screen-recipe-detail">
        <p className="screen__placeholder">Recipe not found.</p>
      </section>
    )
  }

  const people = settings?.peopleDefault ?? 2
  const perPerson = settings?.servingsPerPerson ?? 1.5
  const { factor, target } = corpusScale(recipe, people, perPerson)
  const dietSwapFor = new Map(
    (recipe.diet?.status === 'adaptable' ? recipe.diet.swaps : [])
      .filter((s) => s.slug)
      .map((s) => [s.slug as string, s]),
  )

  return (
    <section className="screen" data-testid="screen-recipe-detail">
      <div className="recipe-detail__header">
        <h2>{recipe.title}</h2>
        <AddToPlanControl recipeId={recipe.key} recipeSource="corpus" recipeTitle={recipe.title} />
      </div>

      <div className="recipe-detail__meta">
        <span>
          {target !== null
            ? `Serves ${target} (for ${people} people × ${perPerson}/person, recipe makes ${recipe.servings})`
            : `Makes: ${recipe.yieldText ?? 'amount not given'} (not scaled)`}
        </span>
        <label>
          Units
          <select value={units} onChange={(e) => setUnits(e.target.value as UnitSystem)}>
            <option value="metric">Metric</option>
            <option value="us">US</option>
          </select>
        </label>
      </div>

      <p className="recipe-detail__facts" data-testid="recipe-facts">
        {[
          recipe.totalMin !== null ? `${recipe.totalMin} min total` : 'Time not given',
          recipe.activeMin !== null ? `${recipe.activeMin} min hands-on` : null,
          recipe.cuisine ? cuisineLabel(recipe.cuisine) : null,
          recipe.onePot ? 'One pot' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {(recipe.equipment.length > 0 || recipe.noCook) && (
        <ul className="chip-list" aria-label="Equipment">
          {recipe.noCook && <li className="chip">No cooking</li>}
          {recipe.equipment.map((e) => (
            <li key={e} className="chip">
              {equipmentLabel(e)}
            </li>
          ))}
        </ul>
      )}

      {recipe.diet && preset !== 'everything' && (
        <p className="recipe-detail__diet" data-testid="recipe-diet">
          {DIET_PRESET_LABELS[preset]}:{' '}
          {recipe.diet.status === 'ok'
            ? 'fits as written'
            : recipe.diet.status === 'adaptable'
              ? 'fits with the swaps marked below'
              : recipe.diet.status === 'no'
                ? 'does not fit'
                : 'not known'}
        </p>
      )}

      <h3>Ingredients</h3>
      <ul className="recipe-detail__ingredients corpus-ingredients">
        {recipe.lines.map((line) => {
          const lacking = !!(line.slug && haveSet && !haveSet.has(line.slug) && !line.optional)
          const swap = line.slug ? swaps.get(line.slug) : undefined
          const dietSwap = line.slug ? dietSwapFor.get(line.slug) : undefined
          return (
            <li
              key={line.position}
              className={lacking ? 'corpus-line corpus-line--missing' : 'corpus-line'}
            >
              <span>{formatLine(line, factor, units, corpus.units, corpus.tax)}</span>
              {lacking && <span className="corpus-line__tag">missing</span>}
              {dietSwap && (
                <span className="corpus-line__swap" data-testid="diet-swap">
                  {DIET_PRESET_LABELS[preset]}:{' '}
                  {dietSwap.use ? `use ${dietSwap.use}` : 'leave it out'}
                </span>
              )}
              {swap && (
                <span className="corpus-line__swap" data-testid="line-swap">
                  swap: {swapLabel(swap)}
                  {swap.haveAll ? ' (you have these)' : ''}
                  {swap.note ? ` · ${swap.note}` : ''}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <h3>Steps</h3>
      <ol className="recipe-detail__steps">
        {recipe.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>

      {recipe.sourceUrl && (
        <p className="recipe-detail__source">
          <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
            Original recipe
          </a>
        </p>
      )}
    </section>
  )
}
