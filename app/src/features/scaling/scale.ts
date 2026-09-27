import type { DraftIngredientLine } from '../../corpus/draft'

/**
 * Scaling (brief S7a #5, docs/PRODUCT.md "Servings rule", D11 (owner): "1.5 servings worth per
 * person"). Target servings is `people * servingsPerPerson`, rounded UP to the recipe's
 * natural unit — a recipe serves in whole servings, so that unit is 1. (2 people x 1.5 = 3
 * exactly; a case like 2 people x 1.6 = 3.2 rounds up to 4 servings so nobody gets a partial
 * portion.) Only the draft fixture's quantities are scaled here — real unit conversion
 * (metric <-> US) needs the conversion tables `ingest` ships with the corpus; the units toggle
 * below is plumbing for that, not a conversion, and is documented as such.
 */
export function targetServings(people: number, servingsPerPerson: number): number {
  if (people <= 0 || servingsPerPerson <= 0) return 0
  return Math.ceil(people * servingsPerPerson)
}

/** How much to multiply every ingredient quantity by to go from the recipe's own servings to
 * the target servings. */
export function scaleFactor(
  recipeServings: number,
  people: number,
  servingsPerPerson: number,
): number {
  if (recipeServings <= 0) return 1
  return targetServings(people, servingsPerPerson) / recipeServings
}

export interface ScaledIngredientLine extends DraftIngredientLine {
  scaledQuantity: number | null
}

export function scaleIngredients(
  ingredients: DraftIngredientLine[],
  factor: number,
): ScaledIngredientLine[] {
  return ingredients.map((line) => ({
    ...line,
    scaledQuantity: line.quantity === null ? null : roundForDisplay(line.quantity * factor),
  }))
}

/** Two decimal places is enough precision for a shopping-list-style quantity; avoids
 * 0.1 + 0.2-style floating point noise in the UI. */
function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100
}

export type Units = 'metric' | 'us'
