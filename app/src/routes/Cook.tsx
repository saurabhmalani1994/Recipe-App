import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DietFilterChip } from '../components/DietFilterChip'
import { BottomSheet, OptionList } from '../components/ui/BottomSheet'
import { Chip, ChipRow, FilterChip } from '../components/ui/Chip'
import { Icon } from '../components/ui/Icon'
import { CoverageMeter, RecipeImage } from '../components/ui/RecipeCard'
import { EmptyState, SectionHeader, Skeleton } from '../components/ui/Section'
import { searchIngredientSlugs } from '../corpus/slugs'
import { CUISINE_VALUES, type Cuisine, type Equipment } from '../corpus/types'
import { avoidListFrom, hiddenNote, mergeHiddenTally, newHiddenTally } from '../features/cook/avoid'
import {
  compareResults,
  DEFAULT_MATCH_LIMIT,
  matchRecipes,
  type MatchOutput,
  type MatchQuery,
  type MatchResult,
} from '../features/cook/engine'
import { imagesForKeys } from '../features/cook/images'
import { cuisineLabel, equipmentLabel } from '../features/cook/labels'
import { displayName } from '../features/cook/taxonomy'
import { corpusStatusText, useCorpus } from '../features/cook/useCorpus'
import { listFavoriteIds, setFavorite } from '../features/favorites/favoritesRepo'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import { listMyRecipes } from '../features/myRecipes/myRecipesRepo'
import { matchMyRecipes, type HiddenMyRecipe } from '../features/myRecipes/myRecipeMatch'
import type { MyRecipe } from '../features/myRecipes/types'
import { AddToPlanControl } from '../features/plan/AddToPlanControl'
import { listAvoidIngredients, listKitchenEquipment } from '../features/settings/settingsRepo'
import { KITCHEN_EQUIPMENT } from '../data/equipment'
import { PANTRY_DEFAULT_SLUGS } from '../db'
import { DIET_PRESET_LABELS, useDiet } from '../state/diet'

/** The Time sheet's choices. "Under 30 min" is the weeknight line in docs/PRODUCT.md. */
const TIME_CHOICES = [20, 30, 45, 60] as const
const TIME_OPTIONS = [
  { value: 'any', label: 'Any time' },
  ...TIME_CHOICES.map((min) => ({ value: String(min), label: `Under ${min} min` })),
] as const

/** Cuisines A-Z by their label, for the Cuisine sheet. */
const CUISINE_OPTIONS = [
  { value: '', label: 'Any cuisine' },
  ...[...CUISINE_VALUES]
    .map((c) => ({ value: c as string, label: cuisineLabel(c) }))
    .sort((a, b) => a.label.localeCompare(b.label)),
]

/** How many missing lines a result card spells out before "+N more". */
const MISSING_SHOWN = 3

