import { useEffect, useMemo, useState } from 'react'
import { searchIngredientSlugs } from '../corpus/slugs'
import {
  addKitchenItem,
  groupByAisle,
  listKitchenItems,
  removeKitchenItem,
  type KitchenItem,
} from '../features/kitchen/kitchenRepo'

export function Kitchen() {
  const [items, setItems] = useState<KitchenItem[]>([])
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

  const suggestions = useMemo(() => searchIngredientSlugs(query), [query])

  async function add(slug: string) {
    await addKitchenItem(slug)
    setQuery('')
    setRefreshCount((n) => n + 1)
  }

  async function remove(slug: string) {
    await removeKitchenItem(slug)
    setRefreshCount((n) => n + 1)
  }

  const groups = groupByAisle(items)

  return (
    <section className="screen" data-testid="screen-kitchen">
      <h2>What I have</h2>

      <div className="kitchen-add">
        <label htmlFor="kitchen-search">Add an ingredient</label>
        <input
          id="kitchen-search"
          type="text"
          value={query}
          placeholder="e.g. cilantro, dhania…"
          onChange={(e) => setQuery(e.target.value)}
        />
        {suggestions.length > 0 && (
          <ul className="kitchen-suggestions" data-testid="kitchen-suggestions">
            {suggestions.map((s) => (
              <li key={s.slug}>
                <button type="button" onClick={() => void add(s.slug)}>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {groups.length === 0 && (
        <p className="screen__placeholder">
          Nothing added yet. Search above for an ingredient you have and add it.
        </p>
      )}

      {groups.map(([aisle, aisleItems]) => (
        <div key={aisle} className="kitchen-group">
          <h3 className="kitchen-group__title">{aisle}</h3>
          <ul className="kitchen-group__list">
            {aisleItems.map((item) => (
              <li key={item.ingredientId} className="kitchen-item">
                <span>{item.name}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void remove(item.ingredientId)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
