import { Capacitor } from '@capacitor/core'
import { createNativeDb } from './capacitorDb'
import { createWebDb } from './webDb'
import { runMigrations, type Db, type VersionedDb } from './types'
import { USER_DB_MIGRATIONS } from './userSchema'
import { hydrateFromLocalStorage, withLocalStoragePersistence } from './persistence'

export * from './types'
export { USER_DB_MIGRATIONS, USER_DB_TABLES, PANTRY_DEFAULT_SLUGS } from './userSchema'

export function createDb(name: string): Db {
  return Capacitor.isNativePlatform() ? createNativeDb(name) : createWebDb(name)
}

let userDbSingleton: Promise<Db> | null = null

/**
 * Opens (once) and migrates `user.db`, returning the same connection on every call. On the web
 * build (in-memory sqlite, see `webDb.ts`) this also rehydrates from, and persists back to,
 * `localStorage` — see `persistence.ts`.
 */
export function getUserDb(): Promise<Db> {
  userDbSingleton ??= (async () => {
    const native = Capacitor.isNativePlatform()
    const db = createDb('user.db') as VersionedDb
    await db.open()
    await runMigrations(db, USER_DB_MIGRATIONS)
    if (native) return db
    await hydrateFromLocalStorage(db)
    return withLocalStoragePersistence(db)
  })()
  return userDbSingleton
}

/** Test-only: forces the next `getUserDb()` call to open a fresh connection. */
export function resetUserDbForTests(): void {
  userDbSingleton = null
}

/** Opens `corpus.db` read-only. Throws until `ingest` ships a real file to bundle. */
export function getCorpusDb(): Promise<Db> {
  throw new Error('corpus.db is not bundled yet — see src/corpus/draft.ts for the dev fixture')
}
