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
  const control = editor.getByRole('group', { name: 'Add to plan' })
  await control.getByLabel('Meal').selectOption('dinner')
  await control.getByTestId('add-to-plan-confirm').click()
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
