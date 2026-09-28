import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseImportInput } from './parseImportInput'

/**
 * "Import from link" (S12 brief #1): saved-page fixtures for the three markup shapes the brief
 * calls for — JSON-LD (bbcgoodfood, a JSON-LD `@graph` as some blogspot pages and SEO plugins
 * emit), and microdata as the fallback (a WP Recipe Maker-style page with no JSON-LD at all) —
 * plus a plain-text paste with no HTML in it at all. `recipe-data/raw` has no saved HTML for
 * any of these (its `bbcgoodfood` mirror is pre-extracted JSON, not pages), so these are written
 * by hand: bbcgoodfood's is the real title/ingredients/steps from that mirror
 * (`bbcgoodfood:biscoff-rocky-road`), wrapped in the JSON-LD BBC Good Food actually publishes;
 * the other two are realistic but invented.
 */

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), 'src/features/importUrl/testdata', name), 'utf-8')
}

describe('parseImportInput: JSON-LD', () => {
  it('reads a BBC Good Food page (recipeIngredient + HowToStep array)', () => {
    const html = fixture('bbcgoodfood.html')
    const recipe = parseImportInput(html, 'https://www.bbcgoodfood.com/recipes/biscoff-rocky-road')

    expect(recipe.title).toBe('Biscoff rocky road')
    expect(recipe.sourceUrl).toBe('https://www.bbcgoodfood.com/recipes/biscoff-rocky-road')
    expect(recipe.ingredients).toEqual([
      '175g Lotus Biscoff smooth spread',
      '150g salted butter cut into cubes',
      '250g white chocolate roughly chopped',
      '150g Lotus Biscoff biscuits',
      '60g mini marshmallows (vegetarian, if needed)',
      '80g pecans roughly chopped',
    ])
    expect(recipe.steps).toHaveLength(3)
    expect(recipe.steps[0]).toMatch(/^Melt the Biscoff spread/)
    expect(recipe.image).toBe(
      'https://images.immediate.co.uk/production/volatile/sites/30/2026/06/Biscoff-Rocky-Road-6191772.jpg?resize=768,512',
    )
    expect(recipe.servingsText).toBe('Cuts into 16 squares')
    expect(recipe.prepMin).toBe(15)
    expect(recipe.cookMin).toBe(5)
    expect(recipe.totalMin).toBe(20)
    expect(recipe.cuisine).toBe('British')
    expect(recipe.category).toBe('Dessert')
  })

  it('reads a Recipe node nested in a top-level @graph array (blogspot-style), with sections', () => {
    const html = fixture('blogspot.html')
    const recipe = parseImportInput(html, 'https://ammaskitchendiary.blogspot.com/2024/03/weeknight-chana-masala.html')

    expect(recipe.title).toBe('Weeknight Chana Masala')
    expect(recipe.ingredients).toEqual([
      '2 tbsp vegetable oil',
      '1 onion, chopped',
      '2 cans chickpeas, drained',
      '1 can crushed tomatoes',
      '1 tbsp garam masala',
      'chopped cilantro, to garnish',
    ])
    // Two HowToSections, each contributing its name plus its steps, in order.
    expect(recipe.steps).toEqual([
      'Make the base',
      'Heat the oil in a pan and fry the onion until golden.',
      'Stir in the garam masala and cook for a minute.',
      'Finish the curry',
      'Add the chickpeas and crushed tomatoes, then simmer for 20 minutes.',
      'Garnish with cilantro and serve.',
    ])
    expect(recipe.image).toBe('https://example.com/chana-masala.jpg') // ImageObject.url
    expect(recipe.servingsText).toBe('4') // first of the recipeYield array
    expect(recipe.totalMin).toBe(35)
    expect(recipe.cuisine).toBe('Indian') // first of the recipeCuisine array
  })
})

describe('parseImportInput: microdata fallback', () => {
  it('reads a WP Recipe Maker-style page with no JSON-LD at all', () => {
    const html = fixture('wprm.html')
    expect(html).not.toContain('application/ld+json')

    const recipe = parseImportInput(html, 'https://kitchen-notebook.example/stir-fry')

    expect(recipe.title).toBe('Weeknight Chicken Stir Fry')
    expect(recipe.ingredients).toEqual([
      '1 lb chicken breast, sliced thin',
      '1 onion, sliced',
      '2 cloves garlic, minced',
      '3 tbsp soy sauce',
    ])
    expect(recipe.steps).toEqual([
      'Heat a wok over high heat and add a splash of oil.',
      'Add the chicken and stir-fry until browned, about 5 minutes.',
      'Add the onion and garlic, stir-fry for 2 more minutes, then stir in the soy sauce and serve.',
    ])
    expect(recipe.image).toBe('https://example.com/stir-fry.jpg')
    expect(recipe.servingsText).toBe('4 servings')
    expect(recipe.prepMin).toBe(10)
    expect(recipe.cookMin).toBe(15)
    expect(recipe.cuisine).toBe('Chinese')
    expect(recipe.category).toBe('Main Course')
  })
})

describe('parseImportInput: plain-text paste', () => {
  it('splits a heading-shaped paste into ingredients and steps', () => {
    const text = fixture('plain-text-paste.txt')
    const recipe = parseImportInput(text, null)

    expect(recipe.title).toBe("Grandma's Lemon Garlic Roast Chicken")
    expect(recipe.ingredients).toEqual([
      '1 whole chicken, about 4 lbs',
      '2 lemons, halved',
      '6 cloves garlic, smashed',
      '3 tbsp olive oil',
      '1 tsp salt',
      '1/2 tsp black pepper',
      'a few sprigs of rosemary',
    ])
    expect(recipe.steps).toEqual([
      'Preheat the oven to 425F.',
      'Pat the chicken dry and rub all over with olive oil, salt and pepper.',
      'Stuff the cavity with the lemons, garlic and rosemary.',
      'Roast for about 1 hour 15 minutes, until the juices run clear.',
      'Let the chicken rest for 10 minutes before carving.',
    ])
  })

  it('falls back to per-line shape when there are no section headings', () => {
    const text = [
      '2 cups flour',
      '1 tsp baking soda',
      '1 cup sugar',
      'Preheat the oven to 350F and grease a baking pan.',
      'Whisk the dry ingredients together in a large bowl.',
      'Bake for 25 minutes, until a toothpick comes out clean.',
    ].join('\n')

    const recipe = parseImportInput(text, null)
    expect(recipe.ingredients).toEqual(['2 cups flour', '1 tsp baking soda', '1 cup sugar'])
    expect(recipe.steps).toEqual([
      'Preheat the oven to 350F and grease a baking pan.',
      'Whisk the dry ingredients together in a large bowl.',
      'Bake for 25 minutes, until a toothpick comes out clean.',
    ])
  })
})
