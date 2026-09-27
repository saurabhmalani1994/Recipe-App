import { expect, test } from '@playwright/test'

const TABS: { label: string; testId: string }[] = [
  { label: 'Home', testId: 'screen-home' },
  { label: 'Cook', testId: 'screen-cook' },
  { label: 'Plan', testId: 'screen-plan' },
  { label: 'List', testId: 'screen-list' },
  { label: 'My Recipes', testId: 'screen-my-recipes' },
]

test('walks all five tabs, keeps the diet switch persisted across a reload, screenshots Home', async ({
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

  const noRedMeat = page.getByRole('radio', { name: 'No red meat' })
  await noRedMeat.click()
  await expect(noRedMeat).toHaveAttribute('aria-checked', 'true')

  await page.reload()
  await expect(page.getByRole('radio', { name: 'No red meat' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  await page.screenshot({ path: 'e2e/screens/home-412x915.png' })
})
