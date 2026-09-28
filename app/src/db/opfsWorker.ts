import sqlite3InitModule, { type Database, type SAHPoolUtil } from '@sqlite.org/sqlite-wasm'
import type { SqlParam } from './types'

/**
 * Runs inside a dedicated Worker (spawned by `opfsDb.ts`) because the File System Access API's
 * `createSyncAccessHandle` — which `installOpfsSAHPoolVfs`'s pool needs — is only available in
 * a worker context, never on the main thread (confirmed against a real browser, not just docs:
 * `fh.createSyncAccessHandle is not a function` when tried from the page). Every method below
 * is a synchronous sqlite3 call once the pool is up, so this worker just proxies the small
 * message protocol `opfsDb.ts` speaks: `{ id, db, method, args }` in, `{ id, result }` or
 * `{ id, error }` out.
 *
 * `db` names the connection a call is for (S6: `user.db` and `corpus.db` are open at the same
 * time, closing S7b open item 1). Each name has its own connection in `connections`.
 */

interface CallMessage {
  id: number
  /** The connection this call is for (its `OpfsDb.name`); unused by pool-level methods. */
  db: string | null
  method: string
  args: unknown[]
}

let pool: Promise<SAHPoolUtil> | null = null
const connections = new Map<string, Database>()

/** user.db and its journal, corpus.db and its journal, one stale corpus copy, temp files. */
const MIN_CAPACITY = 8

/**
 * One pool per worker. The promise itself is shared: with two dbs opening at once, two
 * concurrent installs over the same OPFS directory would each claim the same files, and the
 * second corrupts the first ("file is not a database", seen in the S6 e2e run).
 */
function ensurePool(): Promise<SAHPoolUtil> {
  pool ??= (async () => {
    const sqlite3 = await sqlite3InitModule()
    if (typeof sqlite3.installOpfsSAHPoolVfs !== 'function') {
      throw new Error('installOpfsSAHPoolVfs is not available in this sqlite3 build')
    }
    // The page names each worker after its pool (opfsDb.ts): user.db and corpus.db live apart.
    const name = (self as unknown as { name?: string }).name || 'recipe-app-opfs'
    const installed = await sqlite3.installOpfsSAHPoolVfs({ name })
    await installed.reserveMinimumCapacity(MIN_CAPACITY)
    return installed
  })().catch((error: unknown) => {
    pool = null
    throw error
  })
  return pool
}

function fileName(name: string): string {
  return `/${name}.sqlite3`
}

function conn(name: string | null): Database {
  const db = name ? connections.get(name) : undefined
  if (!db) throw new Error(`opfsWorker: open() ${name ?? '(no db)'} before use`)
  return db
}

/**
 * Downloads `url` and writes it into the pool as `name`, all inside the worker so the page never
 * holds the bytes. Returns the bytes written.
 *
 * Not the streaming (callback) form of importDb: that one only claims its pool slot at the end,
 * so a db opened while the download runs (user.db, on a first visit) is handed the same slot and
 * the two overwrite each other ("file is not a database", seen in the S6 e2e run). Importing a
 * whole array claims the slot and writes in one synchronous step.
 */
async function importFromUrl(name: string, url: string): Promise<number> {
  const p = await ensurePool()
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return await p.importDb(fileName(name), bytes)
}

async function handle(dbName: string | null, method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'probe':
      // Feature-detection only: stand up the pool (or throw) without opening a db file.
      await ensurePool()
      return true
    case 'open': {
      const p = await ensurePool()
      const name = args[0] as string
      connections.get(name)?.close()
      connections.set(name, new p.OpfsSAHPoolDb(fileName(name)))
      return undefined
    }
    case 'close':
      if (dbName) {
        connections.get(dbName)?.close()
        connections.delete(dbName)
      }
      return undefined
    case 'hasFile': {
      const p = await ensurePool()
      return p.getFileNames().includes(fileName(args[0] as string))
    }
    case 'importFromUrl':
      return await importFromUrl(args[0] as string, args[1] as string)
    case 'removeFilesWithPrefix': {
      // Drops stale copies (an older corpus.db build) so they stop holding a pool slot and disk.
      const p = await ensurePool()
      const prefix = fileName(args[0] as string).replace(/\.sqlite3$/, '')
      const keep = fileName(args[1] as string)
      let removed = 0
      for (const file of p.getFileNames()) {
        if (file.startsWith(prefix) && file !== keep && !file.startsWith(`${keep}-`)) {
          if (p.unlink(file)) removed++
        }
      }
      return removed
    }
    case 'execute':
      conn(dbName).exec(args[0] as string)
      return undefined
    case 'run':
      conn(dbName).exec({ sql: args[0] as string, bind: args[1] as SqlParam[] })
      return undefined
    case 'query':
      return {
        rows: conn(dbName).exec({
          sql: args[0] as string,
          bind: args[1] as SqlParam[],
          returnValue: 'resultRows',
          rowMode: 'object',
        }),
      }
    case 'beginTransaction':
      conn(dbName).exec('BEGIN')
      return undefined
    case 'commit':
      conn(dbName).exec('COMMIT')
      return undefined
    case 'rollback':
      conn(dbName).exec('ROLLBACK')
      return undefined
    case 'getVersion': {
      const rows = conn(dbName).exec({
        sql: 'PRAGMA user_version',
        returnValue: 'resultRows',
        rowMode: 'object',
      }) as { user_version: number }[]
      return rows[0]?.user_version ?? 0
    }
    case 'setVersion':
      conn(dbName).exec(`PRAGMA user_version = ${Number(args[0])}`)
      return undefined
    default:
      throw new Error(`opfsWorker: unknown method "${method}"`)
  }
}

self.onmessage = (event: MessageEvent<CallMessage>) => {
  const { id, db, method, args } = event.data
  void handle(db, method, args).then(
    (result) => self.postMessage({ id, result }),
    (error: unknown) =>
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
  )
}
