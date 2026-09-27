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

interface DietContextValue {
  preset: DietPreset
  setPreset: (preset: DietPreset) => void
}

const DietContext = createContext<DietContextValue | null>(null)

/**
 * Persists the diet preset through `settings.diet_preset` in `user.db` (S7a: moved off
 * `localStorage`, closing open item 1 in orch/reports/S2.md). The default renders immediately;
 * once `getUserDb()` resolves, the real stored value (if different) takes over.
 */
export function DietProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<DietPreset>(DEFAULT_PRESET)
  // Guards against the initial async load resolving *after* the user has already changed the
  // preset (e.g. clicking the switch before getUserDb() settles) and stomping their choice.
  const userChanged = useRef(false)

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
