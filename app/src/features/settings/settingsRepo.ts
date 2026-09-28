import { getUserDb } from '../../db'
import type { DietPreset } from '../../state/diet'

export interface AppSettings {
  peopleDefault: number
  servingsPerPerson: number
  units: 'metric' | 'us'
  dietPreset: DietPreset
  /** Plan: whether the week grid shows a breakfast slot (brief S7 #1, off by default). */
  showBreakfast: boolean
}

interface SettingsRow {
  id: number
  people_default: number
  servings_per_person: number
  units: 'metric' | 'us'
  diet_preset: DietPreset
  show_breakfast: number
}

function fromRow(row: SettingsRow): AppSettings {
  return {
    peopleDefault: row.people_default,
    servingsPerPerson: row.servings_per_person,
    units: row.units,
    dietPreset: row.diet_preset,
    showBreakfast: row.show_breakfast === 1,
  }
}

/** Reads the single `settings` row (id = 1; always present after migration v1). */
export async function getSettings(): Promise<AppSettings> {
  const db = await getUserDb()
  const result = await db.query<SettingsRow>('SELECT * FROM settings WHERE id = 1')
  const row = result.rows[0]
  if (!row) throw new Error('settings row missing — migrations did not run')
  return fromRow(row)
}

/** Merges `patch` into the settings row and returns the settings afterwards. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next: AppSettings = { ...current, ...patch }
  const db = await getUserDb()
  await db.run(
    `UPDATE settings
       SET people_default = ?, servings_per_person = ?, units = ?, diet_preset = ?,
           show_breakfast = ?
     WHERE id = 1`,
    [
      next.peopleDefault,
      next.servingsPerPerson,
      next.units,
      next.dietPreset,
      next.showBreakfast ? 1 : 0,
    ],
  )
  return next
}

/** The set of equipment ids ("my kitchen has…") the user has ticked on. */
export async function listKitchenEquipment(): Promise<Set<string>> {
  const db = await getUserDb()
  const result = await db.query<{ equipment_id: string }>(
    'SELECT equipment_id FROM kitchen_equipment',
  )
  return new Set(result.rows.map((row) => row.equipment_id))
}

export async function setKitchenEquipment(equipmentId: string, owned: boolean): Promise<void> {
  const db = await getUserDb()
  if (owned) {
    await db.run('INSERT OR IGNORE INTO kitchen_equipment (equipment_id) VALUES (?)', [equipmentId])
  } else {
    await db.run('DELETE FROM kitchen_equipment WHERE equipment_id = ?', [equipmentId])
  }
}
