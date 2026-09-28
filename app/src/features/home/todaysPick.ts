import type { HomeCard, HomeRow, HomeRowId } from './types'

/** The rows Today's pick draws from, in order of preference. */
const PICK_ORDER: readonly HomeRowId[] = ['seasonal', 'cook', 'explore', 'favorites']

/**
 * Today's pick for Home's hero (S22b: "prefers course=main"). The first main course found by
 * walking the rows in `PICK_ORDER`, each row in its own order; when no row holds a main, the
 * first card of the first row that has any. Null when every row is empty.
 */
export function pickTodaysHero(rows: readonly HomeRow[]): { card: HomeCard; from: HomeRowId } | null {
  const ordered = PICK_ORDER.map((id) => rows.find((row) => row.id === id)).filter(
    (row): row is HomeRow => row !== undefined,
  )
  for (const row of ordered) {
    const main = row.cards.find((card) => card.course === 'main')
    if (main) return { card: main, from: row.id }
  }
  for (const row of ordered) {
    if (row.cards[0]) return { card: row.cards[0], from: row.id }
  }
  return null
}
