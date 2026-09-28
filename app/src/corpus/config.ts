/**
 * Where the app gets `corpus.db` (S6). This is the single place its location is configured.
 *
 * - A relative path means "bundled with the app": the build copies the file there (see
 *   `bundleCorpus` in vite.config.ts; `src/corpus/fixture.db` today, the real corpus.db once
 *   CORPUS_DB_FILE points at it). On Android, `copyFromAssets()` copies it on first run.
 * - An absolute https URL means "download on first run" (the real corpus.db, about 200 MB, is a
 *   GitHub Release asset). Its file name must stay `corpus.db` for the native plugin.
 *
 * Set it at build time with VITE_CORPUS_DB_URL.
 */
export const CORPUS_DB_URL: string =
  (import.meta.env.VITE_CORPUS_DB_URL as string | undefined) || 'assets/databases/corpus.db'

declare const __CORPUS_STAMP__: string

/**
 * Identifies the corpus.db this build expects: a content hash of the bundled file, or of the URL
 * when it is downloaded. A device holding a copy with another stamp replaces it.
 */
export const CORPUS_STAMP: string =
  (typeof __CORPUS_STAMP__ === 'string' ? __CORPUS_STAMP__ : 'dev') +
  (isAbsoluteUrl(CORPUS_DB_URL) ? `-${hashString(CORPUS_DB_URL)}` : '')

declare const __CORPUS_BYTES__: number

/** The size of the bundled corpus.db in bytes, or 0 when unknown (tests, a downloaded corpus). */
export const CORPUS_BYTES: number = typeof __CORPUS_BYTES__ === 'number' ? __CORPUS_BYTES__ : 0

/**
 * Roughly how many seconds the one-time native copy of `bytes` takes, rounded up to 5 s. The
 * rate is a deliberately low guess for a mid-range phone inflating a compressed APK asset; the
 * device smoke gate in CI logs the measured time (`[corpus] copied in <ms> ms`).
 */
export const COPY_BYTES_PER_SECOND = 20 * 1024 * 1024

export function copyEstimateSeconds(bytes: number): number {
  if (bytes <= 0) return 0
  return Math.max(5, Math.ceil(bytes / COPY_BYTES_PER_SECOND / 5) * 5)
}

export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
}

/** FNV-1a, as 8 hex digits: enough to tell two configured URLs apart. */
function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
