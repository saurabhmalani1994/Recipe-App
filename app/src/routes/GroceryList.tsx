import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ingredientName } from '../corpus/slugs'
import { Segmented } from '../components/ui/Controls'
import { Icon } from '../components/ui/Icon'
import { EmptyState } from '../components/ui/Section'
import { useSnackbar } from '../components/ui/Snackbar'
import { SwipeRow } from '../components/ui/SwipeRow'
import { useCorpus } from '../features/cook/useCorpus'
import {
  buildListFromPlan,
  buildMessage,
  type ListRange,
} from '../features/grocery/buildFromPlan'
import {
  addManualGroceryItem,
  addTickedToKitchen,
  clearGroceryList,
  deleteGroceryItem,
  getCurrentGroceryList,
  restoreGroceryItem,
  setGroceryItemChecked,
  type GroceryList,
  type GroceryListItem,
} from '../features/grocery/groceryRepo'
import { getSettings, type AppSettings } from '../features/settings/settingsRepo'

/** A ticked item stays in its aisle (struck through) this long before it folds into "Done". */
const SETTLE_MS = 900

/**
 * The grocery list builder and shopping mode (brief S7 #2-3; S22b layout). Big rows grouped by
 * aisle under sticky aisle headers. Tap a row, or swipe it right, to tick it; swipe left to
 * delete it (an undo snackbar puts it back). Ticked items fold into a collapsed "Done (n)"
 * section, and "Add ticked to kitchen" is the primary action once anything is ticked.
 */
