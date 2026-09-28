import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  RecipeDetailView,
  StarButton,
  type DetailIngredient,
} from '../components/recipe/RecipeDetailView'
import { Icon } from '../components/ui/Icon'
import { EmptyState, Skeleton } from '../components/ui/Section'
import { avoidListFrom, expandAvoid, type AvoidList } from '../features/cook/avoid'
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
import { isFavorite, setFavorite } from '../features/favorites/favoritesRepo'
import type { ImportedRecipe } from '../features/importUrl/types'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import {
  getSettings,
  listAvoidIngredients,
  type AppSettings,
} from '../features/settings/settingsRepo'
import type { UnitSystem } from '../features/units/units'
import { DIET_PRESET_LABELS, useDiet } from '../state/diet'

/** A corpus recipe as the editor's starting point ("Make my version"): its lines as written. */
function toImported(recipe: CorpusRecipe): ImportedRecipe {
  const seen = new Set<number>()
  const lines: string[] = []
  for (const line of recipe.lines) {
    if (seen.has(line.line)) continue
    seen.add(line.line)
    lines.push(line.raw)
  }
  return {
    title: recipe.title,
    sourceUrl: recipe.sourceUrl,
    servingsText: recipe.servings !== null ? String(recipe.servings) : recipe.yieldText,
    prepMin: null,
    cookMin: null,
    totalMin: recipe.totalMin,
    ingredients: lines,
    steps: recipe.steps,
    image: recipe.imageUrl,
    cuisine: recipe.cuisine ? cuisineLabel(recipe.cuisine) : null,
    category: null,
  }
}

/** A loading stand-in shaped like the detail: the hero, a title and a few lines. */
export function DetailSkeleton({ status }: { status: string }) {
  return (
    <div className="detail detail--loading">
      <Skeleton className="detail-hero detail-hero--skeleton" />
      <div className="detail-head">
        <Skeleton className="skeleton--title" />
        <Skeleton className="skeleton--text" style={{ width: '45%' }} />
      </div>
      <p className="status-line" role="status">
        {status}
      </p>
    </div>
  )
}

/**
 * A corpus recipe (S6, S22b layout): ingredients scaled (D11) and converted (metric / US), each
 * with its best swap from the substitution table, then steps (or the video), nutrition and the
 * source. `have` comes from the Cook search that linked here (router state), else from the
 * kitchen list.
 */
