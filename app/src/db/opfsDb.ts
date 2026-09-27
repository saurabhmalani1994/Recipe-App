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
  method: string
  args: unknown[]
}

interface ResultMessage {
  id: number
  result?: unknown
  error?: string
}

let worker: Worker | null = null
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

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./opfsWorker.ts', import.meta.url), { type: 'module' })
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

function call<T>(method: string, args: unknown[] = []): Promise<T> {
  const w = getWorker()
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    const message: CallMessage = { id, method, args }
    w.postMessage(message)
  })
}

let opfsSupportedPromise: Promise<boolean> | null = null

/** Whether this browser/context can actually stand up the OPFS SAH pool VFS. */
export async function opfsSupported(): Promise<boolean> {
  opfsSupportedPromise ??= (async () => {
    if (!browserMightSupportOpfs()) return false
    try {
      await call('probe')
      return true
    } catch {
      return false
    }
  })()
  return opfsSupportedPromise
}

export class OpfsDb implements VersionedDb {
  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  async open(): Promise<void> {
    await call('open', [this.name])
  }

  async close(): Promise<void> {
    await call('close')
  }

  async execute(sql: string): Promise<void> {
    await call('execute', [sql])
  }

  async run(sql: string, params: SqlParam[] = []): Promise<void> {
    await call('run', [sql, params])
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<QueryResult<Row>> {
    return await call<QueryResult<Row>>('query', [sql, params])
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await call('beginTransaction')
    try {
      const result = await fn()
      await call('commit')
      return result
    } catch (error) {
      await call('rollback')
      throw error
    }
  }

  async getVersion(): Promise<number> {
    return await call<number>('getVersion')
  }

  async setVersion(version: number): Promise<void> {
    await call('setVersion', [version])
  }
}

export function createOpfsDb(name: string): Db {
  return new OpfsDb(name)
}
