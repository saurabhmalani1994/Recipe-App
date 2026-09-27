/**
 * The Db interface every storage backend implements. `user.db` is read/write and owned by
 * `app`. `corpus.db` is read-only and, once `ingest` lands, is opened with the same interface.
 */

export type SqlParam = string | number | null | Uint8Array

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[]
}

export interface Db {
  readonly name: string
  open(): Promise<void>
  close(): Promise<void>
  /** Runs a statement that returns no rows (DDL, or DML without needing the result). */
  execute(sql: string): Promise<void>
  /** Runs a single parameterised statement (INSERT/UPDATE/DELETE). */
  run(sql: string, params?: SqlParam[]): Promise<void>
  /** Runs a parameterised SELECT and returns its rows. */
  query<Row = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<QueryResult<Row>>
  /** Runs `fn` inside a transaction, committing on success and rolling back on throw. */
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

export interface Migration {
  version: number
  /** Statements run in order, inside a transaction, when upgrading to this version. */
  statements: string[]
}

/**
 * Applies every migration newer than the db's current `user_version` pragma, in order.
 * Each `Db` implementation is responsible for reading/writing `user_version` via `getVersion`
 * and `setVersion`, since the pragma is not exposed uniformly by every backend.
 */
export interface VersionedDb extends Db {
  getVersion(): Promise<number>
  setVersion(version: number): Promise<void>
}

export async function runMigrations(db: VersionedDb, migrations: Migration[]): Promise<void> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  const current = await db.getVersion()
  for (const migration of sorted) {
    if (migration.version <= current) continue
    await db.transaction(async () => {
      for (const statement of migration.statements) {
        await db.execute(statement)
      }
    })
    await db.setVersion(migration.version)
  }
}
