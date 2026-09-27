import { Capacitor } from '@capacitor/core'
import { createNativeDb } from './capacitorDb'
import { createWebDb } from './webDb'
import { runMigrations, type Db, type VersionedDb } from './types'
import { USER_DB_MIGRATIONS } from './userSchema'

export * from './types'
export { USER_DB_MIGRATIONS, USER_DB_TABLES } from './userSchema'

export function createDb(name: string): Db {
  return Capacitor.isNativePlatform() ? createNativeDb(name) : createWebDb(name)
}

let userDbSingleton: Promise<Db> | null = null

/** Opens (once) and migrates `user.db`, returning the same connection on every call. */
export function getUserDb(): Promise<Db> {
  userDbSingleton ??= (async () => {
    const db = createDb('user.db') as VersionedDb
    await db.open()
    await runMigrations(db, USER_DB_MIGRATIONS)
    return db
  })()
  return userDbSingleton
}

/** Opens `corpus.db` read-only. Throws until `ingest` ships a real file to bundle. */
export function getCorpusDb(): Promise<Db> {
  throw new Error('corpus.db is not bundled yet — see src/corpus/draft.ts for the dev fixture')
}
