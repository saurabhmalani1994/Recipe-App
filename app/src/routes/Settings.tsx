import { useEffect, useState } from 'react'
import { KITCHEN_EQUIPMENT, KITCHEN_EQUIPMENT_LABELS } from '../data/equipment'
import { PANTRY_DEFAULT_SLUGS } from '../db'
import { ingredientName } from '../corpus/slugs'
import { isInKitchen, addKitchenItem, removeKitchenItem } from '../features/kitchen/kitchenRepo'
import {
  getSettings,
  listKitchenEquipment,
  setKitchenEquipment,
  updateSettings,
  type AppSettings,
} from '../features/settings/settingsRepo'
import { DIET_PRESETS, DIET_PRESET_LABELS, useDiet } from '../state/diet'

export function Settings() {
  const { preset: dietPreset, setPreset: setDietPreset } = useDiet()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [equipment, setEquipment] = useState<Set<string>>(new Set())
  const [pantry, setPantry] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      const [loadedSettings, loadedEquipment, pantryFlags] = await Promise.all([
        getSettings(),
        listKitchenEquipment(),
        Promise.all(
          PANTRY_DEFAULT_SLUGS.map(async (slug) => [slug, await isInKitchen(slug)] as const),
        ),
      ])
      if (!mounted) return
      setSettings(loadedSettings)
      setEquipment(loadedEquipment)
      setPantry(new Set(pantryFlags.filter(([, has]) => has).map(([slug]) => slug)))
      setLoaded(true)
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function patch(next: Partial<AppSettings>) {
    const updated = await updateSettings(next)
    setSettings(updated)
    if (next.dietPreset && next.dietPreset !== dietPreset) setDietPreset(next.dietPreset)
  }

  async function toggleEquipment(id: string, owned: boolean) {
    await setKitchenEquipment(id, owned)
    setEquipment((prev) => {
      const next = new Set(prev)
      if (owned) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function togglePantry(slug: string, has: boolean) {
    if (has) await addKitchenItem(slug)
    else await removeKitchenItem(slug)
    setPantry((prev) => {
      const next = new Set(prev)
      if (has) next.add(slug)
      else next.delete(slug)
      return next
    })
  }

  if (!loaded || !settings) {
    return (
      <section className="screen" data-testid="screen-settings">
        <h2>Settings</h2>
        <p className="screen__placeholder">Loading…</p>
      </section>
    )
  }

  return (
    <section className="screen" data-testid="screen-settings">
      <h2>Settings</h2>

      <fieldset className="settings-group">
        <legend>Servings</legend>
        <label className="settings-field">
          People
          <input
            type="number"
            min={1}
            value={settings.peopleDefault}
            onChange={(e) => void patch({ peopleDefault: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="settings-field">
          Servings per person
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={settings.servingsPerPerson}
            onChange={(e) => void patch({ servingsPerPerson: Number(e.target.value) || 1 })}
          />
        </label>
        <label className="settings-field">
          Units
          <select
            value={settings.units}
            onChange={(e) => void patch({ units: e.target.value as AppSettings['units'] })}
          >
            <option value="metric">Metric</option>
            <option value="us">US</option>
          </select>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.showBreakfast}
            onChange={(e) => void patch({ showBreakfast: e.target.checked })}
          />
          Show breakfast on the weekly plan
        </label>
      </fieldset>

      <fieldset className="settings-group" role="radiogroup" aria-label="Diet preset">
        <legend>Diet</legend>
        {DIET_PRESETS.map((value) => (
          <label key={value} className="settings-radio">
            <input
              type="radio"
              name="diet-preset"
              checked={dietPreset === value}
              onChange={() => void patch({ dietPreset: value })}
            />
            {DIET_PRESET_LABELS[value]}
          </label>
        ))}
      </fieldset>

      <fieldset className="settings-group">
        <legend>My kitchen has</legend>
        {KITCHEN_EQUIPMENT.map((id) => (
          <label key={id} className="settings-checkbox">
            <input
              type="checkbox"
              checked={equipment.has(id)}
              onChange={(e) => void toggleEquipment(id, e.target.checked)}
            />
            {KITCHEN_EQUIPMENT_LABELS[id]}
          </label>
        ))}
      </fieldset>

      <fieldset className="settings-group">
        <legend>Pantry staples</legend>
        <p className="screen__placeholder">
          Assumed on hand. Untick anything you don&apos;t always have.
        </p>
        {PANTRY_DEFAULT_SLUGS.map((slug) => (
          <label key={slug} className="settings-checkbox">
            <input
              type="checkbox"
              checked={pantry.has(slug)}
              onChange={(e) => void togglePantry(slug, e.target.checked)}
            />
            {ingredientName(slug)}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
