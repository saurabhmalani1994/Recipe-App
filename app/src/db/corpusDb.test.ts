import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCorpusDb, getCorpusStatus, resetCorpusDbForTests } from './corpusDb'

// jsdom has no OPFS, so this exercises the web fallback: fetch corpus.db and open it in memory.
const fixture = new Uint8Array(readFileSync(`${process.cwd()}/src/corpus/fixture.db`))

function respondWith(status: number, body: Uint8Array | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body as BodyInit | null, { status })),
  )
}

beforeEach(() => {
  resetCorpusDbForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getCorpusDb (web, no OPFS)', () => {
  it('fetches the bundled corpus.db, opens it read-only and reports ready', async () => {
    respondWith(200, fixture)
    const db = await getCorpusDb()
    expect(getCorpusStatus()).toEqual({ state: 'ready' })
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM recipes')
    expect(rows[0].n).toBe(300)
    await expect(db.execute('DELETE FROM recipes')).rejects.toThrow()
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/assets\/databases\/corpus\.db$/)
    await db.close()
  })

  it('reports "missing" on a 404, and can be retried', async () => {
    respondWith(404, null)
    await expect(getCorpusDb()).rejects.toThrow(/not found/)
    expect(getCorpusStatus().state).toBe('missing')
    respondWith(200, fixture)
    const db = await getCorpusDb()
    expect(getCorpusStatus().state).toBe('ready')
    await db.close()
  })

  it('refuses a file that is not a corpus.db of this schema version', async () => {
    respondWith(200, new Uint8Array(0))
    await expect(getCorpusDb()).rejects.toThrow(/corpus_meta|schema_version/)
    expect(getCorpusStatus().state).toBe('error')
  })
})
