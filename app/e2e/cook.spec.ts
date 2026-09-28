import { expect, test } from '@playwright/test'

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
  await cook.getByLabel('Cuisine').selectOption('thai')
  const quick = cook.getByRole('button', { name: 'Under 30 min' })
  await quick.click()
  await expect(quick).toHaveAttribute('aria-pressed', 'true')
  const results = cook.getByTestId('cook-results')
  await expect(results.getByRole('link')).toHaveCount(1)
  const padThai = results.getByRole('link', { name: /Pad Thai/ })
  await expect(padThai).toContainText('fish sauce, swap: soy sauce + nori')
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
  await expect(detail.getByRole('list', { name: 'Equipment' })).toContainText('Stovetop')
  await expect(detail.getByRole('heading', { name: 'Steps' })).toBeVisible()

  // Units: 125 g rice noodles reads as ounces in US units.
  await detail.getByLabel('Units').selectOption('us')
  await expect(detail.getByText(/4½ oz rice noodles/)).toBeVisible()
  await detail.getByLabel('Units').selectOption('metric')
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
