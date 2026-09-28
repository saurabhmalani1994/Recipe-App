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
 * The file bundled is `src/corpus/fixture.db` until the real corpus.db (a GitHub Release asset,
 * never in git) is dropped in by setting CORPUS_DB_FILE at build time.
 */
const CORPUS_ASSET = 'assets/databases/corpus.db'

function bundleCorpus(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const file = resolve(root, process.env.CORPUS_DB_FILE ?? 'src/corpus/fixture.db')
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
        this.warn(`corpus.db not bundled: ${file} is missing`)
        return
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
