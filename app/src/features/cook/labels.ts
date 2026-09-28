import type { Cuisine, CuisineSource, Equipment } from '../../corpus/types'
import { KITCHEN_EQUIPMENT_LABELS } from '../../data/equipment'

const CUISINE_LABELS: Partial<Record<Cuisine, string>> = {
  indonesian_malaysian: 'Indonesian / Malaysian',
  middle_eastern: 'Middle Eastern',
  latin_american: 'Latin American',
  southern_us: 'Southern US',
  british_irish: 'British / Irish',
  german_central_eu: 'German / Central European',
  north_african: 'North African',
  east_west_african: 'East / West African',
  fusion_other: 'Fusion / other',
}

function titleCase(value: string): string {
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function cuisineLabel(cuisine: Cuisine): string {
  return CUISINE_LABELS[cuisine] ?? titleCase(cuisine)
}

export function equipmentLabel(equipment: Equipment): string {
  return (
    (KITCHEN_EQUIPMENT_LABELS as Partial<Record<Equipment, string>>)[equipment] ??
    titleCase(equipment)
  )
}

/** S22b: a classifier-assigned cuisine is shown as a tag only at this confidence or above. */
export const CUISINE_TAG_MIN_CONFIDENCE = 0.8

/**
 * The cuisine to show as a tag, or null to hide it (S22b). A cuisine the source labelled or the
 * title named always shows; one the classifier guessed shows only when its confidence is at
 * least 0.8. Filtering by cuisine is unaffected: this is only the label on a card or a recipe.
 */
export function cuisineTag(
  cuisine: Cuisine | null,
  source: CuisineSource | null,
  confidence: number | null,
): Cuisine | null {
  if (!cuisine) return null
  if (source !== 'classifier') return cuisine
  return confidence !== null && confidence >= CUISINE_TAG_MIN_CONFIDENCE ? cuisine : null
}
