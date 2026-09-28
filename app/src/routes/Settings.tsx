import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { KITCHEN_EQUIPMENT, KITCHEN_EQUIPMENT_LABELS } from '../data/equipment'
import { getUserDb, PANTRY_DEFAULT_SLUGS } from '../db'
import { exportUserDb, importUserDb, shareBackup, type BackupFile } from '../db/backup'
import { ingredientName, searchIngredientSlugs } from '../corpus/slugs'
import { Segmented, Stepper, SwitchRow } from '../components/ui/Controls'
import { Icon } from '../components/ui/Icon'
import { Skeleton } from '../components/ui/Section'
import { useSnackbar } from '../components/ui/Snackbar'
import { isInKitchen, addKitchenItem, removeKitchenItem } from '../features/kitchen/kitchenRepo'
import {
  getSettings,
  listAvoidIngredients,
  listKitchenEquipment,
  setAvoidIngredient,
  setKitchenEquipment,
  updateSettings,
  type AppSettings,
  type AvoidIngredient,
  type AvoidMode,
} from '../features/settings/settingsRepo'
import { DIET_PRESETS, DIET_PRESET_LABELS, useDiet } from '../state/diet'

const AVOID_MODE_LABELS: Record<AvoidMode, string> = {
  hide: 'Hide recipes with it',
  lower: 'Rank them lower',
}

const DIET_HINTS: Record<(typeof DIET_PRESETS)[number], string> = {
  everything: 'No filter',
  vegetarian: 'No meat or fish; recipes that swap easily still show',
  no_red_meat: 'Chicken and fish are fine',
}

/** The diet cache `state/diet.tsx` keeps in front of user.db; a restore must drop it. */
const DIET_CACHE_KEY = 'recipe-app.diet-preset-cache'

function Group({
  title,
  hint,
  children,
  testId,
}: {
  title: string
  hint?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section className="settings-section" aria-label={title} data-testid={testId}>
      <h3 className="settings-section__title">{title}</h3>
      {hint && <p className="settings-section__hint">{hint}</p>}
      <div className="settings-card">{children}</div>
    </section>
  )
}

/**
 * Settings (S22b layout): grouped sections of native-feeling rows — Servings, Default diet, My
 * kitchen (equipment and pantry staples), Ingredients I avoid, and Backup. The top bar carries
 * the title.
 */