type Sheet = 'cuisine' | 'time' | 'equipment' | null

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
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
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
    void Promise.all([listFavoriteIds('corpus'), listFavoriteIds('my')]).then(
      ([corpusIds, myIds]) => {
        setFavoriteKeys(
          new Set([
            ...corpusIds.map((id) => favoriteToken(id, 'corpus')),
            ...myIds.map((id) => favoriteToken(id, 'my')),
          ]),
        )
      },
    )
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
  // S16: "ingredients I avoid" (Settings). Applied to both the SQL and Mine sides below.
  const [avoid, setAvoid] = useState<ReturnType<typeof avoidListFrom>>(new Map())

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
    void listAvoidIngredients().then((rows) => {
      if (mounted) setAvoid(avoidListFrom(rows))
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
      maxMinutes,
      avoid,
    }
    void Promise.all([
      matchRecipes(corpus.db, query),
      matchMyRecipes(corpus.db, corpus.tax, myRecipes, query),
    ]).then(([sql, mine]) => {
      if (!current) return
      const results = [...sql.results, ...mine.results]
        .sort(compareResults)
        .slice(0, DEFAULT_MATCH_LIMIT)
      const hidden = newHiddenTally()
      mergeHiddenTally(hidden, sql.stats.hidden)
      mergeHiddenTally(hidden, mine.avoidHidden)
      setOutput({
        results,
        stats: {
          candidates: sql.stats.candidates + mine.results.length,
          scored: sql.stats.scored,
          hidden,
        },
      })
      setHiddenMine(mine.hidden)
    })
    return () => {
      current = false
    }
  }, [corpus, have, cuisine, preset, kitchen, useOnly, onePot, maxMinutes, myRecipes, avoid])

  // S22a: photos for the result cards (corpus recipes only; My Recipes have none).
  const [images, setImages] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!corpus || !output) return
    let current = true
    const keys = output.results.filter((r) => !r.mine).map((r) => r.key)
    void imagesForKeys(corpus.db, keys).then((map) => {
      if (current) setImages(map)
    })
    return () => {
      current = false
    }
  }, [corpus, output])

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

  const chip = (slug: string) => (
    <li key={slug}>
      <Chip onRemove={() => removeHave(slug)} removeLabel={`Remove ${nameOf(slug)}`}>
        {nameOf(slug)}
      </Chip>
    </li>
  )

  const filtersActive =
    preset !== 'everything' || cuisine !== '' || maxMinutes !== null || onePot || useOnly.length > 0

  // The Diet chip is shared with Home and defaults from Settings, so "Clear filters" leaves it.
  const searchFiltersActive = cuisine !== '' || maxMinutes !== null || onePot || useOnly.length > 0

  function clearFilters() {
    setCuisine('')
    setMaxMinutes(null)
    setOnePot(false)
    setUseOnly([])
  }

  return (
    <section className="screen screen--cook" data-testid="screen-cook">
      <header className="masthead masthead--compact">
        <h2 className="display">What can I cook?</h2>
        <p className="masthead__lede">
          Start from what’s in your kitchen. Changes here are for this search only.
        </p>
      </header>

      <div className="cook-have" role="group" aria-label="What you have">
        <p className="field-label">What you have</p>
        <ul className="chip-wrap">
          {nonStaples.map(chip)}
          {staples.length > 0 && (
            <li>
              <button
                type="button"
                className="chip chip--button"
                aria-expanded={showStaples}
                onClick={() => setShowStaples((v) => !v)}
              >
                <span className="chip__label">
                  {showStaples ? 'Pantry basics' : `+ pantry basics (${staples.length})`}
                </span>
                <Icon
                  name="chevronDown"
                  size={16}
                  className={showStaples ? 'icon--flip' : undefined}
                />
              </button>
            </li>
          )}
          {showStaples && staples.map(chip)}
        </ul>
        <div className="search-field">
          <label htmlFor="cook-add" className="visually-hidden">
            Add an ingredient
          </label>
          <Icon name="search" size={20} className="search-field__icon" />
          <input
            id="cook-add"
            type="text"
            value={query}
            autoComplete="off"
            placeholder="Add an ingredient: chickpeas, paneer…"
            onChange={(e) => setQuery(e.target.value)}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((s) => (
                <li key={s.slug}>
                  <button type="button" onClick={() => addHave(s.slug)}>
                    <Icon name="plus" size={18} />
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ChipRow label="Filters">
        <DietFilterChip />
        <FilterChip
          label={cuisine ? cuisineLabel(cuisine) : 'Cuisine'}
          ariaLabel={`Cuisine: ${cuisine ? cuisineLabel(cuisine) : 'any'}`}
          icon="globe"
          active={cuisine !== ''}
          opensSheet
          testId="cuisine-chip"
          onClick={() => setSheet('cuisine')}
        />
        <FilterChip
          label={maxMinutes ? `Under ${maxMinutes} min` : 'Time'}
          ariaLabel={`Time: ${maxMinutes ? `under ${maxMinutes} min` : 'any'}`}
          icon="clock"
          active={maxMinutes !== null}
          opensSheet
          testId="time-chip"
          onClick={() => setSheet('time')}
        />
        <FilterChip
          label="One pot"
          icon="pot"
          toggle
          active={onePot}
          onClick={() => setOnePot((v) => !v)}
        />
        <FilterChip
          label={useOnly.length > 0 ? `Use only: ${useOnly.length}` : 'Equipment'}
          ariaLabel={
            useOnly.length > 0 ? `Equipment: use only ${useOnly.length}` : 'Equipment: any'
          }
          icon="whisk"
          active={useOnly.length > 0}
          opensSheet
          testId="equipment-chip"
          onClick={() => setSheet('equipment')}
        />
      </ChipRow>

      <BottomSheet
        open={sheet === 'cuisine'}
        onClose={() => setSheet(null)}
        title="Cuisine"
        testId="cuisine-sheet"
      >
        <OptionList
          label="Cuisine"
          options={CUISINE_OPTIONS}
          value={cuisine}
          onChange={(value) => {
            setCuisine(value as Cuisine | '')
            setSheet(null)
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'time'}
        onClose={() => setSheet(null)}
        title="Time"
        testId="time-sheet"
      >
        <OptionList
          label="Time"
          options={TIME_OPTIONS}
          value={maxMinutes === null ? 'any' : String(maxMinutes)}
          onChange={(value) => {
            setMaxMinutes(value === 'any' ? null : Number(value))
            setSheet(null)
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'equipment'}
        onClose={() => setSheet(null)}
        title="Use only…"
        testId="equipment-sheet"
        footer={
          <>
            <button
              type="button"
              className="button button--quiet"
              disabled={useOnly.length === 0}
              onClick={() => setUseOnly([])}
            >
              Clear
            </button>
            <button type="button" className="button button--primary" onClick={() => setSheet(null)}>
              Done
            </button>
          </>
        }
      >
        <p className="sheet__lede">
          Only recipes you can make with the equipment you pick.
          {kitchen.length === 0 && ' Set “My kitchen has” in Settings to shorten this list.'}
        </p>
        <div className="option-list" role="group" aria-label="Use only">
          {equipmentChoices.map((equipment) => {
            const on = useOnly.includes(equipment)
            return (
              <button
                key={equipment}
                type="button"
                className={`option${on ? ' option--checked' : ''}`}
                aria-pressed={on}
                onClick={() => toggleUseOnly(equipment)}
              >
                <span className="option__text">
                  <span className="option__label">{equipmentLabel(equipment)}</span>
                </span>
                <span className="option__box" aria-hidden="true">
                  {on && <Icon name="check" size={18} />}
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>

      {notReady && (
        <p className="status-line" role="status">
          {notReady}
        </p>
      )}

      {!output && (
        <ul className="result-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="result-card result-card--skeleton">
              <span className="result-card__link">
                <Skeleton className="result-card__image" />
                <span className="result-card__body">
                  <Skeleton className="skeleton--text" style={{ width: '80%' }} />
                  <Skeleton className="skeleton--text" style={{ width: '50%' }} />
                  <Skeleton className="skeleton--text" style={{ width: '65%' }} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {corpus && output && (
        <>
          <SectionHeader
            title={output.stats.candidates === 0 ? 'No matches yet' : 'Best matches'}
            action={
              searchFiltersActive ? (
                <button type="button" className="button button--text" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
            subtitle={
              <span data-testid="cook-count">
                {output.stats.candidates === 0
                  ? 'No recipes match yet. Add what you have, or loosen a filter.'
                  : `${output.stats.candidates} ${output.stats.candidates === 1 ? 'recipe' : 'recipes'}` +
                    (output.results.length < output.stats.candidates
                      ? `, best ${output.results.length} shown`
                      : '') +
                    (preset !== 'everything' ? ` · ${DIET_PRESET_LABELS[preset]}` : '')}
              </span>
            }
          />
          {hiddenMine.length > 0 && (
            <p className="note-line" data-testid="cook-hidden-mine">
              {hiddenMine.length} of your {hiddenMine.length === 1 ? 'recipe' : 'recipes'} hidden:{' '}
              {hiddenMineReasons(hiddenMine)}
            </p>
          )}
          {hiddenNote(output.stats.hidden) && (
            <p className="note-line" data-testid="cook-hidden-avoid">
              {hiddenNote(output.stats.hidden)}
            </p>
          )}
          {output.results.length === 0 && (
            <EmptyState
              icon="basket"
              title="Nothing to cook with these yet"
              action={
                searchFiltersActive ? (
                  <button type="button" className="button button--secondary" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : undefined
              }
            >
              Add a few more ingredients above{filtersActive ? ', or loosen a filter' : ''}.
            </EmptyState>
          )}
          <ul className="result-list" data-testid="cook-results">
            {output.results.map((result) => {
              const swapLine = dietSwapLine(result)
              const source = result.mine ? 'my' : 'corpus'
              const favorited = favoriteKeys.has(favoriteToken(result.key, source))
              const detailHref = result.mine
                ? `/my-recipes/${encodeURIComponent(result.key)}/view`
                : `/recipe/${encodeURIComponent(result.key)}`
              const missingLines = [
                ...result.substitutable.map((item) => ({
                  key: `s-${item.slug}`,
                  name: item.name,
                  swap: item.swap.components.map((c) => c.name).join(' + '),
                })),
                ...result.missing.map((item, i) => ({
                  key: `m-${item.slug ?? ''}-${i}`,
                  name: item.name,
                  swap: null,
                })),
              ]
              const shown = missingLines.slice(0, MISSING_SHOWN)
              const more = missingLines.length - shown.length
              return (
                <li
                  key={`${source}-${result.key}`}
                  className="result-card"
                  data-mine={result.mine ? 'true' : undefined}
                >
                  <Link to={detailHref} state={{ have }} className="result-card__link">
                    <RecipeImage
                      src={result.mine ? null : images.get(result.key)}
                      title={result.title}
                      cuisine={result.cuisine}
                      className="result-card__image"
                    />
                    <span className="result-card__body">
                      <span className="result-card__title">
                        {result.title}
                        {result.mine && <span className="badge"> Mine</span>}
                      </span>
                      <span className="meta">
                        {result.cuisineTag && <span>{cuisineLabel(result.cuisineTag)}</span>}
                        {result.totalMin !== null && (
                          <span className="meta__time">
                            <Icon name="clock" size={14} />
                            {result.totalMin} min
                          </span>
                        )}
                        {result.diet?.status === 'adaptable' && <span>adaptable</span>}
                      </span>
                      <CoverageMeter covered={result.covered} needed={result.needed} />
                      {missingLines.length === 0 ? (
                        <span className="missing missing--none">
                          <Icon name="check" size={16} />
                          You have everything
                        </span>
                      ) : (
                        <span className="missing" data-testid="cook-result-missing">
                          <span className="missing__label">Missing</span>
                          <span className="missing__items">
                            {shown.map((line) => (
                              <span key={line.key} className="missing__item">
                                <span className="missing__name">{line.name}</span>
                                {line.swap && <span className="missing__swap"> → {line.swap}</span>}
                              </span>
                            ))}
                            {more > 0 && <span className="missing__more">+{more} more</span>}
                          </span>
                        </span>
                      )}
                      {result.avoided.length > 0 && (
                        <span className="result-card__note" data-testid="cook-result-avoided">
                          avoiding: {result.avoided.map((a) => a.name).join(', ')}
                        </span>
                      )}
                      {swapLine && (
                        <span
                          className="result-card__note result-card__note--herb"
                          data-testid="cook-result-diet-swap"
                        >
                          <Icon name="leaf" size={14} />
                          {swapLine}
                        </span>
                      )}
                    </span>
                  </Link>
                  <div className="result-card__actions">
                    <button
                      type="button"
                      aria-pressed={favorited}
                      aria-label={
                        favorited
                          ? `Remove favorite: ${result.title}`
                          : `Add favorite: ${result.title}`
                      }
                      className={`icon-button favorite-button${favorited ? ' favorite-button--on' : ''}`}
                      onClick={() => void toggleFavorite(result.key, source)}
                    >
                      <Icon name="star" filled={favorited} />
                    </button>
                    <AddToPlanControl
                      recipeId={result.key}
                      recipeSource={source}
                      recipeTitle={result.title}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
