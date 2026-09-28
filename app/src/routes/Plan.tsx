import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ingredientName } from '../corpus/slugs'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Segmented, Stepper } from '../components/ui/Controls'
import { Icon } from '../components/ui/Icon'
import { RecipeImage } from '../components/ui/RecipeCard'
import { EmptyState } from '../components/ui/Section'
import { useSnackbar } from '../components/ui/Snackbar'
import { SwipeRow } from '../components/ui/SwipeRow'
import { imagesForKeys } from '../features/cook/images'
import { useCorpus } from '../features/cook/useCorpus'
import { listFavorites } from '../features/favorites/favoritesRepo'
import { resolveFavorites, type FavoriteView } from '../features/favorites/resolve'
import { buildListFromPlan, buildMessage } from '../features/grocery/buildFromPlan'
import {
  MEALS,
  addPlanEntry,
  isoDate,
  listPlanEntries,
  mondayOf,
  movePlanEntry,
  nextWeekStart,
  removePlanEntry,
  setPlanEntryPeople,
  weekDays,
  type Meal,
  type PlanEntry,
  type RecipeSource,
} from '../features/plan/planRepo'
import { lookupPlanRecipe } from '../features/plan/recipeLookup'
import { perishableSlugsForEntry, shareHints } from '../features/plan/shareHints'
import { getSettings, type AppSettings } from '../features/settings/settingsRepo'

const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const SHORT_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** ISO dates are local calendar days: parse them at local noon so no time zone shifts them. */
function localDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

function recipeHref(entry: PlanEntry): string {
  if (entry.recipeSource === 'my') return `/my-recipes/${encodeURIComponent(entry.recipeId)}/view`
  return `/recipe/${encodeURIComponent(entry.recipeId)}`
}

/**
 * The weekly meal planner (brief S7 #1; S22b layout): a "this week / next week" segmented
 * control, then a card per day with a slot per meal. Swipe a planned meal left to remove it (an
 * undo snackbar puts it back); its "…" opens the same options without a swipe (people, move,
 * remove). A soft note says when two days share a perishable. "Build shopping list" builds the
 * list for the week shown and opens it: one tap from here.
 */
