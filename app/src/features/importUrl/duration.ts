/** Minutes in a schema.org ISO 8601 duration ("PT1H30M", "PT45M"); null when it does not parse. */
export function parseIso8601Duration(text: string | null | undefined): number | null {
  if (!text) return null
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text.trim())
  if (!m || !(m[1] || m[2] || m[3] || m[4])) return null
  const days = Number(m[1] ?? 0)
  const hours = Number(m[2] ?? 0)
  const minutes = Number(m[3] ?? 0)
  const seconds = Number(m[4] ?? 0)
  return days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60)
}
