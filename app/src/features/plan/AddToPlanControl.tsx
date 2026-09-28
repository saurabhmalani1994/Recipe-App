import { useEffect, useState } from 'react'
import { getSettings } from '../settings/settingsRepo'
import {
  addPlanEntry,
  mondayOf,
  nextWeekStart,
  weekDays,
  type Meal,
  type RecipeSource,
} from './planRepo'

/**
 * "Add to plan" (brief S7 #1): a small inline picker for a day and meal, usable from recipe
 * detail, from a Cook result, or from the Plan screen's own favorites search. Kept as one
 * component so all three read the same settings (default people, whether breakfast is on).
 */
export function AddToPlanControl({
  recipeId,
  recipeSource,
  recipeTitle,
}: {
  recipeId: string
  recipeSource: RecipeSource
  recipeTitle: string
}) {
  const [open, setOpen] = useState(false)
  const [meals, setMeals] = useState<Meal[]>(['lunch', 'dinner'])
  const [people, setPeople] = useState(2)
  const [week, setWeek] = useState<'this' | 'next'>('this')
  const [day, setDay] = useState('')
  const [meal, setMeal] = useState<Meal>('dinner')
  const [added, setAdded] = useState(false)

  useEffect(() => {
    void getSettings().then((s) => {
      setPeople(s.peopleDefault)
      setMeals(s.showBreakfast ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner'])
    })
  }, [])

  const thisWeek = mondayOf(new Date())

  function weekStartFor(choice: 'this' | 'next'): string {
    return choice === 'this' ? thisWeek : nextWeekStart(thisWeek)
  }

  const days = weekDays(weekStartFor(week))
  const currentDay = days.includes(day) ? day : days[0]

  async function submit() {
    await addPlanEntry({
      weekStart: weekStartFor(week),
      day: currentDay,
      meal,
      recipeId,
      recipeSource,
      recipeTitle,
      people,
    })
    setAdded(true)
    setOpen(false)
    setTimeout(() => setAdded(false), 3000)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="add-to-plan-open">
        {added ? 'Added to plan ✓' : 'Add to plan'}
      </button>
    )
  }

  return (
    <div className="add-to-plan" role="group" aria-label="Add to plan">
      <label>
        Week
        <select value={week} onChange={(e) => setWeek(e.target.value as 'this' | 'next')}>
          <option value="this">This week</option>
          <option value="next">Next week</option>
        </select>
      </label>
      <label>
        Day
        <select value={currentDay} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => (
            <option key={d} value={d}>
              {new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </option>
          ))}
        </select>
      </label>
      <label>
        Meal
        <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
          {meals.map((m) => (
            <option key={m} value={m}>
              {m[0].toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <div className="add-to-plan__actions">
        <button type="button" onClick={() => void submit()} data-testid="add-to-plan-confirm">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
