import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// S12 walk at 412x915: paste a saved page's HTML into "Import from link", see the parsed
// preview, open it in the editor, save, and find it (marked "Mine") in Cook results.

const WPRM_FIXTURE = readFileSync(
  path.join(process.cwd(), 'src/features/importUrl/testdata/wprm.html'),
  'utf-8',
)

test('S12 walk: import from a pasted HTML fixture, save, find it in Cook', async ({ page }) => {
  await page.goto('/#/my-recipes')
  await expect(page.getByTestId('screen-my-recipes')).toBeVisible()
  await page.getByRole('link', { name: 'Import from link' }).click()

  const importScreen = page.getByTestId('screen-import-url')
  await expect(importScreen).toBeVisible()
  await importScreen
    .getByLabel(/Paste the page.s HTML/)
    .fill(WPRM_FIXTURE)
  await importScreen.getByRole('button', { name: 'Parse pasted content' }).click()

  // The parsed preview, before anything is saved.
  const preview = importScreen.getByTestId('import-preview')
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('heading', { name: 'Weeknight Chicken Stir Fry' })).toBeVisible()
  await expect(preview).toContainText('4 ingredients')
  await expect(preview).toContainText('3 steps')
  await expect(preview.getByTestId('import-preview-ingredients')).toContainText(
    '1 lb chicken breast, sliced thin',
  )

  await page.screenshot({ path: 'e2e/screens/import-preview-412x915.png' })

  // Opens the editor, pre-filled.
  await preview.getByTestId('import-open-editor').click()
  const editor = page.getByTestId('screen-my-recipe-editor')
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel('Title')).toHaveValue('Weeknight Chicken Stir Fry')
  await expect(editor.getByLabel('Ingredient 1', { exact: true })).toHaveValue(
    '1 lb chicken breast, sliced thin',
  )
  // Understood by S13's parser, exactly as a hand-typed line would be.
  await expect(editor.getByTestId('ingredient-understood-1')).toContainText('chicken breast')

  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/#\/my-recipes\/my-/)

  // Find it in Cook, marked "Mine". Stocking the kitchen with all four of its ingredients puts
  // it at 100% coverage — otherwise it is one covered-ingredient recipe among hundreds sharing
  // "chicken breast" with the corpus, tied on quality (a My Recipe has none) and squeezed out
  // of the top `DEFAULT_MATCH_LIMIT` results.
  await page.goto('/#/kitchen')
  const kitchen = page.getByTestId('screen-kitchen')
  await expect(kitchen).toBeVisible()
  for (const [query, name] of [
    ['chicken breast', 'chicken breast'],
    ['onion', 'onion'],
    ['garlic', 'garlic'],
    ['soy sauce', 'soy sauce'],
  ]) {
    await kitchen.getByLabel('Add an ingredient').fill(query)
    await kitchen.getByRole('button', { name, exact: true }).click()
    await expect(kitchen.getByRole('button', { name: `Remove ${name}` })).toBeVisible()
  }

  await page.goto('/#/cook')
  const cook = page.getByTestId('screen-cook')
  await expect(cook).toBeVisible()

  const results = cook.getByTestId('cook-results')
  const mine = results.getByRole('link', { name: /Weeknight Chicken Stir Fry/ })
  await expect(mine).toBeVisible()
  await expect(mine).toContainText('Mine')
  await mine.click()
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('heading', { name: 'Weeknight Chicken Stir Fry' })).toBeVisible()

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
