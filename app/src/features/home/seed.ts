/**
 * Deterministic "pick something for today" (S11 #2): a home row looks fresh once a day, but is
 * stable across every re-render that same day and reproducible in tests given a fixed date.
 * Nothing here is cryptographic; it only needs to be stable and cheap.
 */

/** `YYYY-MM-DD` in local time, the unit a "day" means throughout this feature. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** A 32-bit hash of a string (FNV-1a), used to turn a date or a row's name into a PRNG seed. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The day's seed: every row built from the same `date` shares this, then salts it per row
 * (`saltedSeed`) so rows drawing from overlapping pools don't move in lockstep. */
export function seedFromDate(date: Date): number {
  return hashString(isoDay(date))
}

/** Combines the day's seed with a row-specific salt (e.g. `'explore-cuisines'`). */
export function saltedSeed(seed: number, salt: string): number {
  return (seed ^ hashString(salt)) >>> 0
}

/** mulberry32: a tiny, fast, deterministic PRNG. Same seed, same sequence, every platform. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates, driven by `rand` so it is reproducible. */
export function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Picks (up to) `n` items deterministically, seeded by `seed` and `salt`. Order among the picked
 * items is also shuffled, so "the same 2 cuisines" don't always land in the same slots. */
export function seededPick<T>(items: readonly T[], n: number, seed: number, salt: string): T[] {
  return seededShuffle(items, mulberry32(saltedSeed(seed, salt))).slice(0, Math.max(0, n))
}

/**
 * A window of `n` consecutive items from an already-ranked list, sliding by a seeded offset. Used
 * where the list's own order matters (best match first) but a fixed top-N would show literally
 * the same cards forever: this keeps the ranking within the window while rotating which window of
 * the top results is shown, so the row still looks fresh from day to day.
 */
export function dailyWindow<T>(items: readonly T[], n: number, seed: number, salt: string): T[] {
  if (items.length <= n) return [...items]
  const span = items.length - n + 1
  const offset = mulberry32(saltedSeed(seed, salt))() * span
  const start = Math.min(span - 1, Math.floor(offset))
  return items.slice(start, start + n)
}
