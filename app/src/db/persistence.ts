import type { Db, QueryResult, SqlParam } from './types'
import { exportUserDb, importUserDb } from './backup'
import { createOpfsDb, opfsSupported } from './opfsDb'
import { createWebDb } from './webDb'

/**
 * Opens the web build's `user.db` connection, preferring a durable OPFS-backed sqlite file
 * (`opfsDb.ts`) over the `:memory:` + `localStorage`-snapshot fallback below. Falls back
 * whenever OPFS isn't available (older Safari, a private-storage context, jsdom in tests, or
 * `open()` throwing for any other reason) so a reload still keeps everything the snapshot
 * always kept. Callers (`db/index.ts`) run migrations either way, and only run
 * `hydrateFromLocalStorage`/`withLocalStoragePersistence` on the non-durable path — the `Db`
 * interface returned here is identical either way.
 */
export async function openWebUserDb(name: string): Promise<{ db: Db; durable: boolean }> {
  if (await opfsSupported()) {
    try {
      const db = createOpfsDb(name)
      await db.open()
      return { db, durable: true }
    } catch {
      // Fall through to the in-memory + localStorage-snapshot path below.
    }
  }
  const db = createWebDb(name)
  await db.open()
  return { db, durable: false }
}

/**
 * `WebDb` is `:memory:` (see the comment at the top of `webDb.ts`) — a page reload starts a
 * fresh, empty database. Native builds don't need this (`CapacitorDb` writes to a real file).
 * This is the fallback for web contexts where the OPFS-backed `OpfsDb` above isn't available:
 * it snapshots `user.db` as JSON into `localStorage` after every write and rehydrates it on
 * open, reusing the existing backup format.
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
