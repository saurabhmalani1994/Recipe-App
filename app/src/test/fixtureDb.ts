import { readFileSync } from 'node:fs'
import { WebDb } from '../db/webDb'

/**
 * Opens `src/corpus/fixture.db` (300 recipes, schema v1) read-only, in memory, for tests, or
 * another corpus.db build at `path`.
 */
export async function openFixtureDb(path?: string): Promise<WebDb> {
  const bytes = readFileSync(path ?? new URL('../corpus/fixture.db', import.meta.url))
  const db = new WebDb('corpus', new Uint8Array(bytes))
  await db.open()
  return db
}
