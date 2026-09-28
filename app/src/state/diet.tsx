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
// S22a: this caches the *default* (Settings). The Diet chip's session choice is never cached.

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
  /** The diet Home, Cook and the recipe views filter by right now. */
  preset: DietPreset
  /** S22a: the "Diet" filter chip on Home and Cook. For this session only: the next launch
   * starts from the default again (owner, D21: a "Filter chip in Cook & Home", with the default
   * in Settings). */
  setPreset: (preset: DietPreset) => void
  /** The default from Settings (`settings.diet_preset`), which every launch starts from. */
  defaultPreset: DietPreset
  /** Settings: persists the default and applies it now. */
  setDefaultPreset: (preset: DietPreset) => void
}

const DietContext = createContext<DietContextValue | null>(null)

/**
 * The default persists through `settings.diet_preset` in `user.db` (S7a: moved off
 * `localStorage`, closing open item 1 in orch/reports/S2.md), fronted by the synchronous cache
 * above (S6b #1). The cached value (if any), else the default, renders immediately; once
 * `getUserDb()` resolves, the real stored value takes over only when there was no cache to trust.
 * S22a: the active filter starts as that default and the Diet chip changes it for the session
 * without touching the stored default.
 */
export function DietProvider({ children }: { children: ReactNode }) {
  const [defaultPreset, setDefaultState] = useState<DietPreset>(() => readCache() ?? DEFAULT_PRESET)
  const [preset, setPresetState] = useState<DietPreset>(defaultPreset)
  // Guards against the initial async load resolving *after* the user has already changed the
  // preset (e.g. tapping the chip before getUserDb() settles) and stomping their choice.
  const defaultChanged = useRef(readCache() !== null)
  const activeChanged = useRef(false)

  useEffect(() => {
    let mounted = true
    getSettings()
      .then((settings) => {
        if (!mounted || defaultChanged.current) return
        setDefaultState(settings.dietPreset)
        if (!activeChanged.current) setPresetState(settings.dietPreset)
      })
      .catch(() => {
        // Db unavailable (e.g. still initialising): keep the default.
      })
    return () => {
      mounted = false
    }
  }, [])

  const setPreset = useCallback((next: DietPreset) => {
    activeChanged.current = true
    setPresetState(next)
  }, [])

  const setDefaultPreset = useCallback((next: DietPreset) => {
    defaultChanged.current = true
    writeCache(next)
    setDefaultState(next)
    setPresetState(next)
    void updateSettings({ dietPreset: next })
  }, [])

  const value = useMemo(
    () => ({ preset, setPreset, defaultPreset, setDefaultPreset }),
    [preset, setPreset, defaultPreset, setDefaultPreset],
  )

  return <DietContext.Provider value={value}>{children}</DietContext.Provider>
}

export function useDiet(): DietContextValue {
  const context = useContext(DietContext)
  if (!context) throw new Error('useDiet() must be used inside <DietProvider>')
  return context
}
