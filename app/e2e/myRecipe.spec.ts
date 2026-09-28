import { expect, test } from '@playwright/test'

// S13 walk at 412x915: type a My Recipe as raw lines, see what the parser understood under each
// line (and the line it did not), save, plan it, and build a grocery list with real items.

test('S13 walk: typed My Recipe lines are understood, planned and shopped', async ({ page }) => {
  await page.goto('/#/my-recipes/new')
  const editor = page.getByTestId('screen-my-recipe-editor')
  await expect(editor).toBeVisible()
  await editor.getByLabel('Title').fill('Cilantro chicken')

  const lines = [
    '2 cups chopped cilantro',
    '400 g chicken thighs',
    'For the sauce:',
    'a splash of something weird',
  ]
  for (const [i, text] of lines.entries()) {
    await editor.getByRole('button', { name: '+ Ingredient' }).click()
    await editor.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(text)
  }

  await expect(editor.getByTestId('ingredient-understood-1')).toHaveText('2 cups → cilantro')
  await expect(editor.getByTestId('ingredient-understood-2')).toHaveText('400 g → chicken thigh')
  await expect(editor.getByTestId('ingredient-understood-3')).toHaveText(
    'Heading: not an ingredient',
  )
  const unread = editor.getByTestId('ingredient-understood-4')
  await expect(unread).toHaveAttribute('data-status', 'none')
  await expect(unread).toContainText('Not understood')
  await page.screenshot({ path: 'e2e/screens/my-recipe-parsed-412x915.png' })

  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/#\/my-recipes\/my-/)

  // Reload: the lines and what was understood come back from user.db.
  await page.reload()
  await expect(editor.getByLabel('Ingredient 1', { exact: true })).toHaveValue(
    '2 cups chopped cilantro',
  )
  await expect(editor.getByTestId('ingredient-understood-1')).toHaveText('2 cups → cilantro')

  // Plan it for today's dinner and build this week's list.
  await editor.getByTestId('add-to-plan-open').click()
  const sheet = page.getByRole('dialog', { name: 'Add to plan' })
  await sheet.getByRole('group', { name: 'Add to plan' }).getByLabel('Meal').selectOption('dinner')
  await sheet.getByTestId('add-to-plan-confirm').click()
  await expect(editor.getByTestId('add-to-plan-open')).toContainText('Added to plan')

  await page.goto('/#/list')
  const list = page.getByTestId('screen-list')
  await list.getByRole('button', { name: 'Build list' }).click()
  await expect(
    list.getByTestId('aisle-produce').getByText('cilantro', { exact: true }),
  ).toBeVisible()
  await expect(list.getByTestId('aisle-meat')).toContainText('chicken thigh')
  // Only the line the parser could not read is "Check these".
  const checkThese = list.getByTestId('check-these')
  await expect(checkThese).toContainText('a splash of something weird')
  await expect(checkThese).not.toContainText('cilantro')
  await page.screenshot({ path: 'e2e/screens/my-recipe-list-412x915.png' })

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

// S12b #3 (R13): optional total minutes / one-pot / equipment fields, plus the steps-derived
// suggestions for them (a small port of ingest/tag/equipment.py and timing.py).
test('S12b walk: total minutes and equipment are suggested from the steps, accepted, and persist', async ({
  page,
}) => {
  await page.goto('/#/my-recipes/new')
  const editor = page.getByTestId('screen-my-recipe-editor')
  await expect(editor).toBeVisible()
  await editor.getByLabel('Title').fill('Sheet pan chicken')

  await editor.getByRole('button', { name: '+ Step' }).click()
  await editor
    .getByLabel('Step 1', { exact: true })
    .fill('Roast in the oven for 45 minutes, turning once.')

  const suggestedMinutes = editor.getByTestId('suggested-total-min')
  await expect(suggestedMinutes).toContainText('Steps suggest 45 min total.')
  const suggestedEquipment = editor.getByTestId('suggested-equipment')
  await expect(suggestedEquipment).toContainText('Steps suggest Oven.')

  await suggestedMinutes.getByRole('button', { name: 'Use 45 min' }).click()
  await suggestedEquipment.getByRole('button', { name: 'Use these' }).click()
  await expect(editor.getByTestId('suggested-total-min')).toHaveCount(0)
  await expect(editor.getByTestId('suggested-equipment')).toHaveCount(0)
  await expect(editor.getByLabel('Total minutes')).toHaveValue('45')
  await expect(editor.getByRole('checkbox', { name: 'Oven', exact: true })).toBeChecked()

  await editor.getByRole('radio', { name: 'Yes' }).check()

  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/#\/my-recipes\/my-/)

  await page.reload()
  await expect(editor.getByLabel('Total minutes')).toHaveValue('45')
  await expect(editor.getByRole('checkbox', { name: 'Oven', exact: true })).toBeChecked()
  await expect(editor.getByRole('radio', { name: 'Yes' })).toBeChecked()
})
