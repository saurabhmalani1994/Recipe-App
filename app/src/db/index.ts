import { Capacitor } from '@capacitor/core'
import { createNativeDb } from './capacitorDb'
import { createWebDb } from './webDb'
import { runMigrations, type Db, type VersionedDb } from './types'
import { USER_DB_MIGRATIONS } from './userSchema'
import { hydrateFromLocalStorage, openWebUserDb, withLocalStoragePersistence } from './persistence'

export * from './types'
export {
  CorpusMissingError,
  getCorpusDb,
  getCorpusStatus,
  subscribeCorpusStatus,
  type CorpusStatus,
} from './corpusDb'
export { USER_DB_MIGRATIONS, USER_DB_TABLES, PANTRY_DEFAULT_SLUGS } from './userSchema'

export function createDb(name: string): Db {
  return Capacitor.isNativePlatform() ? createNativeDb(name) : createWebDb(name)
}

let userDbSingleton: Promise<Db> | null = null

/**
 * Opens (once) and migrates `user.db`, returning the same connection on every call. On native,
 * `CapacitorDb` already writes to a real file. On the web build, this prefers a durable
 * OPFS-backed sqlite file (`opfsDb.ts`) and only falls back to the in-memory `WebDb` plus a
 * `localStorage` snapshot (`persistence.ts`) where OPFS isn't available.
 */
export function getUserDb(): Promise<Db> {
  userDbSingleton ??= (async () => {
    if (Capacitor.isNativePlatform()) {
      const db = createNativeDb('user.db') as VersionedDb
      await db.open()
      await runMigrations(db, USER_DB_MIGRATIONS)
      return db
    }
    const { db, durable } = await openWebUserDb('user.db')
    const versioned = db as VersionedDb
    await runMigrations(versioned, USER_DB_MIGRATIONS)
    if (durable) return db
    await hydrateFromLocalStorage(db)
    return withLocalStoragePersistence(db)
  })()
  return userDbSingleton
}

/** Test-only: forces the next `getUserDb()` call to open a fresh connection. */
export function resetUserDbForTests(): void {
  userDbSingleton = null
}
