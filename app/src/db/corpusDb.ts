import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite } from '@capacitor-community/sqlite'
import {
  CORPUS_BYTES,
  CORPUS_DB_URL,
  CORPUS_STAMP,
  copyEstimateSeconds,
  isAbsoluteUrl,
} from '../corpus/config'
import { CORPUS_SCHEMA_VERSION } from '../corpus/types'
import { CapacitorDb } from './capacitorDb'
import { OpfsDb, opfsHasDb, opfsImportDbFromUrl, opfsRemoveStaleDbs, opfsSupported } from './opfsDb'
import type { Db } from './types'
import { WebDb } from './webDb'

/**
 * Opens `corpus.db` read-only on both platforms (S6).
 *
 * - Web: the file at CORPUS_DB_URL is streamed into the OPFS pool once (inside the worker, so
 *   the 200 MB real corpus is never held twice) and opened from there on later visits. Where
 *   OPFS is unavailable it is fetched into memory instead.
 * - Native: the bundled asset is copied into the app's databases folder on first run
 *   (`copyFromAssets`), or downloaded when CORPUS_DB_URL is absolute (`getFromHTTPRequest`).
 *
 * Every path checks `corpus_meta.schema_version` against the generated CORPUS_SCHEMA_VERSION and
 * refuses a mismatch (schema/README.md). While this runs, `getCorpusStatus()` says "loading",
 * "downloading" or (native first launch) "copying"; a file that is not there yet ends as
 * "missing", anything else as "error".
 *
 * Read-only is enforced per platform (S21). Native opens the plugin connection with
 * readonly = true, which refuses execute() and run() outright ("not allowed in read-only mode"),
 * so nothing is executed on it. The web connections accept statements, so they get
 * `PRAGMA query_only = ON`.
 *
 * The outcome is logged for the device smoke gate in CI, which reads logcat:
 * `[corpus] ready <n> recipes`, or `[corpus] could not be opened: ...` / `[corpus] missing: ...`.
 */

export type CorpusStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'downloading' }
  /** Native first launch: the bundled asset is being copied; `estimateSeconds` 0 means unknown. */
  | { state: 'copying'; estimateSeconds: number }
  | { state: 'ready' }
  | { state: 'missing'; message: string }
  | { state: 'error'; message: string }

export class CorpusMissingError extends Error {}

let status: CorpusStatus = { state: 'idle' }
const listeners = new Set<() => void>()
let corpusPromise: Promise<Db> | null = null

function setStatus(next: CorpusStatus): void {
  status = next
  for (const listener of listeners) listener()
}

export function getCorpusStatus(): CorpusStatus {
  return status
}

export function subscribeCorpusStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens (once) and returns the read-only corpus connection. A failed open can be retried. */
export function getCorpusDb(): Promise<Db> {
  corpusPromise ??= openCorpus().then(
    (db) => {
      setStatus({ state: 'ready' })
      return db
    },
    (error: unknown) => {
      corpusPromise = null
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        error instanceof CorpusMissingError
          ? `[corpus] missing: ${message}`
          : `[corpus] could not be opened: ${message}`,
      )
      setStatus(
        error instanceof CorpusMissingError
          ? { state: 'missing', message }
          : { state: 'error', message },
      )
      throw error
    },
  )
  return corpusPromise
}

/** Test-only: forget the open connection and status. */
export function resetCorpusDbForTests(): void {
  corpusPromise = null
  status = { state: 'idle' }
}

/** Throws unless `db` is a corpus.db this build can read. */
export async function verifyCorpus(db: Db): Promise<void> {
  const result = await db.query<{ value: string }>(
    "SELECT value FROM corpus_meta WHERE key = 'schema_version'",
  )
  const version = Number(result.rows[0]?.value)
  if (version !== CORPUS_SCHEMA_VERSION) {
    throw new Error(
      `corpus.db has schema_version ${result.rows[0]?.value ?? 'none'}; this app reads ${CORPUS_SCHEMA_VERSION}`,
    )
  }
}

async function openCorpus(): Promise<Db> {
  setStatus({ state: 'loading' })
  const native = Capacitor.isNativePlatform()
  const db = native ? await openNative() : await openWeb()
  try {
    // Never on native: the read-only plugin connection throws on any execute() (S21).
    if (!native) await db.execute('PRAGMA query_only = ON')
    await verifyCorpus(db)
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM recipes')
    console.info(`[corpus] ready ${rows[0]?.n ?? 0} recipes`)
  } catch (error) {
    await db.close().catch(() => undefined)
    forgetCopy()
    throw error
  }
  return db
}

const READY_KEY = 'recipe-app.corpus-ready'

function readyCopy(): string | null {
  try {
    return window.localStorage.getItem(READY_KEY)
  } catch {
    return null
  }
}

function markCopyReady(name: string): void {
  try {
    window.localStorage.setItem(READY_KEY, name)
  } catch {
    // Without the marker the copy is simply refreshed on the next open.
  }
}

function forgetCopy(): void {
  try {
    window.localStorage.removeItem(READY_KEY)
  } catch {
    // Nothing to forget.
  }
}

function absoluteUrl(): string {
  return new URL(CORPUS_DB_URL, document.baseURI).href
}

async function openWeb(): Promise<Db> {
  const url = absoluteUrl()
  if (await opfsSupported()) {
    const name = `corpus-${CORPUS_STAMP}`
    // The marker is written only after a complete import, so a copy cut off halfway (the tab
    // closed mid-download) is imported again rather than opened.
    if (readyCopy() !== name || !(await opfsHasDb(name))) {
      setStatus({ state: 'downloading' })
      try {
        await opfsImportDbFromUrl(name, url)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/HTTP 404/.test(message)) throw new CorpusMissingError(`corpus.db not found at ${url}`)
        throw error
      }
      markCopyReady(name)
      await opfsRemoveStaleDbs('corpus-', name)
    }
    const db = new OpfsDb(name, 'corpus')
    await db.open()
    return db
  }
  setStatus({ state: 'downloading' })
  const response = await fetch(url)
  if (response.status === 404) throw new CorpusMissingError(`corpus.db not found at ${url}`)
  if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`)
  const db = new WebDb('corpus', new Uint8Array(await response.arrayBuffer()))
  await db.open()
  return db
}

async function openNative(): Promise<Db> {
  // The plugin stores `<name>SQLite.db`; copyFromAssets and getFromHTTPRequest both name the
  // file after `corpus.db`, so the connection name is `corpus`.
  const name = 'corpus'
  const exists = (await CapacitorSQLite.isDatabase({ database: name })).result === true
  const stale = readyCopy() !== CORPUS_STAMP
  if (!exists || stale) {
    const started = Date.now()
    try {
      if (isAbsoluteUrl(CORPUS_DB_URL)) {
        setStatus({ state: 'downloading' })
        await CapacitorSQLite.getFromHTTPRequest({ url: CORPUS_DB_URL, overwrite: true })
      } else {
        setStatus({ state: 'copying', estimateSeconds: copyEstimateSeconds(CORPUS_BYTES) })
        await CapacitorSQLite.copyFromAssets({ overwrite: true })
      }
      console.info(`[corpus] copied in ${Date.now() - started} ms`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw exists ? error : new CorpusMissingError(`corpus.db could not be copied: ${message}`)
    }
    markCopyReady(CORPUS_STAMP)
  }
  const db = new CapacitorDb(name, true)
  await db.open()
  return db
}
