import { expect, test, type Page } from '@playwright/test'

/** S22a: Cuisine and Time are filter chips that open a sheet of choices. */
async function pickFromSheet(page: Page, chip: string, sheetName: string, label: string) {
  await page.getByTestId(chip).click()
  const sheet = page.getByRole('dialog', { name: sheetName })
  await sheet.getByRole('radio', { name: label, exact: true }).click()
  await expect(sheet).toBeHidden()
}

// S12b #1: a "Mine" result's star used to call toggleFavorite(result.key) with source 'corpus'
// (an S11+S12 merge bug) — it favorited under the wrong source, so the recipe silently
// disappeared from Favorites (resolveFavorite's 'corpus' branch looks it up in corpus.db by
// key and finds nothing for a My Recipe id). Starring a Mine result must store (and show) it
// as a My Recipe favorite.
test('S12b: starring a "Mine" Cook result favorites it as a My Recipe, not a corpus recipe', async ({
  page,
}) => {
  await page.goto('/#/my-recipes/new')
  const editor = page.getByTestId('screen-my-recipe-editor')
  await expect(editor).toBeVisible()
  await editor.getByLabel('Title').fill('Solo pasta')
  // Three core ingredients, all stocked below: `compareRanked`'s floor (RANK_FLOOR_COVERED = 3)
  // keeps a recipe with fewer covered ingredients off the top of a crowded field regardless of
  // its coverage percentage or quality, so one ingredient (100% covered, but covered = 1) would
  // still lose to hundreds of corpus recipes here.
  for (const [i, line] of ['1 lb chicken breast', '1 onion', '2 cloves garlic'].entries()) {
    await editor.getByRole('button', { name: '+ Ingredient' }).click()
    await editor.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(line)
  }
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/#\/my-recipes\/my-/)

  await page.goto('/#/kitchen')
  const kitchen = page.getByTestId('screen-kitchen')
  await expect(kitchen).toBeVisible()
  for (const name of ['chicken breast', 'onion', 'garlic']) {
    await kitchen.getByLabel('Add an ingredient').fill(name)
    await kitchen.getByRole('button', { name, exact: true }).click()
    await expect(kitchen.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
  }

  await page.goto('/#/cook')
  const cook = page.getByTestId('screen-cook')
  await expect(cook).toBeVisible()
  const results = cook.getByTestId('cook-results')
  const mine = results.getByRole('link', { name: /Solo pasta/ })
  await expect(mine).toBeVisible()
  await expect(mine).toContainText('Mine')

  const mineRow = results.locator('li', { hasText: 'Solo pasta' })
  const star = mineRow.getByRole('button', { name: 'Add favorite: Solo pasta' })
  await star.click()
  await expect(mineRow.getByRole('button', { name: 'Remove favorite: Solo pasta' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Reload: the star still reads as pressed, read back from the 'my' favorites, not 'corpus'.
  await page.reload()
  await expect(cook).toBeVisible();
  await expect(
    cook.getByTestId('cook-results').locator('li', { hasText: 'Solo pasta' })
      .getByRole('button', { name: 'Remove favorite: Solo pasta' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Favorites: resolved as a My Recipe (the bug made it vanish here, mis-stored under 'corpus').
  await page.goto('/#/favorites')
  const favorites = page.getByTestId('screen-favorites')
  await expect(favorites).toBeVisible()
  const favoriteLink = favorites.getByRole('link', { name: /Solo pasta/ })
  await expect(favoriteLink).toBeVisible()
  await expect(favoriteLink).toHaveAttribute('href', /#\/my-recipes\/my-/)
})

// S6 walk at 412x915 (the project viewport): kitchen, then Cook, then a filter, then a result,
// then its detail with the swap shown. corpus.db here is the bundled fixture.db (300 recipes).
test('S6 walk: kitchen, Cook, filter, result, detail with the fish sauce swap', async ({
  page,
}) => {
  // 1. Kitchen: add soy sauce and nori (the pre-seeded staples are already there).
  // corpus.db is fetched once, then opened from the OPFS copy (the worker's fetches count too).
  let corpusFetches = 0
  page.context().on('request', (request) => {
    if (request.url().endsWith('/assets/databases/corpus.db')) corpusFetches++
  })

  await page.goto('/#/kitchen')
  await expect(page.getByTestId('screen-kitchen')).toBeVisible()
  for (const [query, name] of [
    ['soy', 'soy sauce'],
    ['nori', 'nori'],
  ]) {
    await page.getByLabel('Add an ingredient').fill(query)
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
  }

  // 2. Cook: the chips start from the kitchen; add rice noodles for this search only.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Cook').click()
  const cook = page.getByTestId('screen-cook')
  await expect(cook).toBeVisible()
  const have = cook.getByRole('group', { name: 'What you have' })
  await expect(have.getByRole('button', { name: 'Remove soy sauce' })).toBeVisible()
  await expect(have.getByRole('button', { name: 'Remove nori' })).toBeVisible()
  await cook.getByLabel('Add an ingredient').fill('pad thai noodles')
  await cook.getByRole('button', { name: 'rice noodles', exact: true }).click()
  await expect(have.getByRole('button', { name: 'Remove rice noodles' })).toBeVisible()
  await expect(cook.getByTestId('cook-count')).toContainText('recipes')

  // 3. Filters: Thai, and under 30 minutes (Pad Thai takes 21).
  await pickFromSheet(page, 'cuisine-chip', 'Cuisine', 'Thai')
  await pickFromSheet(page, 'time-chip', 'Time', 'Under 30 min')
  await expect(cook.getByTestId('time-chip')).toHaveAttribute('data-active', 'true')
  await expect(cook.getByTestId('time-chip')).toHaveText(/Under 30 min/)
  const results = cook.getByTestId('cook-results')
  await expect(results.getByRole('link')).toHaveCount(1)
  const padThai = results.getByRole('link', { name: /Pad Thai/ })
  // S22a: "Missing: fish sauce → soy sauce + nori", the swap styled apart from the name.
  await expect(padThai.getByTestId('cook-result-missing')).toContainText('fish sauce → soy sauce + nori')
  await page.screenshot({ path: 'e2e/screens/cook-412x915.png' })

  // 4. The result's detail: the fish sauce line carries the swap, marked as on hand.
  await padThai.click()
  const detail = page.getByTestId('screen-recipe-detail')
  await expect(detail.getByRole('heading', { name: 'Pad Thai' })).toBeVisible()
  const fishSauce = detail.locator('li', { hasText: 'fish sauce' }).first()
  await expect(fishSauce.getByTestId('line-swap')).toContainText(
    'swap: soy sauce + nori (you have these)',
  )
  await expect(detail.getByTestId('recipe-facts')).toContainText('21 min total')
  // themealdb gives no yield: the build's estimate is shown as one, and scales (S15, D11)
  await expect(detail.getByTestId('servings-estimate')).toHaveText('Serves about 5 (estimated)')
  await expect(detail.getByRole('list', { name: 'Equipment' })).toContainText('Stovetop')
  await expect(detail.getByRole('heading', { name: 'Steps' })).toBeVisible()

  // Units: 125 g rice noodles, scaled 3/5 to 75 g, reads as ounces in US units.
  // S22b: Metric/US is a segmented toggle in the sticky servings bar.
  const units = detail.getByRole('radiogroup', { name: 'Units' })
  await units.getByRole('radio', { name: 'US' }).click()
  await expect(detail.getByText(/2¾ oz rice noodles/)).toBeVisible()
  await units.getByRole('radio', { name: 'Metric' }).click()
  await page.screenshot({ path: 'e2e/screens/corpus-recipe-detail-412x915.png' })

  // 5. A reload opens the stored copy instead of downloading again.
  expect(corpusFetches).toBe(1)
  await page.reload()
  await expect(detail.getByRole('heading', { name: 'Pad Thai' })).toBeVisible()
  expect(corpusFetches).toBe(1)

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

// R17: a Food Wishes recipe with a video and no steps rows shows "Method in the video" with a
// link instead of an empty steps list (S18's fixture refresh added 12 of these).
test('R17: a video-only recipe shows "Method in the video" instead of steps', async ({ page }) => {
  await page.goto(
    '/#/recipe/' + encodeURIComponent('foodwishes:2007/02/boneless-pork-loin-chops-with-shallots'),
  )
  const detail = page.getByTestId('screen-recipe-detail')
  await expect(detail.getByRole('heading', { name: /Boneless Pork Loin Chops/i })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Steps' })).toBeVisible()
  await expect(detail.locator('.recipe-detail__steps')).toHaveCount(0)
  const video = detail.getByTestId('recipe-video')
  await expect(video).toBeVisible()
  await expect(video).toContainText('Method in the video')
  await expect(video.getByRole('link', { name: 'watch' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=guwg8Hz-iH8',
  )
})
