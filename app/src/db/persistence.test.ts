import { beforeEach, describe, expect, it } from 'vitest'
import { WebDb } from './webDb'
import { runMigrations } from './types'
import { USER_DB_MIGRATIONS } from './userSchema'
import { hydrateFromLocalStorage, withLocalStoragePersistence } from './persistence'

beforeEach(() => {
  window.localStorage.clear()
})

/** `WebDb` is `:memory:` (see webDb.ts); this is the web build's stand-in for a reload. */
describe('web localStorage persistence', () => {
  it('snapshots a write and rehydrates it into a fresh db', async () => {
    const first = new WebDb('user.db')
    await first.open()
    await runMigrations(first, USER_DB_MIGRATIONS)
    const persisted = withLocalStoragePersistence(first)

    await persisted.run('UPDATE settings SET people_default = ? WHERE id = 1', [5])
    await persisted.run('INSERT INTO favorites (recipe_id) VALUES (?)', ['r07'])

    // Simulate a reload: a brand-new in-memory db, freshly migrated.
    const second = new WebDb('user.db')
    await second.open()
    await runMigrations(second, USER_DB_MIGRATIONS)
    await hydrateFromLocalStorage(second)

    const settings = await second.query<{ people_default: number }>('SELECT * FROM settings')
    expect(settings.rows[0].people_default).toBe(5)
    const favorites = await second.query('SELECT * FROM favorites')
    expect(favorites.rows).toHaveLength(1)

    await first.close()
    await second.close()
  })

  it('starts clean when there is nothing to hydrate', async () => {
    const db = new WebDb('user.db')
    await db.open()
    await runMigrations(db, USER_DB_MIGRATIONS)
    await expect(hydrateFromLocalStorage(db)).resolves.not.toThrow()
    await db.close()
  })
})
