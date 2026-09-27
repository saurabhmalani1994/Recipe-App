import { describe, expect, it } from 'vitest'
import { diffRecipes } from './diff'

const parent = {
  ingredients: [
    { canonicalIngredient: 'onion', quantity: 1, unit: 'unit' },
    { canonicalIngredient: 'chickpeas', quantity: 2, unit: 'can' },
    { canonicalIngredient: 'garam masala', quantity: 1, unit: 'tbsp' },
  ],
  steps: ['Sauté onion.', 'Add spices and tomato, simmer.', 'Add chickpeas, simmer 15 min.'],
}

describe('fork diff', () => {
  it('finds no differences between identical recipes', () => {
    const diff = diffRecipes(parent, parent)
    expect(diff).toEqual({
      ingredientsAdded: [],
      ingredientsRemoved: [],
      ingredientsChanged: [],
      stepsChanged: [],
    })
  })

  it('reports added, removed and changed ingredients, and changed steps', () => {
    const fork = {
      ingredients: [
        { canonicalIngredient: 'onion', quantity: 2, unit: 'unit' }, // changed
        { canonicalIngredient: 'garam masala', quantity: 1, unit: 'tbsp' }, // unchanged
        { canonicalIngredient: 'coconut milk', quantity: 1, unit: 'can' }, // added
        // chickpeas removed
      ],
      steps: [
        'Sauté onion.',
        'Add spices, coconut milk and tomato, simmer.',
        'Add chickpeas, simmer 15 min.',
      ],
    }

    const diff = diffRecipes(parent, fork)

    expect(diff.ingredientsAdded).toEqual([
      { canonicalIngredient: 'coconut milk', quantity: 1, unit: 'can' },
    ])
    expect(diff.ingredientsRemoved).toEqual([
      { canonicalIngredient: 'chickpeas', quantity: 2, unit: 'can' },
    ])
    expect(diff.ingredientsChanged).toEqual([
      {
        ingredient: 'onion',
        parent: { quantity: 1, unit: 'unit' },
        fork: { quantity: 2, unit: 'unit' },
      },
    ])
    expect(diff.stepsChanged).toEqual([
      {
        index: 1,
        parent: 'Add spices and tomato, simmer.',
        fork: 'Add spices, coconut milk and tomato, simmer.',
      },
    ])
  })

  it('is case-insensitive when matching ingredients by name', () => {
    const fork = {
      ingredients: [{ canonicalIngredient: 'Onion', quantity: 1, unit: 'unit' }],
      steps: parent.steps,
    }
    const diff = diffRecipes({ ingredients: [parent.ingredients[0]], steps: parent.steps }, fork)
    expect(diff.ingredientsChanged).toEqual([])
    expect(diff.ingredientsAdded).toEqual([])
    expect(diff.ingredientsRemoved).toEqual([])
  })
})
