import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

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

const STORAGE_KEY = 'recipe-app.diet-preset'
const DEFAULT_PRESET: DietPreset = 'everything'

function isDietPreset(value: unknown): value is DietPreset {
  return typeof value === 'string' && (DIET_PRESETS as readonly string[]).includes(value)
}

function readStoredPreset(): DietPreset {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isDietPreset(stored) ? stored : DEFAULT_PRESET
  } catch {
    // Private browsing / blocked storage: fall back to the default rather than throw.
    return DEFAULT_PRESET
  }
}

interface DietContextValue {
  preset: DietPreset
  setPreset: (preset: DietPreset) => void
}

const DietContext = createContext<DietContextValue | null>(null)

/**
 * Persists the diet preset to `localStorage` for now. `settings.diet_preset` in `user.db`
 * (see `src/db/userSchema.ts`) is the durable home for this once the settings screen writes
 * through the `Db` layer; wiring that up is out of scope for this slice.
 */
export function DietProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<DietPreset>(() => readStoredPreset())

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, preset)
    } catch {
      // Ignore: persistence is best-effort in a blocked-storage environment.
    }
  }, [preset])

  const setPreset = useCallback((next: DietPreset) => {
    setPresetState(next)
  }, [])

  const value = useMemo(() => ({ preset, setPreset }), [preset, setPreset])

  return <DietContext.Provider value={value}>{children}</DietContext.Provider>
}

export function useDiet(): DietContextValue {
  const context = useContext(DietContext)
  if (!context) throw new Error('useDiet() must be used inside <DietProvider>')
  return context
}