export function GroceryList() {
  const { corpus } = useCorpus()
  const location = useLocation()
  const { show } = useSnackbar()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [range, setRange] = useState<ListRange>('this')
  const [building, setBuilding] = useState(false)
  const [list, setList] = useState<GroceryList | null | undefined>(undefined)
  const [manualText, setManualText] = useState('')
  // A build started from Plan hands its "left off …" line over in router state.
  const [message, setMessage] = useState<string | null>(
    () => (location.state as { message?: string | null } | null)?.message ?? null,
  )
  const [openSources, setOpenSources] = useState<ReadonlySet<string>>(new Set())
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set())
  const [showDone, setShowDone] = useState(false)
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
    }
  }, [])

  function toggleSources(id: string) {
    setOpenSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    void getSettings().then(setSettings)
    void refresh()
  }, [])

  async function refresh() {
    setList(await getCurrentGroceryList(ingredientName))
  }

  async function build() {
    if (!corpus || !settings) return
    setBuilding(true)
    setMessage(null)
    try {
      const result = await buildListFromPlan(corpus, settings, range)
      await refresh()
      setMessage(buildMessage(result))
    } finally {
      setBuilding(false)
    }
  }

  function settle(id: string) {
    setSettling((prev) => new Set(prev).add(id))
    window.clearTimeout(timers.current.get(id))
    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id)
        setSettling((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, SETTLE_MS),
    )
  }

  async function toggle(item: GroceryListItem) {
    // Optimistic: a shopping checklist should tick the instant you tap it, not after a round
    // trip to the db.
    const checked = !item.checked
    if (checked) settle(item.id)
    setList((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, checked } : i)) }
        : prev,
    )
    await setGroceryItemChecked(item.id, checked)
  }

  async function remove(item: GroceryListItem) {
    setList((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id) } : prev,
    )
    const deleted = await deleteGroceryItem(item.id)
    if (!deleted) return
    show({
      message: `Deleted ${item.name}`,
      onAction: () => {
        void restoreGroceryItem(deleted).then(refresh)
      },
    })
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
    setMessage(null)
    await refresh()
  }

  const items = list?.items ?? []
  const buyable = items.filter((i) => i.note === null)
  const open = buyable.filter((i) => !i.checked || settling.has(i.id))
  const done = buyable
    .filter((i) => i.checked && !settling.has(i.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const tickedCount = buyable.filter((i) => i.checked).length
  const groups = groupByAisle(open)
  const checkThese = items.filter((i) => i.note !== null)

  const row = (item: GroceryListItem) => (
    <ShoppingRow
      key={item.id}
      item={item}
      sourcesOpen={openSources.has(item.id)}
      onToggleSources={() => toggleSources(item.id)}
      onToggle={() => void toggle(item)}
      onDelete={() => void remove(item)}
    />
  )

  return (
    <section className="screen screen--list" data-testid="screen-list">
      <div className="list-build" role="group" aria-label="Build grocery list">
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: 'this', label: 'This week' },
            { value: 'next', label: 'Next week' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <button
          type="button"
          className={`button ${list ? 'button--secondary' : 'button--primary'}`}
          disabled={building || !corpus || !settings}
          onClick={() => void build()}
        >
          <Icon name="cart" size={20} />
          {building ? 'Building…' : list ? 'Rebuild list' : 'Build list'}
        </button>
      </div>

      {message && (
        <p className="status-line" data-testid="list-message" role="status">
          {message}
        </p>
      )}

      {list === null && !message && (
        <EmptyState
          icon="cart"
          title="No list yet."
          action={
            <Link to="/plan" className="button button--quiet">
              Go to Plan
            </Link>
          }
        >
          Plan some meals, then build the list from them.
        </EmptyState>
      )}

      {list && (
        <>
          <form
            className="list-add"
            onSubmit={(event) => {
              event.preventDefault()
              void addManual()
            }}
          >
            <label htmlFor="list-manual" className="visually-hidden">
              Add an item
            </label>
            <input
              id="list-manual"
              type="text"
              value={manualText}
              placeholder="Add an item, e.g. paper towels"
              onChange={(e) => setManualText(e.target.value)}
            />
            <button
              type="submit"
              className="icon-button list-add__button"
              aria-label="Add"
              disabled={!manualText.trim()}
            >
              <Icon name="plus" />
            </button>
          </form>

          <p className="list-summary" data-testid="list-summary">
            {open.length === 0 && buyable.length > 0
              ? 'All ticked. Nice shop.'
              : `${buyable.length - tickedCount} to buy`}
            {tickedCount > 0 && ` · ${tickedCount} ticked`}
            <span className="list-summary__hint"> · Swipe right to tick, left to delete</span>
          </p>

          {groups.map(([aisle, aisleItems]) => (
            <section key={aisle} className="aisle" aria-labelledby={`aisle-title-${aisle}`}>
              <h3 className="aisle__title kitchen-group__title" id={`aisle-title-${aisle}`}>
                <span>{aisle}</span>
                <span className="aisle__count">{aisleItems.length}</span>
              </h3>
              <ul className="shopping-list" data-testid={`aisle-${aisle}`}>
                {aisleItems.map(row)}
              </ul>
            </section>
          ))}

          {checkThese.length > 0 && (
            <section className="aisle aisle--check" data-testid="check-these">
              <h3 className="aisle__title kitchen-group__title">
                <span>Check these</span>
                <span className="aisle__count">{checkThese.length}</span>
              </h3>
              <p className="note-line">Lines the list could not read. Check them in the recipe.</p>
              <ul className="shopping-list">
                {checkThese.map((item) => (
                  <li key={item.id} className="shopping-item shopping-item--note">
                    <span className="shopping-item__name">{item.text}</span>
                    <span className="shopping-item__amount">{item.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section className="done-section" data-testid="list-done">
              <button
                type="button"
                className="done-section__toggle"
                aria-expanded={showDone}
                onClick={() => setShowDone((v) => !v)}
              >
                <Icon name="check" size={20} />
                <span>Done ({done.length})</span>
                <Icon
                  name="chevronDown"
                  size={20}
                  className={showDone ? 'icon--flip' : undefined}
                />
              </button>
              {showDone && <ul className="shopping-list shopping-list--done">{done.map(row)}</ul>}
            </section>
          )}

          <div className="list-footer">
            <button type="button" className="button button--text" onClick={() => void clear()}>
              <Icon name="trash" size={18} />
              Clear list
            </button>
          </div>

          {tickedCount > 0 && (
            <div className="action-bar">
              <button
                type="button"
                className="button button--primary action-bar__button"
                onClick={() => void addTickedToKitchenAction()}
              >
                <Icon name="basket" size={20} />
                Add ticked to kitchen
                <span className="action-bar__count" aria-hidden="true">
                  {tickedCount}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ShoppingRow({
  item,
  sourcesOpen,
  onToggleSources,
  onToggle,
  onDelete,
}: {
  item: GroceryListItem
  sourcesOpen: boolean
  onToggleSources: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <SwipeRow
      className={`shopping-item${item.checked ? ' shopping-item--checked' : ''}`}
      testId={`list-item-${item.name}`}
      startAction={{
        label: item.checked ? `Untick ${item.name}` : `Tick ${item.name}`,
        icon: 'check',
        tone: 'herb',
        onAction: onToggle,
        // The row itself is the checkbox: no second control for the same thing.
        button: false,
      }}
      endAction={{
        label: `Delete ${item.name}`,
        icon: 'trash',
        tone: 'danger',
        dismiss: true,
        onAction: onDelete,
      }}
    >
      <div className="shop-row">
        <label className="shop-row__main">
          <input
            type="checkbox"
            className="shop-row__input"
            checked={item.checked}
            onChange={onToggle}
          />
          <span className="shop-row__box" aria-hidden="true">
            {item.checked && <Icon name="check" size={18} />}
          </span>
          <span className="shop-row__text">
            <span className="shopping-item__name">{item.name}</span>
            {item.amount && <span className="shopping-item__amount">{item.amount}</span>}
          </span>
        </label>
        {item.sources.length > 0 && (
          <button
            type="button"
            className="shop-row__sources shopping-item__sources-toggle"
            aria-expanded={sourcesOpen}
            aria-controls={`sources-${item.id}`}
            aria-label={`Recipes for ${item.name}`}
            onClick={onToggleSources}
          >
            {item.sources.length === 1 ? '1 recipe' : `${item.sources.length} recipes`}
          </button>
        )}
      </div>
      {sourcesOpen && (
        <ul className="shopping-item__sources" id={`sources-${item.id}`}>
          {item.sources.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      )}
    </SwipeRow>
  )
}

/** Groups by aisle (alphabetically), items by name within their group. */
function groupByAisle(items: GroceryListItem[]): [string, GroceryListItem[]][] {
  const groups = new Map<string, GroceryListItem[]>()
  for (const item of items) {
    const aisle = item.aisle ?? 'other'
    const group = groups.get(aisle)
    if (group) group.push(item)
    else groups.set(aisle, [item])
  }
  for (const group of groups.values()) group.sort((a, b) => a.name.localeCompare(b.name))
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}
