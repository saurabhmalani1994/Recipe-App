import { useSyncExternalStore } from 'react'
import type { Cuisine } from '../../corpus/types'

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** True while the device reports a network connection (photos are remote; everything else is local). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/**
 * The placeholder tone (1-8, tokens `--ph-N-bg/fg`) for a cuisine: neighbours on the map share a
 * family, so a row of placeholders still reads as a considered palette, not noise.
 */
const CUISINE_TONE: Partial<Record<Cuisine, number>> = {
  indian: 2,
  persian: 2,
  middle_eastern: 2,
  north_african: 1,
  east_west_african: 1,
  mexican: 1,
  latin_american: 1,
  caribbean: 7,
  spanish: 1,
  italian: 3,
  mediterranean: 3,
  greek: 5,
  turkish: 7,
  french: 6,
  british_irish: 8,
  german_central_eu: 8,
  american: 7,
  southern_us: 7,
  chinese: 7,
  japanese: 5,
  korean: 6,
  thai: 4,
  vietnamese: 4,
  indonesian_malaysian: 4,
  filipino: 2,
  fusion_other: 3,
}

export function placeholderTone(cuisine: Cuisine | null, title: string): number {
  const tone = cuisine ? CUISINE_TONE[cuisine] : undefined
  if (tone) return tone
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (hash % 8) + 1
}

/** The dish's initial for a placeholder: the first letter or digit of the title. */
export function dishInitial(title: string): string {
  const match = /[\p{L}\p{N}]/u.exec(title)
  return match ? match[0].toUpperCase() : '·'
}

/** "You have 7 of 9", or null when the recipe has nothing to count. */
export function haveLabel(covered?: number, needed?: number): string | null {
  if (!needed || needed <= 0 || covered === undefined) return null
  return covered >= needed ? `You have all ${needed}` : `You have ${covered} of ${needed}`
}
