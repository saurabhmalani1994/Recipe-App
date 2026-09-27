import { describe, expect, it } from 'vitest'
import { scaleFactor, scaleIngredients, targetServings } from './scale'

describe('servings scaling (D11)', () => {
  it('2 people x 1.5 servings/person = 3', () => {
    expect(targetServings(2, 1.5)).toBe(3)
  })

  it('rounds up to a whole serving', () => {
    expect(targetServings(2, 1.6)).toBe(4) // 3.2 -> 4
    expect(targetServings(3, 1.5)).toBe(5) // 4.5 -> 5
  })

  it('scales a recipe written for 4 up to the target servings', () => {
    const factor = scaleFactor(4, 2, 1.5) // target 3, recipe serves 4 -> 0.75x
    expect(factor).toBeCloseTo(0.75)

    const scaled = scaleIngredients(
      [
        {
          quantity: 500,
          unit: 'g',
          canonicalIngredient: 'chicken thigh',
          form: null,
          optional: false,
        },
      ],
      factor,
    )
    expect(scaled[0].scaledQuantity).toBeCloseTo(375)
  })

  it('leaves a null quantity as null', () => {
    const scaled = scaleIngredients(
      [
        {
          quantity: null,
          unit: null,
          canonicalIngredient: 'salt to taste',
          form: null,
          optional: true,
        },
      ],
      2,
    )
    expect(scaled[0].scaledQuantity).toBeNull()
  })
})
