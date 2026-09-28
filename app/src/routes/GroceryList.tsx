import { useEffect, useState } from 'react'
import { ingredientAisle, ingredientName } from '../corpus/slugs'
import { aggregateGroceryLines, type GroceryLineInput, type SlugMeta } from '../features/grocery/aggregate'
import {
  addManualGroceryItem,
  addTickedToKitchen,
  buildGroceryList,
  clearGroceryList,
  getCurrentGroceryList,
  setGroceryItemChecked,
  type GroceryList,
  type GroceryListItem,
} from '../features/grocery/groceryRepo'
import { useCorpus } from '../features/cook/useCorpus'
import { listKitchenItems } from '../features/kitchen/kitchenRepo'
import {
  listPlanEntriesInRange,
  mondayOf,
  nextWeekStart,
  weekDays,
} from '../features/plan/planRepo'
import { lookupPlanRecipe } from '../features/plan/recipeLookup'
import { scaleFactor } from '../features/scaling/scale'
import { getSettings, type AppSettings } from '../features/settings/settingsRepo'

type Range = 'this' | 'next' | 'both'

/** The grocery list builder and shopping mode (brief S7 #2-3). */
export function GroceryList() {
  const { corpus } = useCorpus()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [range, setRange] = useState<Range>('this')
  const [building, setBuilding] = useState(false)
  const [list, setList] = useState<GroceryList | null>(null)
  const [manualText, setManualText] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const loaded = await getCurrentGroceryList(ingredientName)
    setList(loaded)
  }

  async function build() {
    if (!corpus || !settings) return
    setBuilding(true)
    setMessage(null)
    try {
      const thisWeek = mondayOf(new Date())
      const next = nextWeekStart(thisWeek)
      const start = range === 'next' ? next : thisWeek
      const to = range === 'this' ? weekDays(thisWeek)[6] : weekDays(next)[6]
      const entries = await listPlanEntriesInRange(start, to)

      const kitchen = await listKitchenItems()
      const haveSlugs = new Set(kitchen.map((k) => k.ingredientId))

      const lines: GroceryLineInput[] = []
      for (const entry of entries) {
        const recipe = await lookupPlanRecipe(corpus, entry)
        if (!recipe) continue
        const factor = recipe.servings ? scaleFactor(recipe.servings, entry.people, settings.servingsPerPerson) : 1
        for (const line of recipe.lines) {
          lines.push({
            slug: line.slug,
            raw: line.raw,
            qty: line.qty === null ? null : line.qty * factor,
            qtyMax: line.qtyMax === null ? null : line.qtyMax * factor,
            unit: line.unit,
            pkgQty: line.pkgQty,
            pkgUnit: line.pkgUnit,
          })
        }
      }

      const metaFor = (slug: string): SlugMeta => ({
        name: ingredientName(slug),
        aisle: ingredientAisle(slug),
        isStaple: corpus.tax.staples.has(slug),
        density: corpus.tax.density.get(slug) ?? null,
        eachG: corpus.tax.eachG.get(slug) ?? null,
      })

      const { items, checkThese } = aggregateGroceryLines(lines, {
        units: corpus.units,
        system: settings.units,
        metaFor,
        haveSlugs,
      })

      await buildGroceryList(null, items, checkThese)
      await refresh()
      setMessage(
        entries.length === 0
          ? 'Nothing planned for this range yet — add some recipes to Plan first.'
          : null,
      )
    } finally {
      setBuilding(false)
    }
  }

  async function toggle(item: GroceryListItem) {
    // Optimistic: a shopping checklist should tick the instant you tap it, not after a round
    // trip to the db. Ticked items still drop to the bottom, via `groupByAisle`'s sort below.
    setList((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)) }
        : prev,
    )
    await setGroceryItemChecked(item.id, !item.checked)
  }

  async function addManual() {
    if (!list || !manualText.trim()) return
    await addManualGroceryItem(list.id, manualText.trim())
    setManualText('')
    await refresh()
  }

  async function addTickedToKitchenAction() {
    if (!list) return
    const added = await addTickedToKitchen(list.id)
    setMessage(`${added} ${added === 1 ? 'item' : 'items'} moved to the kitchen list.`)
    await refresh()
  }

  async function clear() {
    if (!list) return
    await clearGroceryList(list.id)
    await refresh()
  }

  const groups = groupByAisle(list?.items ?? [])
  const checkThese = (list?.items ?? []).filter((i) => i.note !== null)

  return (
    <section className="screen" data-testid="screen-list">
      <h2>List</h2>

      <div className="list-build" role="group" aria-label="Build grocery list">
        <label>
          Range
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="this">This week</option>
            <option value="next">Next week</option>
            <option value="both">This + next week</option>
          </select>
        </label>
        <button type="button" disabled={building || !corpus} onClick={() => void build()}>
          {building ? 'Building…' : 'Build list'}
        </button>
      </div>

      {message && <p className="screen__placeholder" data-testid="list-message">{message}</p>}

      {!list && !message && (
        <p className="screen__placeholder">
          Nothing built yet. Plan some meals, then build the list.
        </p>
      )}

      {list && (
        <>
          <div className="list-actions">
            <button type="button" onClick={() => void addTickedToKitchenAction()}>
              Add ticked to kitchen
            </button>
            <button type="button" onClick={() => void clear()}>
              Clear
            </button>
          </div>

          <div className="kitchen-add">
            <label htmlFor="list-manual">Add an item</label>
            <input
              id="list-manual"
              type="text"
              value={manualText}
              placeholder="e.g. paper towels"
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addManual()
              }}
            />
            <button type="button" onClick={() => void addManual()}>
              Add
            </button>
          </div>

          {groups.map(([aisle, aisleItems]) => (
            <div key={aisle} className="kitchen-group">
              <h3 className="kitchen-group__title">{aisle}</h3>
              <ul className="shopping-list" data-testid={`aisle-${aisle}`}>
                {aisleItems.map((item) => (
                  <li
                    key={item.id}
                    className={item.checked ? 'shopping-item shopping-item--checked' : 'shopping-item'}
                  >
                    <label className="shopping-item__label">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => void toggle(item)}
                      />
                      <span className="shopping-item__name">{item.name}</span>
                      {item.amount && <span className="shopping-item__amount">{item.amount}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {checkThese.length > 0 && (
            <div className="kitchen-group" data-testid="check-these">
              <h3 className="kitchen-group__title">Check these</h3>
              <ul className="shopping-list">
                {checkThese.map((item) => (
                  <li key={item.id} className="shopping-item shopping-item__label">
                    <span className="shopping-item__name">{item.text}</span>
                    <span className="shopping-item__amount">{item.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Groups by aisle (alphabetically), ticked items dropped to the bottom within their group. */
function groupByAisle(items: GroceryListItem[]): [string, GroceryListItem[]][] {
  const buyable = items.filter((i) => i.note === null)
  const groups = new Map<string, GroceryListItem[]>()
  for (const item of buyable) {
    const aisle = item.aisle ?? 'other'
    const group = groups.get(aisle)
    if (group) group.push(item)
    else groups.set(aisle, [item])
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name))
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}
