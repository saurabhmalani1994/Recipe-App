/** `crypto.randomUUID` is available in every target (modern browsers, Node 19+, jsdom under
 * Vitest) but isn't guaranteed by TypeScript's DOM lib version pin, so fall back rather than
 * assume it. */
export function newId(prefix: string): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const uuid = g.crypto?.randomUUID?.()
  if (uuid) return `${prefix}-${uuid}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