export function Plan() {
  const { corpus } = useCorpus()
  const navigate = useNavigate()
  const { show } = useSnackbar()
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const [entries, setEntries] = useState<PlanEntry[] | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [hints, setHints] = useState<Map<string, string[]>>(new Map())
  const [images, setImages] = useState<Map<string, string>>(new Map())
  const [adding, setAdding] = useState<{ day: string; meal: Meal } | null>(null)
  const [editing, setEditing] = useState<PlanEntry | null>(null)
  const [building, setBuilding] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const today = isoDate(new Date())
  const thisWeekStart = mondayOf(new Date())
  const weekStart = week === 'this' ? thisWeekStart : nextWeekStart(thisWeekStart)
  const days = weekDays(weekStart)
  const meals: Meal[] = settings?.showBreakfast ? [...MEALS] : ['lunch', 'dinner']

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    let mounted = true
    void listPlanEntries(weekStart).then((loaded) => {
      if (mounted) setEntries(loaded)
    })
    return () => {
      mounted = false
    }
  }, [weekStart, refresh])

  useEffect(() => {
    if (!corpus || !entries) return
    let current = true
    void Promise.all(
      entries.map(async (entry) => {
        const recipe = await lookupPlanRecipe(corpus, entry)
        const slugs = recipe ? perishableSlugsForEntry(recipe.lines, () => false) : new Set<string>()
        return { id: entry.id, slugs }
      }),
    ).then((withSlugs) => {
      if (current) setHints(shareHints(withSlugs, ingredientName))
    })
    const keys = entries.filter((e) => e.recipeSource === 'corpus').map((e) => e.recipeId)
    void imagesForKeys(corpus.db, keys).then((found) => {
      if (current) setImages(found)
    })
    return () => {
      current = false
    }
  }, [corpus, entries])

  const bump = () => setRefresh((n) => n + 1)

  async function remove(entry: PlanEntry) {
    // Out of the list at once (the row has already slid away), then out of user.db.
    setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? prev)
    await removePlanEntry(entry.id)
    bump()
    show({
      message: `Removed ${entry.recipeTitle}`,
      onAction: () => {
        void addPlanEntry({
          weekStart,
          day: entry.day,
          meal: entry.meal,
          recipeId: entry.recipeId,
          recipeSource: entry.recipeSource,
          recipeTitle: entry.recipeTitle,
          people: entry.people,
        }).then(bump)
      },
    })
  }

  async function changePeople(entry: PlanEntry, people: number) {
    if (people < 1) return
    setEditing({ ...entry, people })
    await setPlanEntryPeople(entry.id, people)
    bump()
  }

  async function move(entry: PlanEntry, day: string, meal: Meal) {
    setEditing({ ...entry, day, meal })
    await movePlanEntry(entry.id, day, meal)
    bump()
  }

  async function buildList() {
    if (!corpus || !settings) return
    setBuilding(true)
    try {
      const result = await buildListFromPlan(corpus, settings, week)
      navigate('/list', { state: { message: buildMessage(result) } })
    } finally {
      setBuilding(false)
    }
  }

  function entryFor(day: string, meal: Meal): PlanEntry | undefined {
    return entries?.find((e) => e.day === day && e.meal === meal)
  }

  const planned = entries?.length ?? 0
  const range = `${DATE_FMT.format(localDate(days[0]))} – ${DATE_FMT.format(localDate(days[6]))}`

  return (
    <section className="screen screen--plan" data-testid="screen-plan">
      <div className="plan-toolbar">
        <Segmented
          label="Week"
          value={week}
          onChange={setWeek}
          testId="plan-week"
          options={[
            { value: 'this', label: 'This week' },
            { value: 'next', label: 'Next week' },
          ]}
        />
        <p className="plan-toolbar__summary">
          <span>{range}</span>
          <span>
            {planned === 0 ? 'Nothing planned' : `${planned} ${planned === 1 ? 'meal' : 'meals'} planned`}
          </span>
        </p>
        <button
          type="button"
          className="button button--primary plan-toolbar__build"
          disabled={building || planned === 0 || !corpus || !settings}
          onClick={() => void buildList()}
          data-testid="plan-build-list"
        >
          <Icon name="cart" size={20} />
          {building ? 'Building…' : 'Build shopping list'}
        </button>
      </div>

      <div className="day-list">
        {days.map((day) => {
          const isToday = day === today
          return (
            <section
              key={day}
              className={`day-card${isToday ? ' day-card--today' : ''}`}
              aria-label={SHORT_FMT.format(localDate(day))}
            >
              <header className="day-card__head">
                <h3 className="day-card__title plan-day__title">
                  {WEEKDAY_FMT.format(localDate(day))}
                </h3>
                <span className="day-card__date">{DATE_FMT.format(localDate(day))}</span>
                {isToday && <span className="badge">Today</span>}
              </header>
              <ul className="day-card__slots">
                {meals.map((meal) => {
                  const entry = entryFor(day, meal)
                  const testId = `plan-slot-${day}-${meal}`
                  if (!entry) {
                    return (
                      <li key={meal} className="slot slot--empty" data-testid={testId}>
                        <button
                          type="button"
                          className="slot__add"
                          onClick={() => setAdding({ day, meal })}
                          aria-label={`Add ${meal} on ${SHORT_FMT.format(localDate(day))}`}
                        >
                          <span className="slot__meal">{MEAL_LABEL[meal]}</span>
                          <span className="slot__add-label">
                            <Icon name="plus" size={18} />
                            Add
                          </span>
                        </button>
                      </li>
                    )
                  }
                  const hint = hints.get(entry.id)
                  return (
                    <SwipeRow
                      key={meal}
                      className="slot slot--filled"
                      testId={testId}
                      endAction={{
                        label: `Remove ${entry.recipeTitle}`,
                        icon: 'trash',
                        tone: 'danger',
                        dismiss: true,
                        button: false,
                        onAction: () => void remove(entry),
                      }}
                    >
                      <div className="plan-meal">
                        <RecipeImage
                          src={entry.recipeSource === 'corpus' ? images.get(entry.recipeId) : null}
                          title={entry.recipeTitle}
                          cuisine={null}
                          className="plan-meal__image"
                        />
                        <Link to={recipeHref(entry)} className="plan-meal__body" draggable={false}>
                          <span className="plan-meal__meal">{MEAL_LABEL[meal]}</span>
                          <span className="plan-meal__title">{entry.recipeTitle}</span>
                          <span className="plan-meal__meta">
                            <Icon name="people" size={14} />
                            {entry.people} {entry.people === 1 ? 'person' : 'people'}
                          </span>
                          {hint && hint.length > 0 && (
                            <span className="plan-meal__hint" data-testid="share-hint">
                              <Icon name="leaf" size={14} />
                              Shares {hint.join(', ')} with another day
                            </span>
                          )}
                        </Link>
                        <button
                          type="button"
                          className="icon-button plan-meal__more"
                          aria-label={`Options for ${entry.recipeTitle}`}
                          onClick={() => setEditing(entry)}
                        >
                          <Icon name="more" />
                        </button>
                      </div>
                    </SwipeRow>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      {planned === 0 && entries !== null && (
        <p className="note-line plan-empty-note">
          Tap a meal to add a favorite, or find something in <Link to="/cook">Cook</Link> and tap
          Add to plan.
        </p>
      )}

      <BottomSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.recipeTitle ?? 'Meal'}
        testId="plan-entry-sheet"
      >
        {editing && (
          <div className="sheet-form">
            <div className="field field--row">
              <span className="field__label">People</span>
              <Stepper
                label="people"
                value={editing.people}
                onChange={(n) => void changePeople(editing, n)}
              />
            </div>
            <label className="field">
              <span className="field__label">Move to</span>
              <select
                className="field__control"
                aria-label={`Move ${editing.recipeTitle}`}
                value={`${editing.day}|${editing.meal}`}
                onChange={(e) => {
                  const [d, m] = e.target.value.split('|')
                  void move(editing, d, m as Meal)
                }}
              >
                {days.flatMap((d) =>
                  meals.map((m) => (
                    <option key={`${d}|${m}`} value={`${d}|${m}`}>
                      {SHORT_FMT.format(localDate(d))} · {MEAL_LABEL[m]}
                    </option>
                  )),
                )}
              </select>
            </label>
            <div className="sheet-form__actions">
              <Link to={recipeHref(editing)} className="button button--quiet">
                Open recipe
              </Link>
              <button
                type="button"
                className="button button--danger"
                onClick={() => {
                  const entry = editing
                  setEditing(null)
                  void remove(entry)
                }}
              >
                <Icon name="trash" size={18} />
                Remove
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        title={adding ? `${MEAL_LABEL[adding.meal]}, ${SHORT_FMT.format(localDate(adding.day))}` : 'Add'}
        testId="plan-add-sheet"
      >
        {adding && (
          <FavoritesPicker
            onPick={async (fav) => {
              await addPlanEntry({
                weekStart,
                day: adding.day,
                meal: adding.meal,
                recipeId: fav.key,
                recipeSource: fav.source as RecipeSource,
                recipeTitle: fav.title,
                people: settings?.peopleDefault ?? 2,
              })
              setAdding(null)
              bump()
            }}
          />
        )}
      </BottomSheet>
    </section>
  )
}

/** Search favorites by title to fill an empty slot (brief S7 #1, "by searching favorites"). */
function FavoritesPicker({ onPick }: { onPick: (fav: FavoriteView) => void | Promise<void> }) {
  const { corpus } = useCorpus()
  const [favorites, setFavorites] = useState<FavoriteView[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let current = true
    void listFavorites()
      .then((refs) => resolveFavorites(refs, corpus?.db ?? null))
      .then((views) => {
        if (current) setFavorites(views)
      })
    return () => {
      current = false
    }
  }, [corpus])

  const matches = useMemo(
    () =>
      (favorites ?? []).filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase())),
    [favorites, query],
  )

  if (favorites !== null && favorites.length === 0) {
    return (
      <EmptyState icon="star" title="No favorites yet." compact>
        Star recipes to pick them here, or use Add to plan on any recipe.
      </EmptyState>
    )
  }

  return (
    <div className="plan-picker">
      <label className="search-field">
        <span className="visually-hidden">Search favorites</span>
        <Icon name="search" size={20} className="search-field__icon" />
        <input
          type="search"
          value={query}
          placeholder="Search favorites"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ul className="pick-list">
        {matches.map((r) => (
          <li key={`${r.source}-${r.key}`}>
            <button type="button" className="pick-row" onClick={() => void onPick(r)}>
              <RecipeImage
                src={r.imageUrl}
                title={r.title}
                cuisine={r.cuisine}
                className="pick-row__image"
              />
              <span className="pick-row__title">{r.title}</span>
              <Icon name="plus" size={20} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
