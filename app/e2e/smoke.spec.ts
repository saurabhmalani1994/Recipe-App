import { expect, test } from '@playwright/test'

const TABS: { label: string; testId: string }[] = [
  { label: 'Home', testId: 'screen-home' },
  { label: 'Cook', testId: 'screen-cook' },
  { label: 'Plan', testId: 'screen-plan' },
  { label: 'List', testId: 'screen-list' },
  { label: 'My Recipes', testId: 'screen-my-recipes' },
]

test('walks all five tabs; the Diet chip applies for the session, the Settings default persists', async ({
  page,
}) => {
  await page.goto('/')

  for (const tab of TABS) {
    await page.getByRole('navigation', { name: 'Main' }).getByText(tab.label).click()
    await expect(page.getByTestId(tab.testId)).toBeVisible()
  }

  // Back to Home for the screenshot.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Home').click()
  await expect(page.getByTestId('screen-home')).toBeVisible()

  // S22a (D21): the diet is a "Diet" chip on Home and Cook, opening a sheet; the chip's pick is
  // for this session, shared by Home and Cook.
  const dietChip = page.getByTestId('diet-chip')
  await expect(dietChip).toHaveAccessibleName('Diet: Everything')
  await dietChip.click()
  await page.getByRole('dialog', { name: 'Diet' }).getByRole('radio', { name: /No red meat/ }).click()
  await expect(dietChip).toHaveAccessibleName('Diet: No red meat')
  await expect(dietChip).toHaveAttribute('data-active', 'true')
  await page.getByRole('navigation', { name: 'Main' }).getByText('Cook').click()
  await expect(page.getByTestId('diet-chip')).toHaveAccessibleName('Diet: No red meat')
  await page.getByRole('navigation', { name: 'Main' }).getByText('Home').click()

  // A reload starts again from the default in Settings (Everything here).
  await page.reload()
  await expect(page.getByTestId('diet-chip')).toHaveAccessibleName('Diet: Everything')

  await page.screenshot({ path: 'e2e/screens/home-412x915.png' })
})

test('S7a walk: diet, kitchen item, favorite, fork with edit and diff, reload persists', async ({
  page,
}) => {
  // 1. Set diet on the settings screen.
  await page.goto('/')
  await page.getByRole('link', { name: 'Settings' }).click()
  const settingsScreen = page.getByTestId('screen-settings')
  await expect(settingsScreen).toBeVisible()
  // The default diet lives here (S22a); Home and Cook start from it.
  await settingsScreen.getByRole('radio', { name: 'No red meat' }).click()
  await expect(settingsScreen.getByRole('radio', { name: 'No red meat' })).toBeChecked()
  await page.screenshot({ path: 'e2e/screens/settings-412x915.png' })

  // 2. Add a kitchen item by a synonym ("dhania" -> cilantro).
  await page.getByRole('navigation', { name: 'Main' }).getByText('Home').click()
  await page.getByRole('link', { name: 'What I have' }).click()
  await expect(page.getByTestId('screen-kitchen')).toBeVisible()
  await page.getByLabel('Add an ingredient').fill('dhania')
  await page.getByRole('button', { name: 'cilantro' }).click()
  await expect(page.getByText('cilantro')).toBeVisible()
  await page.screenshot({ path: 'e2e/screens/kitchen-412x915.png' })

  // 3. Favorite a recipe from its detail view. Home no longer lists every fixture recipe (S11:
  // it shows the 4 recommendation rows instead), so this goes straight to the fixture recipe by
  // its id (r01, "Weeknight Chana Masala" — `corpus/fixture.ts`).
  await page.goto('/#/recipe/r01')
  await expect(page.getByTestId('screen-recipe-detail')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Weeknight Chana Masala' })).toBeVisible()
  await page.getByRole('button', { name: 'Add favorite' }).click()
  await expect(page.getByRole('button', { name: 'Remove favorite' })).toBeVisible()
  await page.screenshot({ path: 'e2e/screens/recipe-detail-412x915.png' })

  // 4. Fork it ("make my version"), edit an ingredient, and see the diff.
  await page.getByRole('button', { name: 'Make my version' }).click()
  await expect(page.getByTestId('screen-my-recipe-editor')).toBeVisible()
  await expect(page.getByTestId('fork-diff')).toBeVisible()
  // S13: each ingredient is one typed line, with what the parser understood under it.
  await expect(page.getByLabel('Ingredient 1', { exact: true })).toHaveValue('2 tbsp vegetable oil')
  await page.getByLabel('Ingredient 1', { exact: true }).fill('4 tbsp vegetable oil')
  await expect(page.getByTestId('ingredient-understood-1')).toHaveText('4 tbsp → vegetable oil')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('fork-diff')).toContainText('Changed')
  await page.screenshot({ path: 'e2e/screens/my-recipe-fork-diff-412x915.png' })

  const url = page.url()

  // 5. Reload and check the diet preset, kitchen item, favorite and fork all persisted.
  await page.reload()
  await expect(page.getByTestId('fork-diff')).toContainText('Changed')
  expect(page.url()).toBe(url)

  await page.getByRole('navigation', { name: 'Main' }).getByText('Home').click()
  await page.getByRole('link', { name: 'What I have' }).click()
  await expect(page.getByText('cilantro')).toBeVisible()

  await page.goto('/#/recipe/r01')
  await expect(page.getByRole('button', { name: 'Remove favorite' })).toBeVisible()

  // The default diet set in Settings persisted, and Home starts from it.
  await page.getByRole('navigation', { name: 'Main' }).getByText('Home').click()
  await expect(page.getByTestId('diet-chip')).toHaveAccessibleName('Diet: No red meat')
})
