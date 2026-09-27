import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import type { Db, QueryResult, SqlParam, VersionedDb } from './types'

/**
 * Web implementation, backed by `@sqlite.org/sqlite-wasm` directly rather than
 * `@capacitor-community/sqlite`'s `jeep-sqlite` web store.
 *
 * Chosen because it needs no custom element bootstrap: the same plugin API
 * (`CapacitorDb`, in `capacitorDb.ts`) already gives parity for native and a
 * jeep-sqlite-backed web build later, and this direct path is what dev and
 * Vitest/Playwright run against, in-memory, with nothing async to register first.
 */
export class WebDb implements VersionedDb {
  readonly name: string
  private db: Database | null = null

  constructor(name: string) {
    this.name = name
  }

  async open(): Promise<void> {
    const sqlite3 = await sqlite3InitModule()
    this.db = new sqlite3.oo1.DB(':memory:', 'ct')
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  private conn(): Database {
    if (!this.db) throw new Error(`${this.name}: open() before use`)
    return this.db
  }

  async execute(sql: string): Promise<void> {
    this.conn().exec(sql)
  }

  async run(sql: string, params: SqlParam[] = []): Promise<void> {
    this.conn().exec({ sql, bind: params })
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<QueryResult<Row>> {
    const rows = this.conn().exec({
      sql,
      bind: params,
      returnValue: 'resultRows',
      rowMode: 'object',
    })
    return { rows: rows as Row[] }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const conn = this.conn()
    conn.exec('BEGIN')
    try {
      const result = await fn()
      conn.exec('COMMIT')
      return result
    } catch (error) {
      conn.exec('ROLLBACK')
      throw error
    }
  }

  async getVersion(): Promise<number> {
    const result = await this.query<{ user_version: number }>('PRAGMA user_version')
    return result.rows[0]?.user_version ?? 0
  }

  async setVersion(version: number): Promise<void> {
    await this.execute(`PRAGMA user_version = ${version}`)
  }
}

export function createWebDb(name: string): Db {
  return new WebDb(name)
}
