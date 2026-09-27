import sqlite3InitModule, { type Database, type SAHPoolUtil } from '@sqlite.org/sqlite-wasm'
import type { SqlParam } from './types'

/**
 * Runs inside a dedicated Worker (spawned by `opfsDb.ts`) because the File System Access API's
 * `createSyncAccessHandle` — which `installOpfsSAHPoolVfs`'s pool needs — is only available in
 * a worker context, never on the main thread (confirmed against a real browser, not just docs:
 * `fh.createSyncAccessHandle is not a function` when tried from the page). Every method below
 * is a synchronous sqlite3 call once the pool is up, so this worker just proxies the small
 * message protocol `opfsDb.ts` speaks: `{ id, method, args }` in, `{ id, result }` or
 * `{ id, error } }` out.
 */

interface CallMessage {
  id: number
  method: string
  args: unknown[]
}

let pool: SAHPoolUtil | null = null
let db: Database | null = null

async function ensurePool(): Promise<SAHPoolUtil> {
  if (pool) return pool
  const sqlite3 = await sqlite3InitModule()
  if (typeof sqlite3.installOpfsSAHPoolVfs !== 'function') {
    throw new Error('installOpfsSAHPoolVfs is not available in this sqlite3 build')
  }
  pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'recipe-app-opfs' })
  return pool
}

function conn(): Database {
  if (!db) throw new Error('opfsWorker: open() before use')
  return db
}

async function handle(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case 'probe':
      // Feature-detection only: stand up the pool (or throw) without opening a db file.
      await ensurePool()
      return true
    case 'open': {
      const p = await ensurePool()
      db = new p.OpfsSAHPoolDb(`/${args[0] as string}.sqlite3`)
      return undefined
    }
    case 'close':
      db?.close()
      db = null
      return undefined
    case 'execute':
      conn().exec(args[0] as string)
      return undefined
    case 'run':
      conn().exec({ sql: args[0] as string, bind: args[1] as SqlParam[] })
      return undefined
    case 'query':
      return {
        rows: conn().exec({
          sql: args[0] as string,
          bind: args[1] as SqlParam[],
          returnValue: 'resultRows',
          rowMode: 'object',
        }),
      }
    case 'beginTransaction':
      conn().exec('BEGIN')
      return undefined
    case 'commit':
      conn().exec('COMMIT')
      return undefined
    case 'rollback':
      conn().exec('ROLLBACK')
      return undefined
    case 'getVersion': {
      const rows = conn().exec({
        sql: 'PRAGMA user_version',
        returnValue: 'resultRows',
        rowMode: 'object',
      }) as { user_version: number }[]
      return rows[0]?.user_version ?? 0
    }
    case 'setVersion':
      conn().exec(`PRAGMA user_version = ${Number(args[0])}`)
      return undefined
    default:
      throw new Error(`opfsWorker: unknown method "${method}"`)
  }
}

self.onmessage = (event: MessageEvent<CallMessage>) => {
  const { id, method, args } = event.data
  void handle(method, args).then(
    (result) => self.postMessage({ id, result }),
    (error: unknown) =>
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }),
  )
}
