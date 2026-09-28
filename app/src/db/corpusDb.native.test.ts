import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebDb } from './webDb'

/**
 * S21, rule 12: the exact input that broke the owner's phone. On Android, corpus.db is opened
 * through @capacitor-community/sqlite with readonly = true, and the plugin refuses execute(),
 * executeSet() and run() on such a connection with "not allowed in read-only mode" (the JS layer
 * rejects with that bare string before the bridge; CapacitorSQLite.java throws the same text).
 * Its beginTransaction() only looks for the read/write connection, so on a read-only one it
 * throws "No available connection for database corpus".
 *
 * The fake below reproduces those refusals; its query() answers from the 300-recipe fixture.
 */

const READ_ONLY_REFUSAL = 'not allowed in read-only mode'

const plugin = vi.hoisted(() => ({
  hasFile: false,
  copies: 0,
  refused: [] as string[],
  image: null as Uint8Array | null,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))

vi.mock('@capacitor-community/sqlite', () => {
  class FakeDbConnection {
    private backing: WebDb | null = null
    private readonly name: string
    private readonly readonly: boolean
    constructor(name: string, readonly: boolean) {
      this.name = name
      this.readonly = readonly
    }
    async open() {
      if (!plugin.hasFile) throw new Error(`Open: database ${this.name} does not exist`)
      this.backing = new WebDb(this.name, plugin.image)
      await this.backing.open()
    }
    async close() {
      await this.backing?.close()
      this.backing = null
    }
    async execute(statements: string) {
      if (this.readonly) {
        plugin.refused.push(`execute: ${statements}`)
        return Promise.reject(READ_ONLY_REFUSAL)
      }
      await this.backing!.execute(statements)
      return { changes: { changes: 0 } }
    }
    async executeSet() {
      if (this.readonly) {
        plugin.refused.push('executeSet')
        return Promise.reject(READ_ONLY_REFUSAL)
      }
      return { changes: { changes: 0 } }
    }
    async run(statement: string) {
      if (this.readonly) {
        plugin.refused.push(`run: ${statement}`)
        return Promise.reject(READ_ONLY_REFUSAL)
      }
      return { changes: { changes: 0 } }
    }
    async query(statement: string, values: unknown[] = []) {
      const result = await this.backing!.query(statement, values as never[])
      return { values: result.rows }
    }
    async beginTransaction() {
      if (this.readonly) {
        plugin.refused.push('beginTransaction')
        throw new Error(`No available connection for database ${this.name}`)
      }
      return { changes: { changes: 0 } }
    }
    async commitTransaction() {
      return { changes: { changes: 0 } }
    }
    async rollbackTransaction() {
      return { changes: { changes: 0 } }
    }
  }
  class SQLiteConnection {
    async createConnection(
      database: string,
      _encrypted: boolean,
      _mode: string,
      _version: number,
      readonly: boolean,
    ) {
      return new FakeDbConnection(database, readonly)
    }
    async closeConnection() {}
  }
  return {
    SQLiteConnection,
    CapacitorSQLite: {
      isDatabase: async () => ({ result: plugin.hasFile }),
      copyFromAssets: async () => {
        plugin.copies += 1
        plugin.hasFile = true
      },
      getFromHTTPRequest: async () => {
        plugin.hasFile = true
      },
    },
  }
})

const { getCorpusDb, getCorpusStatus, resetCorpusDbForTests, subscribeCorpusStatus } =
  await import('./corpusDb')
const { CapacitorDb } = await import('./capacitorDb')

const fixture = new Uint8Array(readFileSync(`${process.cwd()}/src/corpus/fixture.db`))

beforeEach(() => {
  resetCorpusDbForTests()
  window.localStorage.clear()
  plugin.hasFile = false
  plugin.copies = 0
  plugin.refused = []
  plugin.image = fixture
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getCorpusDb (native, read-only plugin connection)', () => {
  it('opens the copied corpus without a single statement the plugin refuses', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const db = await getCorpusDb()
    expect(getCorpusStatus()).toEqual({ state: 'ready' })
    expect(plugin.refused).toEqual([])
    expect(plugin.copies).toBe(1)
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM recipes')
    expect(rows[0].n).toBe(300)
    // The device smoke gate in CI waits for this exact line in logcat.
    expect(info).toHaveBeenCalledWith('[corpus] ready 300 recipes')
    await db.close()
  })

  it('shows the one-time setup state, with an estimate, while the asset is copied', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const seen: string[] = []
    const unsubscribe = subscribeCorpusStatus(() => seen.push(getCorpusStatus().state))
    const db = await getCorpusDb()
    unsubscribe()
    expect(seen).toEqual(['loading', 'copying', 'ready'])
    expect(seen).not.toContain('error')
    await db.close()
  })

  it('does not copy again on the next launch', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await (await getCorpusDb()).close()
    resetCorpusDbForTests()
    await (await getCorpusDb()).close()
    expect(plugin.copies).toBe(1)
    expect(plugin.refused).toEqual([])
  })

  it('logs the failure line the smoke gate looks for when the corpus cannot be opened', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    plugin.image = new Uint8Array(0)
    await expect(getCorpusDb()).rejects.toThrow()
    expect(getCorpusStatus().state).toBe('error')
    expect(String(error.mock.calls[0]?.[0])).toMatch(/^\[corpus\] could not be opened: /)
  })
})

describe('CapacitorDb opened read-only', () => {
  it('refuses writes itself, before the plugin sees them', async () => {
    plugin.hasFile = true
    const db = new CapacitorDb('corpus', true)
    await db.open()
    await expect(db.execute('PRAGMA query_only = ON')).rejects.toThrow(/read-only/)
    await expect(db.run('DELETE FROM recipes')).rejects.toThrow(/read-only/)
    await expect(db.transaction(async () => undefined)).rejects.toThrow(/read-only/)
    await expect(db.setVersion(2)).rejects.toThrow(/read-only/)
    expect(plugin.refused).toEqual([])
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM recipes')
    expect(rows[0].n).toBe(300)
    await db.close()
  })
})