export function CorpusRecipeDetail({ recipeKey }: { recipeKey: string }) {
  const { status, corpus } = useCorpus()
  const { preset } = useDiet()
  const location = useLocation()
  const navigate = useNavigate()
  const fromSearch = (location.state as { have?: string[] } | null)?.have ?? null

  const [recipe, setRecipe] = useState<CorpusRecipe | null | undefined>(undefined)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [people, setPeople] = useState<number | null>(null)
  const [units, setUnits] = useState<UnitSystem>('metric')
  const [have, setHave] = useState<string[] | null>(fromSearch)
  const [swaps, setSwaps] = useState<Map<string, SwapOption>>(new Map())
  const [favorite, setFavoriteState] = useState(false)
  // S16: "ingredients I avoid" (Settings) — marks each avoided line below.
  const [avoid, setAvoid] = useState<AvoidList>(new Map())

  useEffect(() => {
    void listAvoidIngredients().then((rows) => setAvoid(avoidListFrom(rows)))
  }, [])

  useEffect(() => {
    void isFavorite(recipeKey, 'corpus').then(setFavoriteState)
  }, [recipeKey])

  async function toggleFavorite() {
    const next = !favorite
    setFavoriteState(next)
    await setFavorite(recipeKey, next, 'corpus')
  }

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
      <section className="screen screen--detail" data-testid="screen-recipe-detail">
        <DetailSkeleton status={corpusStatusText(status) ?? 'Opening the recipe library…'} />
      </section>
    )
  }
  if (recipe === null) {
    return (
      <section className="screen screen--detail" data-testid="screen-recipe-detail">
        <EmptyState icon="search" title="Recipe not found.">
          It may have left the library in an update.
        </EmptyState>
      </section>
    )
  }

  const perPerson = settings?.servingsPerPerson ?? 1.5
  const headCount = people ?? settings?.peopleDefault ?? 2
  const { factor, target } = corpusScale(recipe, headCount, perPerson)
  // S15: a head count the build estimated (the source gave none) is shown as an estimate, and
  // still scales (D11).
  const estimated = recipe.servings !== null && recipe.servingsSource !== 'source'
  const dietSwapFor = new Map(
    (recipe.diet?.status === 'adaptable' ? recipe.diet.swaps : [])
      .filter((s) => s.slug)
      .map((s) => [s.slug as string, s]),
  )
  const expandedAvoid = avoid.size > 0 ? expandAvoid(corpus.tax, avoid) : null

  const ingredients: DetailIngredient[] = recipe.lines.map((line) => {
    const lacking = !!(line.slug && haveSet && !haveSet.has(line.slug) && !line.optional)
    const avoidMode = line.slug ? expandedAvoid?.get(line.slug) : undefined
    const swap = line.slug ? swaps.get(line.slug) : undefined
    const dietSwap = line.slug ? dietSwapFor.get(line.slug) : undefined
    const notes = []
    if (dietSwap) {
      notes.push(
        <span key="diet" className="ingredient__swap" data-testid="diet-swap">
          <Icon name="leaf" size={16} />
          {DIET_PRESET_LABELS[preset]}: {dietSwap.use ? `use ${dietSwap.use}` : 'leave it out'}
        </span>,
      )
    }
    if (swap) {
      notes.push(
        <span key="swap" className="ingredient__swap" data-testid="line-swap">
          <Icon name="swap" size={16} />
          <span>
            swap: {swapLabel(swap)}
            {swap.haveAll ? ' (you have these)' : ''}
            {swap.note ? ` · ${swap.note}` : ''}
          </span>
        </span>,
      )
    }
    return {
      key: line.position,
      text: formatLine(line, factor, units, corpus.units, corpus.tax),
      missing: lacking,
      avoided: avoidMode,
      notes,
    }
  })

  const dietText =
    recipe.diet && preset !== 'everything'
      ? recipe.diet.status === 'ok'
        ? 'fits as written'
        : recipe.diet.status === 'adaptable'
          ? 'fits with the swaps marked below'
          : recipe.diet.status === 'no'
            ? 'does not fit'
            : 'not known'
      : null

  const meta = (
    <>
      <span className="meta__time">
        <Icon name="clock" size={16} />
        {recipe.totalMin !== null ? `${recipe.totalMin} min total` : 'Time not given'}
      </span>
      {recipe.activeMin !== null && <span>{recipe.activeMin} min hands-on</span>}
      {recipe.servings !== null ? (
        estimated ? (
          <span data-testid="servings-estimate">
            Serves about {recipe.servings} (estimated)
            {recipe.yieldText ? ` · makes ${recipe.yieldText}` : ''}
          </span>
        ) : (
          <span>Serves {recipe.servings}</span>
        )
      ) : (
        <span>Makes {recipe.yieldText ?? 'an amount not given'} (not scaled)</span>
      )}
      {recipe.onePot && <span>One pot</span>}
      {dietText && (
        <span
          className={`diet-badge diet-badge--${recipe.diet?.status ?? 'unknown'}`}
          data-testid="recipe-diet"
        >
          <Icon name="leaf" size={14} />
          {DIET_PRESET_LABELS[preset]}: {dietText}
        </span>
      )}
    </>
  )

  return (
    <section className="screen screen--detail" data-testid="screen-recipe-detail">
      <RecipeDetailView
        title={recipe.title}
        imageUrl={recipe.imageUrl}
        cuisine={recipe.cuisine}
        cuisineLabel={recipe.cuisineTag ? cuisineLabel(recipe.cuisineTag) : null}
        meta={meta}
        actions={
          <>
            <StarButton on={favorite} onToggle={() => void toggleFavorite()} />
            <AddToPlanControl
              recipeId={recipe.key}
              recipeSource="corpus"
              recipeTitle={recipe.title}
              variant="pill"
            />
            <button
              type="button"
              className="button button--quiet"
              onClick={() =>
                navigate('/my-recipes/new', { state: { importedRecipe: toImported(recipe) } })
              }
            >
              <Icon name="edit" size={18} />
              Make my version
            </button>
          </>
        }
        servings={
          target !== null
            ? { people: headCount, onPeopleChange: setPeople, target }
            : undefined
        }
        units={{ value: units, onChange: setUnits }}
        intro={
          (recipe.equipment.length > 0 || recipe.noCook) && (
            <ul className="chip-wrap detail-equipment" aria-label="Equipment">
              {recipe.noCook && <li className="chip">No cooking</li>}
              {recipe.equipment.map((e) => (
                <li key={e} className="chip">
                  {equipmentLabel(e)}
                </li>
              ))}
            </ul>
          )
        }
        ingredients={ingredients}
        steps={recipe.steps}
        videoUrl={recipe.videoUrl}
        nutrition={recipe.nutrition}
        sourceUrl={recipe.sourceUrl}
      />
    </section>
  )
}
