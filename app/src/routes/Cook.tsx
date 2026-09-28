import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchIngredientSlugs } from '../corpus/slugs'
import { CUISINE_VALUES, type Cuisine, type Equipment } from '../corpus/types'
import {
  compareResults,
  DEFAULT_MATCH_LIMIT,
  matchRecipes,
  missingSummary,
  type MatchOutput,
  type MatchQuery,
  type MatchResult,
} from '../features/cook/engine'
import { cuisineLabel, equipmentLabel } from '../features/cook/labels'
import { displayName } from '../features/cook/taxonomy'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { listFavoriteIds, setFavorite } from '../features/favorites/favoritesRepo'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import { listMyRecipes } from '../features/myRecipes/myRecipesRepo'
import { matchMyRecipes, type HiddenMyRecipe } from '../features/myRecipes/myRecipeMatch'
import type { MyRecipe } from '../features/myRecipes/types'
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import { listKitchenEquipment } from '../features/settings/settingsRepo'
import { KITCHEN_EQUIPMENT } from '../data/equipment'
import { PANTRY_DEFAULT_SLUGS } from '../db'
import { DIET_PRESET_LABELS, useDiet } from '../state/diet'

/** "Under 30 min" (the weeknight line in docs/PRODUCT.md). */
const QUICK_MINUTES = 30

/** A short label for the diet the "veg: swap chicken → tofu" line names (S6b #3, D16). */
const DIET_SWAP_LABEL: Partial<Record<string, string>> = {
  vegetarian: 'veg',
  no_red_meat: 'no red meat',
}

/** "3 of your recipes hidden: no time set, no equipment set" — every distinct reason across
 * `hidden`, in the order first seen. */
function hiddenMineReasons(hidden: HiddenMyRecipe[]): string {
  const seen: string[] = []
  for (const entry of hidden) {
    for (const reason of entry.reasons) if (!seen.includes(reason)) seen.push(reason)
  }
  return seen.join(', ')
}

/**
 * "What can I cook?" (S6). The chips start as the kitchen list and can be edited for this search
 * only; nothing here writes to user.db.
 */
