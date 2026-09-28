import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import type { Db, QueryResult, SqlParam, VersionedDb } from './types'

/**
 * Native implementation, backed by @capacitor-community/sqlite's Android/iOS plugin. Also used
 * on the web build when `jeep-sqlite` is registered (see `webDb.ts` for the direct-wasm path
 * used in dev/tests, where no custom element or Capacitor bridge is needed).
 */
export class CapacitorDb implements VersionedDb {
  readonly name: string
  private connection: SQLiteConnection
  private db: SQLiteDBConnection | null = null
  private readonly readonly: boolean

  /** `readonly` opens an existing file read-only (corpus.db, S6). */
  constructor(name: string, readonly = false) {
    this.name = name
    this.readonly = readonly
    this.connection = new SQLiteConnection(CapacitorSQLite)
  }

  async open(): Promise<void> {
    this.db = await this.connection.createConnection(
      this.name,
      false,
      'no-encryption',
      1,
      this.readonly,
    )
    await this.db.open()
  }

  async close(): Promise<void> {
    if (!this.db) return
    await this.db.close()
    await this.connection.closeConnection(this.name, this.readonly)
    this.db = null
  }

  private conn(): SQLiteDBConnection {
    if (!this.db) throw new Error(`${this.name}: open() before use`)
    return this.db
  }

  async execute(sql: string): Promise<void> {
    await this.conn().execute(sql, false)
  }

  async run(sql: string, params: SqlParam[] = []): Promise<void> {
    await this.conn().run(sql, params, false)
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<QueryResult<Row>> {
    const result = await this.conn().query(sql, params)
    return { rows: (result.values ?? []) as Row[] }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const conn = this.conn()
    await conn.beginTransaction()
    try {
      const result = await fn()
      await conn.commitTransaction()
      return result
    } catch (error) {
      await conn.rollbackTransaction()
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

export function createNativeDb(name: string): Db {
  return new CapacitorDb(name)
}
