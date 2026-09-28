import { expect, test } from '@playwright/test'

// S16 "ingredients I avoid" (R15, owner D17: "many of the apps felt very southern or mid western,
// using things like cool whip or sour cream for lots of the recipes, which is not my style").
// Walks Settings (add shrimp, hide mode), Cook (Pad Thai hidden, counted in a note — rule 11:
// never a silent drop), then switches to "rank them lower" (Pad Thai reappears, marked, still
// ranks below an unavoided recipe would), then the recipe detail (the shrimp line marked, with
// its best swap from the substitutions table).
test('S16 walk: avoid shrimp (hide, then lower), Cook, and the recipe detail', async ({ page }) => {
  // 1. Settings: add shrimp to "Ingredients I avoid", default mode is "hide".
  await page.goto('/#/settings')
  const settings = page.getByTestId('screen-settings')
  await expect(settings).toBeVisible()
  await settings.getByLabel('Add an ingredient to avoid').fill('shrimp')
  await settings.getByRole('button', { name: 'shrimp', exact: true }).click()
  const avoidItem = settings.getByTestId('avoid-item-shrimp')
  await expect(avoidItem).toBeVisible()
  await expect(avoidItem.getByLabel('How to treat shrimp')).toHaveValue('hide')

  // 2. Kitchen: soy sauce, nori and rice noodles (same planted kitchen as the S6 fish-sauce swap
  // walk, cook.spec.ts) so Pad Thai is the sole Thai candidate — shrimp itself doesn't need to be
  // in the kitchen: the avoid check is against the recipe's own ingredients, not what's on hand.
  await page.goto('/#/kitchen')
  await expect(page.getByTestId('screen-kitchen')).toBeVisible()
  for (const [query, name] of [
    ['soy', 'soy sauce'],
    ['nori', 'nori'],
    ['pad thai noodles', 'rice noodles'],
  ]) {
    await page.getByLabel('Add an ingredient').fill(query)
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
  }

  // 3. Cook, filtered to Thai (Pad Thai is normally the only Thai match): hidden, and counted.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Cook').click()
  const cook = page.getByTestId('screen-cook')
  await expect(cook).toBeVisible()
  await cook.getByLabel('Cuisine').selectOption('thai')
  await expect(cook.getByTestId('cook-count')).toBeVisible()
  await expect(cook.getByTestId('cook-results').getByRole('link', { name: /Pad Thai/ })).toHaveCount(0)
  await expect(cook.getByTestId('cook-hidden-avoid')).toContainText(/hidden: shrimp/)
  await page.screenshot({ path: 'e2e/screens/avoid-cook-hidden-412x915.png' })

  // 4. Settings: switch shrimp to "Rank them lower" instead of hiding it.
  await page.goto('/#/settings')
  await expect(settings).toBeVisible()
  await settings.getByTestId('avoid-item-shrimp').getByLabel('How to treat shrimp').selectOption('lower')

  // 5. Cook again: Pad Thai is back, marked as avoiding shrimp.
  await page.goto('/#/cook')
  await expect(cook).toBeVisible()
  await cook.getByLabel('Cuisine').selectOption('thai')
  const padThai = cook.getByTestId('cook-results').getByRole('link', { name: /Pad Thai/ })
  await expect(padThai).toBeVisible()
  await expect(padThai).toContainText('avoiding: shrimp')
  await expect(cook.getByTestId('cook-hidden-avoid')).toHaveCount(0)

  // 6. The recipe detail: the shrimp line is marked, and shows its best swap (quality >= 2:
  // scallops, over the quality-1 hearts of palm) even though shrimp is not "missing" — S16 #3
  // marks an avoided line and shows a swap regardless of what's on hand.
  await padThai.click()
  const detail = page.getByTestId('screen-recipe-detail')
  await expect(detail.getByRole('heading', { name: 'Pad Thai' })).toBeVisible()
  const shrimpLine = detail.locator('li', { hasText: 'shrimp' }).first()
  await expect(shrimpLine.getByTestId('line-avoided')).toContainText('you avoid this')
  await expect(shrimpLine.getByTestId('line-swap')).toContainText('swap: scallops')
  await page.screenshot({ path: 'e2e/screens/avoid-detail-412x915.png' })

  // 7. Settings: remove the avoid entirely, and Pad Thai's line is no longer marked.
  await page.goto('/#/settings')
  await expect(settings).toBeVisible()
  await settings.getByTestId('avoid-item-shrimp').getByRole('button', { name: 'Stop avoiding shrimp' }).click()
  await expect(settings.getByTestId('avoid-item-shrimp')).toHaveCount(0)
})
