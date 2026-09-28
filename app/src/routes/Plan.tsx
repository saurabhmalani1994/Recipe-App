import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FIXTURE_RECIPES } from '../corpus/fixture'
import { ingredientName } from '../corpus/slugs'
import { useCorpus } from '../features/cook/useCorpus'
import { listFavoriteIds } from '../features/favorites/favoritesRepo'
import {
  MEALS,
  addPlanEntry,
  listPlanEntries,
  mondayOf,
  movePlanEntry,
  nextWeekStart,
  removePlanEntry,
  setPlanEntryPeople,
  weekDays,
  type Meal,
  type PlanEntry,
} from '../features/plan/planRepo'
import { lookupPlanRecipe } from '../features/plan/recipeLookup'
import { perishableSlugsForEntry, shareHints } from '../features/plan/shareHints'
import { getSettings, type AppSettings } from '../features/settings/settingsRepo'

const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** The weekly meal planner (brief S7 #1): a grid of 7 days x meal slots, with a "this week /
 * next week" switch and a "shares ingredients" hint linking days that use up the same
 * perishable. */
export function Plan() {
  const { corpus } = useCorpus()
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [hints, setHints] = useState<Map<string, string[]>>(new Map())
  const [addingSlot, setAddingSlot] = useState<{ day: string; meal: Meal } | null>(null)
  const [refresh, setRefresh] = useState(0)

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
    if (!corpus) return
    let current = true
    void Promise.all(
      entries.map(async (entry) => {
        const recipe = await lookupPlanRecipe(corpus, entry)
        const slugs = recipe ? perishableSlugsForEntry(recipe.lines, () => false) : new Set<string>()
        return { id: entry.id, slugs }
      }),
    ).then((withSlugs) => {
      if (!current) return
      setHints(shareHints(withSlugs, ingredientName))
    })
    return () => {
      current = false
    }
  }, [corpus, entries])

  async function remove(id: string) {
    await removePlanEntry(id)
    setRefresh((n) => n + 1)
  }

  async function changePeople(id: string, people: number) {
    if (people < 1) return
    await setPlanEntryPeople(id, people)
    setRefresh((n) => n + 1)
  }

  async function move(id: string, day: string, meal: Meal) {
    await movePlanEntry(id, day, meal)
    setRefresh((n) => n + 1)
  }

  function entryFor(day: string, meal: Meal): PlanEntry | undefined {
    return entries.find((e) => e.day === day && e.meal === meal)
  }

  function recipeHref(entry: PlanEntry): string {
    if (entry.recipeSource === 'my') return `/my-recipes/${entry.recipeId}`
    return `/recipe/${encodeURIComponent(entry.recipeId)}`
  }

  return (
    <section className="screen" data-testid="screen-plan">
      <h2>Plan</h2>

      <div className="plan-week-switch" role="group" aria-label="Week">
        <button
          type="button"
          aria-pressed={week === 'this'}
          onClick={() => setWeek('this')}
          disabled={week === 'this'}
        >
          This week
        </button>
        <button
          type="button"
          aria-pressed={week === 'next'}
          onClick={() => setWeek('next')}
          disabled={week === 'next'}
        >
          Next week
        </button>
      </div>

      {days.map((day) => (
        <div key={day} className="plan-day">
          <h3 className="plan-day__title">{WEEKDAY_FMT.format(new Date(day))}</h3>
          {meals.map((meal) => {
            const entry = entryFor(day, meal)
            const hint = entry ? hints.get(entry.id) : undefined
            return (
              <div key={meal} className="plan-slot" data-testid={`plan-slot-${day}-${meal}`}>
                <span className="plan-slot__meal">{MEAL_LABEL[meal]}</span>
                {entry ? (
                  <div className="plan-entry">
                    <Link to={recipeHref(entry)}>{entry.recipeTitle}</Link>
                    <label className="plan-entry__people">
                      People
                      <input
                        type="number"
                        min={1}
                        value={entry.people}
                        onChange={(e) => void changePeople(entry.id, Number(e.target.value) || 1)}
                      />
                    </label>
                    <select
                      aria-label={`Move ${entry.recipeTitle}`}
                      value={`${entry.day}|${entry.meal}`}
                      onChange={(e) => {
                        const [d, m] = e.target.value.split('|')
                        void move(entry.id, d, m as Meal)
                      }}
                    >
                      {days.flatMap((d) =>
                        meals.map((m) => (
                          <option key={`${d}|${m}`} value={`${d}|${m}`}>
                            {WEEKDAY_FMT.format(new Date(d))} · {MEAL_LABEL[m]}
                          </option>
                        )),
                      )}
                    </select>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${entry.recipeTitle}`}
                      onClick={() => void remove(entry.id)}
                    >
                      ×
                    </button>
                    {hint && hint.length > 0 && (
                      <p className="plan-entry__hint" data-testid="share-hint">
                        Shares {hint.join(', ')} with another day
                      </p>
                    )}
                  </div>
                ) : addingSlot?.day === day && addingSlot.meal === meal ? (
                  <FavoritesPicker
                    onPick={async (id, title) => {
                      await addPlanEntry({
                        weekStart,
                        day,
                        meal,
                        recipeId: id,
                        recipeSource: 'fixture',
                        recipeTitle: title,
                        people: settings?.peopleDefault ?? 2,
                      })
                      setAddingSlot(null)
                      setRefresh((n) => n + 1)
                    }}
                    onCancel={() => setAddingSlot(null)}
                  />
                ) : (
                  <button type="button" onClick={() => setAddingSlot({ day, meal })}>
                    + Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

/** Search favorites by title to fill an empty slot (brief S7 #1, "by searching favorites"). */
function FavoritesPicker({
  onPick,
  onCancel,
}: {
  onPick: (id: string, title: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [ids, setIds] = useState<string[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void listFavoriteIds().then(setIds)
  }, [])

  const favorites = useMemo(
    () => ids.map((id) => FIXTURE_RECIPES.find((r) => r.id === id)).filter((r): r is (typeof FIXTURE_RECIPES)[number] => !!r),
    [ids],
  )
  const matches = favorites.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="plan-picker">
      <label>
        Search favorites
        <input
          type="text"
          value={query}
          placeholder="Recipe title…"
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      {favorites.length === 0 && <p className="screen__placeholder">No favorites yet.</p>}
      <ul className="plan-picker__list">
        {matches.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => void onPick(r.id, r.title)}>
              {r.title}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