export function Cook() {
  const { status, corpus } = useCorpus()
  const { preset } = useDiet()

  const [have, setHave] = useState<string[] | null>(null)
  const [kitchen, setKitchen] = useState<Equipment[]>([])
  const [query, setQuery] = useState('')
  const [cuisine, setCuisine] = useState<Cuisine | ''>('')
  const [onePot, setOnePot] = useState(false)
  const [quick, setQuick] = useState(false)
  const [showEquipment, setShowEquipment] = useState(false)
  const [useOnly, setUseOnly] = useState<Equipment[]>([])
  const [output, setOutput] = useState<MatchOutput | null>(null)
  // S12b #3 (R13): My Recipes an active filter excludes for having no value set (not for
  // genuinely failing it), so the owner knows why the count dropped instead of guessing.
  const [hiddenMine, setHiddenMine] = useState<HiddenMyRecipe[]>([])
  // S6b #3: staples collapse into one "+ pantry basics (N)" chip, expanded on request.
  const [showStaples, setShowStaples] = useState(false)
  // S11 #1: a star on each result, keyed by recipes.key (corpus favorites) or a My Recipe id.
  // S12b #1: a corpus key and a My Recipe id can collide, so the set holds "<source>:<key>",
  // never a bare key, and both favorite sources are loaded (was corpus-only, so a Mine
  // result's star always read as unfavorited and starring one favorited the corpus recipe
  // of the same key instead).
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())

  function favoriteToken(key: string, source: 'corpus' | 'my') {
    return `${source}:${key}`
  }

  useEffect(() => {
    void Promise.all([listFavoriteIds('corpus'), listFavoriteIds('my')]).then(([corpusIds, myIds]) => {
      setFavoriteKeys(
        new Set([
          ...corpusIds.map((id) => favoriteToken(id, 'corpus')),
          ...myIds.map((id) => favoriteToken(id, 'my')),
        ]),
      )
    })
  }, [])

  async function toggleFavorite(key: string, source: 'corpus' | 'my') {
    const token = favoriteToken(key, source)
    const next = !favoriteKeys.has(token)
    setFavoriteKeys((current) => {
      const updated = new Set(current)
      if (next) updated.add(token)
      else updated.delete(token)
      return updated
    })
    await setFavorite(key, next, source)
  }

  // S12: My Recipes joined into results below, marked "Mine" (features/myRecipes/myRecipeMatch.ts).
  const [myRecipes, setMyRecipes] = useState<MyRecipe[]>([])

  useEffect(() => {
    let mounted = true
    void Promise.all([listKitchenItems(), listKitchenEquipment()]).then(([items, owned]) => {
      if (!mounted) return
      setHave(items.map((item) => item.ingredientId))
      setKitchen([...owned] as Equipment[])
    })
    void listMyRecipes().then((recipes) => {
      if (mounted) setMyRecipes(recipes)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!corpus || have === null) return
    let current = true
    const query: MatchQuery = {
      have,
      cuisine: cuisine || null,
      diet: preset,
      kitchen,
      useOnly,
      onePot,
      maxMinutes: quick ? QUICK_MINUTES : null,
    }
    void Promise.all([
      matchRecipes(corpus.db, query),
      matchMyRecipes(corpus.db, corpus.tax, myRecipes, query),
    ]).then(([sql, mine]) => {
      if (!current) return
      const results = [...sql.results, ...mine.results]
        .sort(compareResults)
        .slice(0, DEFAULT_MATCH_LIMIT)
      setOutput({
        results,
        stats: { candidates: sql.stats.candidates + mine.results.length, scored: sql.stats.scored },
      })
      setHiddenMine(mine.hidden)
    })
    return () => {
      current = false
    }
  }, [corpus, have, cuisine, preset, kitchen, useOnly, onePot, quick, myRecipes])

  const suggestions = useMemo(
    () => searchIngredientSlugs(query, 8).filter((s) => !have?.includes(s.slug)),
    [query, have],
  )
  // "Use only…" picks from what the kitchen has; with no kitchen set up, from the whole list.
  const equipmentChoices: Equipment[] = kitchen.length > 0 ? kitchen : [...KITCHEN_EQUIPMENT]

  function addHave(slug: string) {
    setHave((list) => (list && !list.includes(slug) ? [...list, slug] : list))
    setQuery('')
  }

  function removeHave(slug: string) {
    setHave((list) => list?.filter((s) => s !== slug) ?? list)
  }

  function toggleUseOnly(equipment: Equipment) {
    setUseOnly((list) =>
      list.includes(equipment) ? list.filter((e) => e !== equipment) : [...list, equipment],
    )
  }

  const nameOf = (slug: string) =>
    corpus ? displayName(corpus.tax, slug) : slug.replace(/_/g, ' ')
  const notReady = corpus ? null : (corpusStatusText(status) ?? 'Opening the recipe library…')

  // S6b #3: staples (is_staple, plus the pantry defaults every kitchen starts with) collapse
  // into one "+ pantry basics (N)" chip instead of crowding the "what you have" row.
  const isStaple = (slug: string) =>
    corpus?.tax.staples.has(slug) || (PANTRY_DEFAULT_SLUGS as readonly string[]).includes(slug)
  const staples = (have ?? []).filter(isStaple)
  const nonStaples = (have ?? []).filter((slug) => !isStaple(slug))

  // S6b #3, D16: a recipe the diet made "adaptable" (its main protein swaps out) gets a small
  // line naming the swap, e.g. "veg: swap chicken → tofu" — only when a diet filter is active,
  // since the engine only returns `diet` for the currently selected preset.
  function dietSwapLine(result: MatchResult): string | null {
    if (result.diet?.status !== 'adaptable' || result.diet.swaps.length === 0) return null
    const label = DIET_SWAP_LABEL[preset] ?? DIET_PRESET_LABELS[preset]
    const swap = result.diet.swaps[0]
    const action = swap.use ? `swap ${swap.item} → ${swap.use}` : `leave out ${swap.item}`
    return `${label}: ${action}`
  }

  function chip(slug: string) {
    return (
      <li key={slug}>
        <span className="chip chip--removable">
          {nameOf(slug)}
          <button
            type="button"
            className="chip__remove"
            aria-label={`Remove ${nameOf(slug)}`}
            onClick={() => removeHave(slug)}
          >
            ×
          </button>
        </span>
      </li>
    )
  }

  return (
    <section className="screen" data-testid="screen-cook">
      <h2>What can I cook?</h2>

      <div className="cook-have" role="group" aria-label="What you have">
        <p className="cook-label">What you have (for this search)</p>
        <ul className="chip-list">
          {nonStaples.map(chip)}
          {staples.length > 0 && (
            <li>
              <button
                type="button"
                className="chip"
                aria-expanded={showStaples}
                onClick={() => setShowStaples((v) => !v)}
              >
                {showStaples ? 'Pantry basics ▾' : `+ pantry basics (${staples.length})`}
              </button>
            </li>
          )}
          {showStaples && staples.map(chip)}
        </ul>
        <div className="kitchen-add">
          <label htmlFor="cook-add">Add an ingredient</label>
          <input
            id="cook-add"
            type="text"
            value={query}
            placeholder="e.g. chickpeas, paneer…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {suggestions.length > 0 && (
            <ul className="kitchen-suggestions">
              {suggestions.map((s) => (
                <li key={s.slug}>
                  <button type="button" onClick={() => addHave(s.slug)}>
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="cook-filters">
        <label className="settings-field">
          Cuisine
          <select value={cuisine} onChange={(e) => setCuisine(e.target.value as Cuisine | '')}>
            <option value="">Any cuisine</option>
            {CUISINE_VALUES.map((c) => (
              <option key={c} value={c}>
                {cuisineLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <div className="chip-list" role="group" aria-label="Filters">
          <button
            type="button"
            className="chip"
            aria-pressed={onePot}
            onClick={() => setOnePot((v) => !v)}
          >
            One pot
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={quick}
            onClick={() => setQuick((v) => !v)}
          >
            Under {QUICK_MINUTES} min
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={useOnly.length > 0}
            aria-expanded={showEquipment}
            onClick={() => setShowEquipment((v) => !v)}
          >
            {useOnly.length > 0 ? `Use only: ${useOnly.length}` : 'Equipment'}
          </button>
        </div>
        {showEquipment && (
          <div className="cook-equipment">
            <p className="cook-label">
              Use only…
              {kitchen.length === 0 && ' (set "My kitchen has" in Settings to shorten this list)'}
            </p>
            <div className="chip-list" role="group" aria-label="Use only">
              {equipmentChoices.map((equipment) => (
                <button
                  key={equipment}
                  type="button"
                  className="chip"
                  aria-pressed={useOnly.includes(equipment)}
                  onClick={() => toggleUseOnly(equipment)}
                >
                  {equipmentLabel(equipment)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {notReady && <p className="screen__placeholder">{notReady}</p>}

      {corpus && output && (
        <>
          <p className="cook-count" data-testid="cook-count">
            {output.stats.candidates === 0
              ? 'No recipes match yet. Add what you have, or loosen a filter.'
              : `${output.stats.candidates} ${output.stats.candidates === 1 ? 'recipe' : 'recipes'}` +
                (output.results.length < output.stats.candidates
                  ? `, best ${output.results.length} shown`
                  : '') +
                (preset !== 'everything' ? ` · ${DIET_PRESET_LABELS[preset]}` : '')}
          </p>
          {hiddenMine.length > 0 && (
            <p className="cook-hidden-mine" data-testid="cook-hidden-mine">
              {hiddenMine.length} of your {hiddenMine.length === 1 ? 'recipe' : 'recipes'} hidden:{' '}
              {hiddenMineReasons(hiddenMine)}
            </p>
          )}
          <ul className="cook-results" data-testid="cook-results">
            {output.results.map((result) => {
              const summary = missingSummary(result)
              const swapLine = dietSwapLine(result)
              const detailHref = result.mine
                ? `/my-recipes/${encodeURIComponent(result.key)}`
                : `/recipe/${encodeURIComponent(result.key)}`
              return (
                <li
                  key={`${result.mine ? 'my' : 'corpus'}-${result.key}`}
                  className="cook-result"
                  data-mine={result.mine ? 'true' : undefined}
                >
                  <Link to={detailHref} state={{ have }}>
                    <span className="cook-result__title">
                      {result.title}
                      {result.mine && <span className="cook-result__mine"> · Mine</span>}
                    </span>
                    <span className="cook-result__meta">
                      {result.covered}/{result.needed} ingredients
                      {result.cuisine ? ` · ${cuisineLabel(result.cuisine)}` : ''}
                      {result.totalMin !== null ? ` · ${result.totalMin} min` : ''}
                      {result.diet?.status === 'adaptable' ? ' · adaptable' : ''}
                    </span>
                    <span className="cook-result__missing">{summary ?? 'You have everything'}</span>
                    {swapLine && (
                      <span className="cook-result__diet-swap" data-testid="cook-result-diet-swap">
                        {swapLine}
                      </span>
                    )}
                  </Link>
                  <button
                    type="button"
                    aria-pressed={favoriteKeys.has(favoriteToken(result.key, result.mine ? 'my' : 'corpus'))}
                    aria-label={
                      favoriteKeys.has(favoriteToken(result.key, result.mine ? 'my' : 'corpus'))
                        ? `Remove favorite: ${result.title}`
                        : `Add favorite: ${result.title}`
                    }
                    className="cook-result__favorite"
                    onClick={() => void toggleFavorite(result.key, result.mine ? 'my' : 'corpus')}
                  >
                    {favoriteKeys.has(favoriteToken(result.key, result.mine ? 'my' : 'corpus')) ? '★' : '☆'}
                  </button>
                  <AddToPlanControl
                    recipeId={result.key}
                    recipeSource={result.mine ? 'my' : 'corpus'}
                    recipeTitle={result.title}
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
