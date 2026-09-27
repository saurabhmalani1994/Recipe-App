/**
 * "My kitchen has" equipment checklist (brief S7a #1, list from orch/briefs/S5a-diet-equipment.md
 * #2). Illustrative per owner D8 — `ingest/tag` may add more as the data shows; `no_cook` and
 * the derived tags (`stove_and_oven`, `one_pot`, `one_pan`, `sheet_pan_meal`) aren't things a
 * kitchen "has", so they're left off this list.
 */
export const KITCHEN_EQUIPMENT = [
  'oven',
  'stovetop',
  'air_fryer',
  'food_processor',
  'blender',
  'immersion_blender',
  'mortar_pestle',
  'slow_cooker',
  'pressure_cooker',
  'rice_cooker',
  'grill',
  'broiler',
  'microwave',
  'wok',
  'stand_mixer',
  'hand_mixer',
  'dutch_oven',
  'cast_iron',
  'sheet_pan',
  'deep_fryer',
  'smoker',
  'spice_grinder',
] as const

export type KitchenEquipment = (typeof KITCHEN_EQUIPMENT)[number]

export const KITCHEN_EQUIPMENT_LABELS: Record<KitchenEquipment, string> = {
  oven: 'Oven',
  stovetop: 'Stovetop',
  air_fryer: 'Air fryer',
  food_processor: 'Food processor',
  blender: 'Blender',
  immersion_blender: 'Immersion blender',
  mortar_pestle: 'Mortar & pestle',
  slow_cooker: 'Slow cooker',
  pressure_cooker: 'Pressure cooker',
  rice_cooker: 'Rice cooker',
  grill: 'Grill',
  broiler: 'Broiler',
  microwave: 'Microwave',
  wok: 'Wok',
  stand_mixer: 'Stand mixer',
  hand_mixer: 'Hand mixer',
  dutch_oven: 'Dutch oven',
  cast_iron: 'Cast iron',
  sheet_pan: 'Sheet pan',
  deep_fryer: 'Deep fryer',
  smoker: 'Smoker',
  spice_grinder: 'Spice grinder',
}
