import type { Cuisine, Equipment } from '../../corpus/types'
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
