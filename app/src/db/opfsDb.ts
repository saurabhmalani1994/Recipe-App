import type { Db, QueryResult, SqlParam, VersionedDb } from './types'

/**
 * Web implementation backed by `@sqlite.org/sqlite-wasm`'s OPFS "SAH pool" VFS
 * (`installOpfsSAHPoolVfs`), which gives a real, durable sqlite file in the browser's Origin
 * Private File System — unlike `WebDb`'s `:memory:` connection.
 *
 * The pool needs `FileSystemFileHandle.createSyncAccessHandle`, which browsers restrict to a
 * dedicated Worker (confirmed against a real browser: calling it from the main thread throws
 * `createSyncAccessHandle is not a function`, regardless of what some docs suggest). So the
 * actual sqlite3/pool/db lives in `opfsWorker.ts`, and this class is a small RPC proxy over
 * `postMessage` that implements the same `VersionedDb` interface synchronously-looking callers
 * already use. Not every browser/context supports it (Safari < 17, a private-storage context,
 * jsdom in tests, `Worker` unavailable, …), so callers must feature-detect with
 * `opfsSupported()` — or just try `open()` and fall back on failure — rather than assume it
 * works. See `persistence.ts`, which does exactly that and falls back to `WebDb` plus the
 * `localStorage` snapshot.
 */

interface CallMessage {
  id: number
  /** Which connection the call is for; the worker keeps one per db name (S6). */
  db: string | null
  method: string
  args: unknown[]
}

interface ResultMessage {
  id: number
  result?: unknown
  error?: string
}

/**
 * Each pool is its own worker and its own OPFS directory (S6). user.db keeps the original pool;
 * corpus.db gets a second one, so writing the 200 MB corpus never blocks or shares slots with a
 * user.db write. The worker reads its pool name from `self.name`.
 */
export type OpfsPool = 'user' | 'corpus'
const POOL_NAMES: Record<OpfsPool, string> = {
  user: 'recipe-app-opfs',
  corpus: 'recipe-app-corpus',
}

const workers = new Map<OpfsPool, Worker>()
let nextId = 1
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: unknown) => void }
>()

function browserMightSupportOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof Worker !== 'undefined'
  )
}

function getWorker(pool: OpfsPool): Worker {
  const existing = workers.get(pool)
  if (existing) return existing
  const worker = new Worker(new URL('./opfsWorker.ts', import.meta.url), {
    type: 'module',
    name: POOL_NAMES[pool],
  })
  workers.set(pool, worker)
  worker.onmessage = (event: MessageEvent<ResultMessage>) => {
    const { id, result, error } = event.data
    const waiting = pending.get(id)
    if (!waiting) return
    pending.delete(id)
    if (error) waiting.reject(new Error(error))
    else waiting.resolve(result)
  }
  return worker
}

function call<T>(
  pool: OpfsPool,
  method: string,
  args: unknown[] = [],
  db: string | null = null,
): Promise<T> {
  const w = getWorker(pool)
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    const message: CallMessage = { id, db, method, args }
    w.postMessage(message)
  })
}

let opfsSupportedPromise: Promise<boolean> | null = null

/** Whether this browser/context can actually stand up the OPFS SAH pool VFS. */
export async function opfsSupported(): Promise<boolean> {
  opfsSupportedPromise ??= (async () => {
    if (!browserMightSupportOpfs()) return false
    try {
      await call('user', 'probe')
      return true
    } catch {
      return false
    }
  })()
  return opfsSupportedPromise
}

export class OpfsDb implements VersionedDb {
  readonly name: string
  private readonly pool: OpfsPool

  constructor(name: string, pool: OpfsPool = 'user') {
    this.name = name
    this.pool = pool
  }

  async open(): Promise<void> {
    await call(this.pool, 'open', [this.name], this.name)
  }

  async close(): Promise<void> {
    await call(this.pool, 'close', [], this.name)
  }

  async execute(sql: string): Promise<void> {
    await call(this.pool, 'execute', [sql], this.name)
  }

  async run(sql: string, params: SqlParam[] = []): Promise<void> {
    await call(this.pool, 'run', [sql, params], this.name)
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<QueryResult<Row>> {
    return await call<QueryResult<Row>>(this.pool, 'query', [sql, params], this.name)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await call(this.pool, 'beginTransaction', [], this.name)
    try {
      const result = await fn()
      await call(this.pool, 'commit', [], this.name)
      return result
    } catch (error) {
      await call(this.pool, 'rollback', [], this.name)
      throw error
    }
  }

  async getVersion(): Promise<number> {
    return await call<number>(this.pool, 'getVersion', [], this.name)
  }

  async setVersion(version: number): Promise<void> {
    await call(this.pool, 'setVersion', [version], this.name)
  }
}

export function createOpfsDb(name: string): Db {
  return new OpfsDb(name)
}

/** Whether the corpus OPFS pool already holds a file for db `name` (e.g. a corpus.db copied earlier). */
export async function opfsHasDb(name: string): Promise<boolean> {
  return await call<boolean>('corpus', 'hasFile', [name])
}

/** Downloads `url` into the corpus OPFS pool as db `name`, inside its worker. Resolves to bytes written. */
export async function opfsImportDbFromUrl(name: string, url: string): Promise<number> {
  return await call<number>('corpus', 'importFromUrl', [name, url])
}

/** Removes every pool db whose name starts with `prefix` except `keep`. Resolves to the count. */
export async function opfsRemoveStaleDbs(prefix: string, keep: string): Promise<number> {
  return await call<number>('corpus', 'removeFilesWithPrefix', [prefix, keep])
}
