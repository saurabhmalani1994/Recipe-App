import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchIngredientSlugs } from '../corpus/slugs'
import { Icon } from '../components/ui/Icon'
import { EmptyState } from '../components/ui/Section'
import { useSnackbar } from '../components/ui/Snackbar'
import { SwipeRow } from '../components/ui/SwipeRow'
import {
  addKitchenItem,
  groupByAisle,
  listKitchenItems,
  removeKitchenItem,
  type KitchenItem,
} from '../features/kitchen/kitchenRepo'

/**
 * "What I have" (S22b layout): the type-ahead add sits at the top; below it, what you have in
 * rows grouped by aisle. Swipe a row left (or tap its ×) to remove it; an undo snackbar puts it
 * back. The top bar carries the title.
 */
export function Kitchen() {
  const { show } = useSnackbar()
  const [items, setItems] = useState<KitchenItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    let mounted = true
    void listKitchenItems().then((loaded) => {
      if (mounted) setItems(loaded)
    })
    return () => {
      mounted = false
    }
  }, [refreshCount])

  const have = useMemo(() => new Set((items ?? []).map((i) => i.ingredientId)), [items])
  const suggestions = useMemo(() => searchIngredientSlugs(query), [query])

  async function add(slug: string) {
    await addKitchenItem(slug)
    setQuery('')
    setRefreshCount((n) => n + 1)
  }

  async function remove(item: KitchenItem) {
    setItems((prev) => prev?.filter((i) => i.ingredientId !== item.ingredientId) ?? prev)
    await removeKitchenItem(item.ingredientId)
    setRefreshCount((n) => n + 1)
    show({
      message: `Removed ${item.name}`,
      onAction: () => {
        void addKitchenItem(item.ingredientId).then(() => setRefreshCount((n) => n + 1))
      },
    })
  }

  const groups = groupByAisle(items ?? [])

  return (
    <section className="screen screen--kitchen" data-testid="screen-kitchen">
      <div className="kitchen-add">
        <label htmlFor="kitchen-search" className="visually-hidden">
          Add an ingredient
        </label>
        <div className="search-field">
          <Icon name="search" size={20} className="search-field__icon" />
          <input
            id="kitchen-search"
            type="text"
            value={query}
            placeholder="Add an ingredient: cilantro, dhania…"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {suggestions.length > 0 && (
          <ul className="suggestions kitchen-suggestions" data-testid="kitchen-suggestions">
            {suggestions.map((s) => (
              <li key={s.slug}>
                <button type="button" onClick={() => void add(s.slug)} disabled={have.has(s.slug)}>
                  <Icon name={have.has(s.slug) ? 'check' : 'plus'} size={20} />
                  {s.name}
                  {have.has(s.slug) && <span className="suggestions__note">you have it</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items !== null && (
        <p className="list-summary">
          {items.length} {items.length === 1 ? 'ingredient' : 'ingredients'}
          <span className="list-summary__hint"> · Swipe left to remove</span>
        </p>
      )}

      {items !== null && groups.length === 0 && (
        <EmptyState
          icon="basket"
          title="Nothing here yet."
          action={
            <Link to="/cook" className="button button--quiet">
              See what you can cook
            </Link>
          }
        >
          Search above for an ingredient you have and add it.
        </EmptyState>
      )}

      {groups.map(([aisle, aisleItems]) => (
        <section key={aisle} className="aisle" aria-labelledby={`kitchen-aisle-${aisle}`}>
          <h3 className="aisle__title kitchen-group__title" id={`kitchen-aisle-${aisle}`}>
            <span>{aisle}</span>
            <span className="aisle__count">{aisleItems.length}</span>
          </h3>
          <ul className="kitchen-list">
            {aisleItems.map((item) => (
              <SwipeRow
                key={item.ingredientId}
                className="kitchen-item"
                testId={`kitchen-item-${item.ingredientId}`}
                endAction={{
                  label: `Remove ${item.name}`,
                  icon: 'trash',
                  tone: 'danger',
                  dismiss: true,
                  // The row's own × is the visible, non-swipe way to remove it.
                  button: false,
                  onAction: () => void remove(item),
                }}
              >
                <div className="kitchen-row">
                  <span className="kitchen-row__name">{item.name}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => void remove(item)}
                  >
                    <Icon name="close" size={20} />
                  </button>
                </div>
              </SwipeRow>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
