import { EQUIPMENT_VALUES, type Equipment } from '../corpus/types'

/**
 * "My kitchen has" equipment checklist (brief S7a #1, list from orch/briefs/S5a-diet-equipment.md
 * #2). Illustrative per owner D8 — `ingest/tag` may add more as the data shows; `no_cook` and
 * the derived tags (`stove_and_oven`, `one_pot`, `one_pan`, `sheet_pan_meal`) aren't things a
 * kitchen "has", so they're left off this list.
 *
 * S6b #2: derived from `EQUIPMENT_VALUES` (the corpus `recipe_equipment.equipment` CHECK enum,
 * `schema/corpus.sql`) rather than hand-copied, so this list and the corpus enum cannot drift
 * apart again — the app previously listed 22 of the corpus's 31 values, silently filtering out
 * (and never letting the owner tick) any recipe needing one of the missing 9.
 */
export const KITCHEN_EQUIPMENT: readonly Equipment[] = EQUIPMENT_VALUES

export type KitchenEquipment = Equipment

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
  // S6b #2: the 9 corpus values this list was missing.
  toaster: 'Toaster',
  toaster_oven: 'Toaster oven',
  sous_vide: 'Sous vide',
  waffle_iron: 'Waffle iron',
  bread_machine: 'Bread machine',
  dehydrator: 'Dehydrator',
  campfire: 'Campfire',
  steamer: 'Steamer',
  ice_cream_maker: 'Ice cream maker',
}