export function Settings() {
  const { defaultPreset: dietPreset, setDefaultPreset: setDietPreset } = useDiet()
  const { show } = useSnackbar()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [equipment, setEquipment] = useState<Set<string>>(new Set())
  const [pantry, setPantry] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  // S16: "ingredients I avoid" — a slug the type-ahead below found, plus its hide/lower mode.
  const [avoidList, setAvoidList] = useState<AvoidIngredient[]>([])
  const [avoidQuery, setAvoidQuery] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      const [loadedSettings, loadedEquipment, pantryFlags, loadedAvoid] = await Promise.all([
        getSettings(),
        listKitchenEquipment(),
        Promise.all(
          PANTRY_DEFAULT_SLUGS.map(async (slug) => [slug, await isInKitchen(slug)] as const),
        ),
        listAvoidIngredients(),
      ])
      if (!mounted) return
      setSettings(loadedSettings)
      setEquipment(loadedEquipment)
      setPantry(new Set(pantryFlags.filter(([, has]) => has).map(([slug]) => slug)))
      setAvoidList(loadedAvoid)
      setLoaded(true)
    })()
    return () => {
      mounted = false
    }
  }, [])

  const avoidedSlugs = useMemo(() => new Set(avoidList.map((a) => a.slug)), [avoidList])
  const avoidSuggestions = useMemo(
    () => searchIngredientSlugs(avoidQuery, 8).filter((s) => !avoidedSlugs.has(s.slug)),
    [avoidQuery, avoidedSlugs],
  )

  async function addAvoid(slug: string) {
    await setAvoidIngredient(slug, 'hide')
    setAvoidList((prev) => [...prev, { slug, mode: 'hide' }])
    setAvoidQuery('')
  }

  async function changeAvoidMode(slug: string, mode: AvoidMode) {
    await setAvoidIngredient(slug, mode)
    setAvoidList((prev) => prev.map((a) => (a.slug === slug ? { ...a, mode } : a)))
  }

  async function removeAvoid(item: AvoidIngredient) {
    await setAvoidIngredient(item.slug, null)
    setAvoidList((prev) => prev.filter((a) => a.slug !== item.slug))
    show({
      message: `Stopped avoiding ${ingredientName(item.slug)}`,
      onAction: () => {
        void setAvoidIngredient(item.slug, item.mode).then(() =>
          setAvoidList((prev) => [...prev, item]),
        )
      },
    })
  }

  async function patch(next: Partial<AppSettings>) {
    const updated = await updateSettings(next)
    setSettings(updated)
    if (next.dietPreset) setDietPreset(next.dietPreset)
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

  async function exportBackup() {
    setBackupBusy(true)
    try {
      await shareBackup(await exportUserDb(await getUserDb()))
    } catch (error) {
      show({ message: `Backup failed: ${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBackupBusy(false)
    }
  }

  async function readBackup(file: File) {
    setRestoreError(null)
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile
      if (parsed.format !== 'recipe-app-user-backup') throw new Error('not a Recipe App backup')
      setPendingRestore(parsed)
    } catch (error) {
      setRestoreError(
        `That file could not be read: ${error instanceof Error ? error.message : String(error)}.`,
      )
    }
  }

  async function restore() {
    if (!pendingRestore) return
    setBackupBusy(true)
    try {
      await importUserDb(await getUserDb(), pendingRestore)
      // state/diet.tsx fronts user.db with a cache; drop it so the restored default wins.
      try {
        window.localStorage.removeItem(DIET_CACHE_KEY)
      } catch {
        // Storage blocked: the cache cannot be there either.
      }
      window.location.reload()
    } catch (error) {
      setRestoreError(`Restore failed: ${error instanceof Error ? error.message : String(error)}.`)
      setBackupBusy(false)
    }
  }

  if (!loaded || !settings) {
    return (
      <section className="screen screen--settings" data-testid="screen-settings">
        <Skeleton className="settings-skeleton" />
        <p className="visually-hidden" role="status">
          Loading…
        </p>
      </section>
    )
  }

  return (
    <section className="screen screen--settings" data-testid="screen-settings">
      <Group title="Servings" hint="Recipes scale to people × servings per person, rounded up.">
        <div className="list-row">
          <span className="list-row__text">
            <span className="list-row__label">People</span>
            <span className="list-row__hint">Who you usually cook for</span>
          </span>
          <Stepper
            label="people"
            value={settings.peopleDefault}
            onChange={(n) => void patch({ peopleDefault: n })}
          />
        </div>
        <div className="list-row">
          <span className="list-row__text">
            <span className="list-row__label">Servings per person</span>
            <span className="list-row__hint">1.5 leaves a little for lunch</span>
          </span>
          <Stepper
            label="servings per person"
            value={settings.servingsPerPerson}
            min={0.5}
            max={5}
            step={0.5}
            onChange={(n) => void patch({ servingsPerPerson: n })}
          />
        </div>
        <div className="list-row">
          <span className="list-row__text">
            <span className="list-row__label">Units</span>
          </span>
          <Segmented
            label="Units"
            value={settings.units}
            onChange={(units) => void patch({ units })}
            options={[
              { value: 'metric', label: 'Metric' },
              { value: 'us', label: 'US' },
            ]}
          />
        </div>
        <SwitchRow
          label="Show breakfast on the plan"
          checked={settings.showBreakfast}
          onChange={(on) => void patch({ showBreakfast: on })}
        />
      </Group>

      <Group
        title="Default diet"
        hint="Home and Cook start with this. The Diet chip there changes it for the moment."
      >
        <div role="radiogroup" aria-label="Diet preset">
          {DIET_PRESETS.map((value) => (
            <label key={value} className="list-row radio-row">
              <span className="list-row__text">
                <span className="list-row__label">{DIET_PRESET_LABELS[value]}</span>
                <span className="list-row__hint">{DIET_HINTS[value]}</span>
              </span>
              <input
                type="radio"
                name="diet-preset"
                className="radio-row__input"
                aria-label={DIET_PRESET_LABELS[value]}
                checked={dietPreset === value}
                onChange={() => void patch({ dietPreset: value })}
              />
              <span className="radio-row__mark" aria-hidden="true">
                {dietPreset === value && <Icon name="check" size={20} />}
              </span>
            </label>
          ))}
        </div>
      </Group>

      <Group title="My kitchen equipment" hint="Cook’s “Use only…” filter starts from these.">
        {KITCHEN_EQUIPMENT.map((id) => (
          <SwitchRow
            key={id}
            label={KITCHEN_EQUIPMENT_LABELS[id]}
            checked={equipment.has(id)}
            onChange={(on) => void toggleEquipment(id, on)}
          />
        ))}
      </Group>

      <Group title="Pantry staples" hint="Assumed on hand. Turn off anything you don’t always have.">
        {PANTRY_DEFAULT_SLUGS.map((slug) => (
          <SwitchRow
            key={slug}
            label={ingredientName(slug)}
            checked={pantry.has(slug)}
            onChange={(on) => void togglePantry(slug, on)}
          />
        ))}
      </Group>

      <Group
        title="Ingredients I avoid"
        hint="A parent ingredient covers its varieties (sour cream covers all its varieties)."
      >
        <div className="settings-card__pad">
          <label htmlFor="avoid-search" className="visually-hidden">
            Add an ingredient to avoid
          </label>
          <div className="search-field">
            <Icon name="search" size={20} className="search-field__icon" />
            <input
              id="avoid-search"
              type="text"
              value={avoidQuery}
              autoComplete="off"
              placeholder="Add one: sour cream, cool whip…"
              onChange={(e) => setAvoidQuery(e.target.value)}
            />
          </div>
          {avoidSuggestions.length > 0 && (
            <ul className="suggestions" data-testid="avoid-suggestions">
              {avoidSuggestions.map((s) => (
                <li key={s.slug}>
                  <button type="button" onClick={() => void addAvoid(s.slug)}>
                    <Icon name="plus" size={20} />
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {avoidList.length === 0 ? (
          <p className="list-row list-row--empty">Nothing avoided yet.</p>
        ) : (
          <ul className="avoid-list" data-testid="avoid-list">
            {avoidList.map((item) => (
              <li
                key={item.slug}
                className="list-row avoid-item"
                data-testid={`avoid-item-${item.slug}`}
              >
                <span className="list-row__text">
                  <span className="list-row__label">{ingredientName(item.slug)}</span>
                  <select
                    className="inline-select"
                    aria-label={`How to treat ${ingredientName(item.slug)}`}
                    value={item.mode}
                    onChange={(e) => void changeAvoidMode(item.slug, e.target.value as AvoidMode)}
                  >
                    {(['hide', 'lower'] as const).map((mode) => (
                      <option key={mode} value={mode}>
                        {AVOID_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Stop avoiding ${ingredientName(item.slug)}`}
                  onClick={() => void removeAvoid(item)}
                >
                  <Icon name="close" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group
        title="Backup"
        hint="Everything you have added: plans, lists, favorites, your recipes and these settings."
        testId="settings-backup"
      >
        <button
          type="button"
          className="list-row list-row--button"
          disabled={backupBusy}
          onClick={() => void exportBackup()}
        >
          <Icon name="download" />
          <span className="list-row__text">
            <span className="list-row__label">Export a backup</span>
            <span className="list-row__hint">Saves a .json file you can keep or share</span>
          </span>
        </button>
        <button
          type="button"
          className="list-row list-row--button"
          disabled={backupBusy}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="upload" />
          <span className="list-row__text">
            <span className="list-row__label">Restore from a backup</span>
            <span className="list-row__hint">Replaces what is on this device</span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void readBackup(file)
          }}
        />
        {restoreError && <p className="status-line settings-card__pad">{restoreError}</p>}
        {pendingRestore && (
          <div className="restore-confirm settings-card__pad" role="alert">
            <p>
              Restore the backup from{' '}
              {new Date(pendingRestore.exportedAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              ? It replaces everything on this device.
            </p>
            <div className="restore-confirm__actions">
              <button
                type="button"
                className="button button--quiet"
                onClick={() => setPendingRestore(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={backupBusy}
                onClick={() => void restore()}
              >
                Restore
              </button>
            </div>
          </div>
        )}
      </Group>
    </section>
  )
}
