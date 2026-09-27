import { describe, expect, it } from 'vitest'
import { WebDb } from './webDb'
import { runMigrations } from './types'
import { USER_DB_MIGRATIONS } from './userSchema'
import { exportUserDb, importUserDb } from './backup'

async function seededDb(): Promise<WebDb> {
  const db = new WebDb('user.db')
  await db.open()
  await runMigrations(db, USER_DB_MIGRATIONS)
  await db.run(
    'UPDATE settings SET people_default = ?, servings_per_person = ?, units = ?, diet_preset = ? WHERE id = 1',
    [4, 1.5, 'us', 'no_red_meat'],
  )
  await db.run('INSERT INTO favorites (recipe_id, created_at) VALUES (?, ?)', [
    'r01',
    '2026-01-01T00:00:00.000Z',
  ])
  await db.run('INSERT INTO my_recipes (id, title, data) VALUES (?, ?, ?)', [
    'my-1',
    'Weeknight Dal',
    JSON.stringify({ ingredients: ['lentils', 'onion'] }),
  ])
  await db.run('INSERT INTO kitchen_items (ingredient_id, quantity, unit) VALUES (?, ?, ?)', [
    'onion',
    3,
    'unit',
  ])
  return db
}

describe('backup round trip', () => {
  it('exports every user.db table and re-imports it into a fresh database unchanged', async () => {
    const source = await seededDb()
    const backup = await exportUserDb(source)
    await source.close()

    expect(backup.format).toBe('recipe-app-user-backup')
    expect(backup.tables.favorites).toHaveLength(1)
    expect(backup.tables.my_recipes).toHaveLength(1)

    // Round trip through JSON, as a real file export/import would.
    const roundTripped = JSON.parse(JSON.stringify(backup)) as typeof backup

    const target = new WebDb('user.db')
    await target.open()
    await runMigrations(target, USER_DB_MIGRATIONS)
    await importUserDb(target, roundTripped)

    const reExported = await exportUserDb(target)
    expect(reExported.tables).toEqual(backup.tables)

    const settings = await target.query('SELECT * FROM settings')
    expect(settings.rows[0]).toMatchObject({
      people_default: 4,
      servings_per_person: 1.5,
      units: 'us',
      diet_preset: 'no_red_meat',
    })

    await target.close()
  })

  it('rejects a file that is not a recipe-app backup', async () => {
    const db = new WebDb('user.db')
    await db.open()
    await runMigrations(db, USER_DB_MIGRATIONS)

    await expect(
      importUserDb(db, {
        // @ts-expect-error deliberately wrong format for the test
        format: 'something-else',
        version: 1,
        exportedAt: '',
        tables: {},
      }),
    ).rejects.toThrow(/not a recipe-app backup/)

    await db.close()
  })
})
