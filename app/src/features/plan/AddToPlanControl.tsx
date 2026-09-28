import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Segmented, Stepper } from '../../components/ui/Controls'
import { Icon } from '../../components/ui/Icon'
import { useSnackbar } from '../../components/ui/Snackbar'
import { getSettings } from '../settings/settingsRepo'
import {
  addPlanEntry,
  mondayOf,
  nextWeekStart,
  weekDays,
  type Meal,
  type RecipeSource,
} from './planRepo'

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }

function mealLabel(meal: Meal): string {
  return meal[0].toUpperCase() + meal.slice(1)
}

/**
 * "Add to plan" (brief S7 #1): pick a week, day, meal and head count. S22b moves the picker into
 * a bottom sheet, opened from a button on the recipe views and on a Cook result. Kept as one
 * component so every caller reads the same settings (default people, whether breakfast is on).
 */
export function AddToPlanControl({
  recipeId,
  recipeSource,
  recipeTitle,
  variant = 'text',
}: {
  recipeId: string
  recipeSource: RecipeSource
  recipeTitle: string
  /** text: a quiet text button (Cook cards). pill: a pill with an icon (recipe views). */
  variant?: 'text' | 'pill'
}) {
  const { show } = useSnackbar()
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

  useEffect(() => {
    if (!added) return
    const timer = window.setTimeout(() => setAdded(false), 3000)
    return () => window.clearTimeout(timer)
  }, [added])

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
    show({
      message: `Planned for ${new Date(currentDay).toLocaleDateString(undefined, DAY_FMT)}, ${meal}.`,
    })
  }

  return (
    <>
      <button
        type="button"
        className={variant === 'pill' ? 'button button--secondary' : 'button button--text'}
        onClick={() => setOpen(true)}
        data-testid="add-to-plan-open"
      >
        <Icon name={added ? 'check' : 'calendarPlus'} size={20} />
        {added ? 'Added to plan' : 'Add to plan'}
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add to plan"
        testId="add-to-plan-sheet"
        footer={
          <>
            <button type="button" className="button button--quiet" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => void submit()}
              data-testid="add-to-plan-confirm"
            >
              Add
            </button>
          </>
        }
      >
        <div className="add-to-plan" role="group" aria-label="Add to plan">
          <p className="sheet__lede add-to-plan__title">{recipeTitle}</p>
          <Segmented
            label="Week"
            value={week}
            onChange={setWeek}
            options={[
              { value: 'this', label: 'This week' },
              { value: 'next', label: 'Next week' },
            ]}
          />
          <label className="field">
            <span className="field__label">Day</span>
            <select
              className="field__control"
              value={currentDay}
              onChange={(e) => setDay(e.target.value)}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {new Date(d).toLocaleDateString(undefined, DAY_FMT)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Meal</span>
            <select
              className="field__control"
              value={meal}
              onChange={(e) => setMeal(e.target.value as Meal)}
            >
              {meals.map((m) => (
                <option key={m} value={m}>
                  {mealLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="field field--row">
            <span className="field__label">People</span>
            <Stepper label="people" value={people} onChange={setPeople} />
          </div>
        </div>
      </BottomSheet>
    </>
  )
}
