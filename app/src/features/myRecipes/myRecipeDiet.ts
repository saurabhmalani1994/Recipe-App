import type { DietSwap } from '../../corpus/model'
import type { DietStatus } from '../../corpus/types'
import type { StoredItem } from '../../parse'
import { displayName, type Taxonomy } from '../cook/taxonomy'
import { fittingSwaps, forbiddenFlag, swapLabel, type SwapContext, type SwapTable } from '../cook/swaps'

/**
 * A My Recipe's diet status for the active preset (S12 brief #2, owner: "Upload my own recipes").
 * There is no `recipe_diet` row for a My Recipe (that table is built by `ingest/tag/diet.py` over
 * the corpus), so this is computed here, client-side, from the same two ingredients the corpus
 * tagger starts from: the taxonomy flag a preset rules out (R7 vegetarian = `explicit_meat`, R8
 * no red meat = `red_meat`; `forbiddenFlag`) and the engine's own substitution table
 * (`fittingSwaps`/`loadSwapTable`), not a re-port of the tagger's full word-list and steps-scan.
 * An item the parser could not resolve to a slug is skipped: unlike the corpus tagger, this has
 * no raw-text meat-word fallback, so an unreadable line never blocks a My Recipe's diet status.
 */

const NO_HAVE = new Set<string>()

export interface MyRecipeDiet {
  status: DietStatus
  swaps: DietSwap[]
}

/** `items` is every parsed item across a My Recipe's ingredient lines, in line order. */
export function myRecipeDietStatus(
  tax: Taxonomy,
  table: SwapTable,
  items: StoredItem[],
  context: SwapContext,
): MyRecipeDiet {
  const banned = forbiddenFlag(context.diet)
  if (!banned) return { status: 'ok', swaps: [] }

  const swaps: DietSwap[] = []
  let blocked = false
  for (const item of items) {
    if (!item.slug) continue
    const flags = tax.flags.get(item.slug) ?? []
    if (!flags.includes(banned)) continue
    const name = displayName(tax, item.slug)
    if (item.optional) {
      swaps.push({ item: name, slug: item.slug, use: null, via: 'omit' })
      continue
    }
    const best = fittingSwaps(table, item.slug, NO_HAVE, context)[0]
    if (best) {
      swaps.push({
        item: name,
        slug: item.slug,
        use: swapLabel(best),
        use_slug: best.components.map((c) => c.slug),
        via: 'substitution',
        sub_id: best.id,
        quality: best.quality,
      })
    } else {
      blocked = true
    }
  }
  const status: DietStatus = blocked ? 'no' : swaps.length > 0 ? 'adaptable' : 'ok'
  return { status, swaps: status === 'adaptable' ? swaps : [] }
}
