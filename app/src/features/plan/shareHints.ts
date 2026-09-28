import type { Unit } from '../../corpus/types'

/**
 * "Shares ingredients" hint (brief S7 #1): a perishable that shows up in more than one plan
 * entry — fresh herbs, a half-used can, a bunch of coriander — worth cooking on nearby days so
 * nothing goes to waste. A slug counts as perishable when it is an herb, or measured by a unit
 * that implies a container or bundle you only part-use (bunch, can, jar).
 */
const PERISHABLE_UNITS: ReadonlySet<Unit> = new Set(['bunch', 'can', 'jar'])

export interface ShareLine {
  slug: string | null
  unit: Unit | null
}

export function perishableSlugsForEntry(
  lines: ShareLine[],
  isHerb: (slug: string) => boolean,
): Set<string> {
  const out = new Set<string>()
  for (const line of lines) {
    if (!line.slug) continue
    if (isHerb(line.slug) || (line.unit && PERISHABLE_UNITS.has(line.unit))) out.add(line.slug)
  }
  return out
}

/** Maps each entry id to the names of the perishables it shares with at least one other entry
 * in the same week. */
export function shareHints(
  entries: { id: string; slugs: Set<string> }[],
  nameOf: (slug: string) => string,
): Map<string, string[]> {
  const bySlug = new Map<string, string[]>()
  for (const entry of entries) {
    for (const slug of entry.slugs) {
      const ids = bySlug.get(slug)
      if (ids) ids.push(entry.id)
      else bySlug.set(slug, [entry.id])
    }
  }

  const hints = new Map<string, string[]>()
  for (const entry of entries) {
    const shared = [...entry.slugs]
      .filter((slug) => (bySlug.get(slug)?.length ?? 0) > 1)
      .map(nameOf)
      .sort()
    if (shared.length > 0) hints.set(entry.id, shared)
  }
  return hints
}
