import { describe, expect, it } from 'vitest'
import { WebDb } from './webDb'
import { runMigrations } from './types'
import { USER_DB_MIGRATIONS } from './userSchema'

describe('WebDb', () => {
  it('opens an in-memory database and runs migrations to the latest version', async () => {
    const db = new WebDb('user.db')
    await db.open()
    await runMigrations(db, USER_DB_MIGRATIONS)

    expect(await db.getVersion()).toBe(6)
    const settings = await db.query('SELECT * FROM settings')
    expect(settings.rows).toEqual([
      {
        id: 1,
        people_default: 2,
        servings_per_person: 1.5,
        units: 'metric',
        diet_preset: 'everything',
        show_breakfast: 0,
      },
    ])

    await db.close()
  })

  it('does not re-run a migration already applied', async () => {
    const db = new WebDb('user.db')
    await db.open()
    await runMigrations(db, USER_DB_MIGRATIONS)
    await expect(runMigrations(db, USER_DB_MIGRATIONS)).resolves.not.toThrow()
    await db.close()
  })
})
