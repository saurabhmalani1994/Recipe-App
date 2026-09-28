/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Bundles `corpus.db` with the build at `assets/databases/corpus.db` (S6), the path
 * `src/corpus/config.ts` reads by default. On Android that lands in
 * `assets/public/assets/databases/`, where @capacitor-community/sqlite's `copyFromAssets()` looks.
 * The file bundled is `src/corpus/fixture.db` unless CORPUS_DB_FILE names another at build time:
 * CI's APK build sets `CORPUS_DB_FILE=corpus/corpus.db`, the real library kept in git LFS (S19).
 * A relative CORPUS_DB_FILE is resolved from the repository root, and a named file that is
 * missing fails the build rather than shipping without its corpus.
 */
const CORPUS_ASSET = 'assets/databases/corpus.db'

function bundleCorpus(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const named = process.env.CORPUS_DB_FILE
  const file = named ? resolve(root, '..', named) : resolve(root, 'src/corpus/fixture.db')
  const read = (): Buffer | null => (existsSync(file) ? readFileSync(file) : null)
  return {
    name: 'bundle-corpus-db',
    config() {
      const bytes = read()
      // A content stamp, so a device holding an older copy knows to replace it.
      const stamp = bytes ? createHash('sha256').update(bytes).digest('hex').slice(0, 12) : 'none'
      return { define: { __CORPUS_STAMP__: JSON.stringify(stamp) } }
    },
    configureServer(server) {
      server.middlewares.use(`/${CORPUS_ASSET}`, (_req, res) => {
        const bytes = read()
        if (!bytes) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', 'application/vnd.sqlite3')
        res.end(bytes)
      })
    },
    generateBundle() {
      const bytes = read()
      if (!bytes) {
        if (named) this.error(`CORPUS_DB_FILE=${named}: ${file} is missing`)
        this.warn(`corpus.db not bundled: ${file} is missing`)
        return
      }
      if (bytes.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') {
        // an LFS pointer left by a checkout that did not pull the object, or any other non-database
        this.error(`${file} is not an SQLite database (${bytes.length} bytes)`)
      }
      this.emitFile({ type: 'asset', fileName: CORPUS_ASSET, source: bytes })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bundleCorpus()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**', '**/android/**'],
  },
})
