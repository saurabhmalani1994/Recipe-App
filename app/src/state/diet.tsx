import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getSettings, updateSettings } from '../features/settings/settingsRepo'

/**
 * The three diet presets from docs/PRODUCT.md ("Diet quick switch"). Owner (D5): "it would be
 * good to be able to easily filter to vegetarian and to fish+poultry ... when i'm cooking for
 * her".
 */
export const DIET_PRESETS = ['everything', 'vegetarian', 'no_red_meat'] as const
export type DietPreset = (typeof DIET_PRESETS)[number]

export const DIET_PRESET_LABELS: Record<DietPreset, string> = {
  everything: 'Everything',
  vegetarian: 'Vegetarian',
  no_red_meat: 'No red meat',
}

const DEFAULT_PRESET: DietPreset = 'everything'

/**
 * S6b #1: `settings.diet_preset` is written through a Worker (the OPFS-backed `user.db`,
 * `db/opfsDb.ts`), so the write is a `postMessage` round trip, not something that finishes in the
 * same tick as the click. The switch used to fire it and forget (`void updateSettings(...)`),
 * so a reload (or the app being closed) right after tapping could land before the round trip
 * completed — the smoke test "keeps the diet switch persisted across a reload" failed about 1
 * run in 3 on exactly this race. `localStorage.setItem` is synchronous and cheap, so `setPreset`
 * writes this cache *before* returning, and startup prefers it over whatever `user.db` reports
 * (which is either the same value once its write lands, or, on the very first read after a crash
 * mid-write, stale) — the last thing the user tapped always wins. `user.db` remains the durable,
 * queryable store (used by backup/export, native, the engine); this is a same-tab durability
 * fast path in front of it, not a replacement.
 */
const CACHE_KEY = 'recipe-app.diet-preset-cache'

function readCache(): DietPreset | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw && (DIET_PRESETS as readonly string[]).includes(raw) ? (raw as DietPreset) : null
  } catch {
    return null
  }
}

function writeCache(preset: DietPreset): void {
  try {
    window.localStorage.setItem(CACHE_KEY, preset)
  } catch {
    // Best-effort: a full/blocked store just loses the fast path, not the db write below.
  }
}

// Note for whoever builds backup restore: `importUserDb` (`db/backup.ts`) writes `user.db`
// directly, without going through `setPreset`, so a restore should also
// `window.localStorage.removeItem('recipe-app.diet-preset-cache')` before the next reload —
// otherwise this cache keeps overriding the restored `diet_preset` with whatever was last
// tapped on this device. No restore UI exists yet, so nothing calls it today.

interface DietContextValue {
  preset: DietPreset
  setPreset: (preset: DietPreset) => void
}

const DietContext = createContext<DietContextValue | null>(null)

/**
 * Persists the diet preset through `settings.diet_preset` in `user.db` (S7a: moved off
 * `localStorage`, closing open item 1 in orch/reports/S2.md), fronted by the synchronous cache
 * above (S6b #1). The cached value (if any), else the default, renders immediately; once
 * `getUserDb()` resolves, the real stored value takes over only when there was no cache to trust.
 */
export function DietProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<DietPreset>(() => readCache() ?? DEFAULT_PRESET)
  // Guards against the initial async load resolving *after* the user has already changed the
  // preset (e.g. clicking the switch before getUserDb() settles) and stomping their choice.
  const userChanged = useRef(readCache() !== null)

  useEffect(() => {
    let mounted = true
    getSettings()
      .then((settings) => {
        if (mounted && !userChanged.current) setPresetState(settings.dietPreset)
      })
      .catch(() => {
        // Db unavailable (e.g. still initialising): keep the default.
      })
    return () => {
      mounted = false
    }
  }, [])

  const setPreset = useCallback((next: DietPreset) => {
    userChanged.current = true
    writeCache(next)
    setPresetState(next)
    void updateSettings({ dietPreset: next })
  }, [])

  const value = useMemo(() => ({ preset, setPreset }), [preset, setPreset])

  return <DietContext.Provider value={value}>{children}</DietContext.Provider>
}

export function useDiet(): DietContextValue {
  const context = useContext(DietContext)
  if (!context) throw new Error('useDiet() must be used inside <DietProvider>')
  return context
}
