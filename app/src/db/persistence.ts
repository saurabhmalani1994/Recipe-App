import type { Db, QueryResult, SqlParam } from './types'
import { exportUserDb, importUserDb } from './backup'

/**
 * `WebDb` is `:memory:` (see the comment at the top of `webDb.ts`) — a page reload starts a
 * fresh, empty database. Native builds don't need this (`CapacitorDb` writes to a real file),
 * but the web build has nothing durable yet, and this slice's tests rely on settings,
 * favorites, kitchen items and forks surviving a reload. Until a real persistent VFS (OPFS)
 * lands, this snapshots `user.db` as JSON into `localStorage` after every write and rehydrates
 * it on open, reusing the existing backup format. Interim; replace when `ingest`/a later slice
 * gives the web build a persistent sqlite file.
 */
const STORAGE_KEY = 'recipe-app.user-db-snapshot'

export async function hydrateFromLocalStorage(db: Db): Promise<void> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const backup = JSON.parse(raw)
    await importUserDb(db, backup)
  } catch {
    // Corrupt or blocked storage: start from the freshly migrated (default) state.
  }
}

async function persistToLocalStorage(db: Db): Promise<void> {
  try {
    const backup = await exportUserDb(db)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(backup))
  } catch {
    // Best-effort: a full/blocked store should not break the write that triggered it.
  }
}

/** Wraps `db` so every mutating call snapshots `user.db` to `localStorage` afterwards. */
export function withLocalStoragePersistence(db: Db): Db {
  return {
    name: db.name,
    open(): Promise<void> {
      return db.open()
    },
    close(): Promise<void> {
      return db.close()
    },
    execute(sql: string): Promise<void> {
      return db.execute(sql)
    },
    query<Row = Record<string, unknown>>(
      sql: string,
      params?: SqlParam[],
    ): Promise<QueryResult<Row>> {
      return db.query<Row>(sql, params)
    },
    async run(sql: string, params?: SqlParam[]): Promise<void> {
      await db.run(sql, params)
      await persistToLocalStorage(db)
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const result = await db.transaction(fn)
      await persistToLocalStorage(db)
      return result
    },
  }
}
