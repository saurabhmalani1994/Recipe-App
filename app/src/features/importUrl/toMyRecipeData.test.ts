import { describe, expect, it } from 'vitest'
import { emptyImportedRecipe } from './types'
import { importedToMyRecipeData } from './toMyRecipeData'

describe('importedToMyRecipeData', () => {
  it('keeps the source URL and each ingredient line as raw text', () => {
    const recipe = {
      ...emptyImportedRecipe('https://example.com/recipe'),
      title: 'Test Recipe',
      servingsText: '4-6 servings',
      cuisine: 'Italian',
      category: 'Main',
      ingredients: ['2 cups flour', '1 tsp salt'],
      steps: ['Mix.', 'Bake.'],
    }

    const { title, data } = importedToMyRecipeData(recipe)
    expect(title).toBe('Test Recipe')
    expect(data.sourceUrl).toBe('https://example.com/recipe')
    expect(data.servings).toBe(4) // the low end of "4-6 servings"
    expect(data.cuisine).toBe('italian')
    expect(data.tags).toEqual(['Main'])
    expect(data.ingredients.map((l) => l.raw)).toEqual(['2 cups flour', '1 tsp salt'])
    expect(data.steps).toEqual(['Mix.', 'Bake.'])
  })

  it('falls back to a blank title and default servings when the page gave none', () => {
    const recipe = { ...emptyImportedRecipe(null), ingredients: ['salt'] }
    const { title, data } = importedToMyRecipeData(recipe)
    expect(title).toBe('')
    expect(data.servings).toBe(4)
    expect(data.cuisine).toBeNull()
  })
})
