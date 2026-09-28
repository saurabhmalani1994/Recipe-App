import { expect, test } from '@playwright/test'

// S7 walk at 412x915: plan 3 corpus recipes onto different day/meal slots, build the grocery
// list, tick 2 items, add them to the kitchen, then reload and check it all persisted.
// corpus.db here is the bundled fixture.db (300 recipes); the three keys below are picked for a
// mix of resolvable (qty + slug) and unresolvable ("Check these", rule 11) ingredient lines.

const RECIPES: { key: string; title: string; day: number; meal: 'lunch' | 'dinner' }[] = [
  { key: 'foodcom:000534', title: 'Green Mango Salad With Cilantro Vinaigrette', day: 0, meal: 'lunch' },
  { key: 'foodcom:000486', title: 'Amazing Nasi Goreng', day: 0, meal: 'dinner' },
  { key: 'foodcom:000292', title: 'Curried Vegetables', day: 1, meal: 'lunch' },
]

async function addToPlan(
  page: import('@playwright/test').Page,
  key: string,
  title: string,
  dayIndex: number,
  meal: 'lunch' | 'dinner',
) {
  await page.goto(`/#/recipe/${encodeURIComponent(key)}`)
  const detail = page.getByTestId('screen-recipe-detail')
  await expect(detail.getByRole('heading', { name: title })).toBeVisible()
  await detail.getByTestId('add-to-plan-open').click()
  const control = detail.getByRole('group', { name: 'Add to plan' })
  await control.getByLabel('Day').selectOption({ index: dayIndex })
  await control.getByLabel('Meal').selectOption(meal)
  await control.getByTestId('add-to-plan-confirm').click()
  await expect(detail.getByTestId('add-to-plan-open')).toContainText('Added to plan')
}

test('S7 walk: plan 3 recipes, build the grocery list, tick 2, add to kitchen, reload persists', async ({
  page,
}) => {
  for (const r of RECIPES) {
    await addToPlan(page, r.key, r.title, r.day, r.meal)
  }

  // 1. Plan: all three show up in their slots.
  await page.goto('/#/plan')
  const plan = page.getByTestId('screen-plan')
  await expect(plan).toBeVisible()
  for (const r of RECIPES) {
    await expect(plan.getByRole('link', { name: r.title })).toBeVisible()
  }
  await page.screenshot({ path: 'e2e/screens/plan-412x915.png' })

  // 2. List: build from this week's plan.
  await page.goto('/#/list')
  const list = page.getByTestId('screen-list')
  await expect(list).toBeVisible()
  await list.getByRole('button', { name: 'Build list' }).click()

  const produce = list.getByTestId('aisle-produce')
  await expect(produce).toBeVisible()
  await expect(produce.getByText('mango', { exact: true })).toBeVisible()
  await expect(produce.getByText('carrot', { exact: true })).toBeVisible()
  // Unparseable lines (no quantity given, e.g. "onion") are never dropped (rule 11).
  await expect(list.getByTestId('check-these')).toBeVisible()
  await expect(list.getByTestId('check-these')).toContainText('onion')
  await page.screenshot({ path: 'e2e/screens/list-412x915.png' })

  // 3. Tick mango and carrot, add them to the kitchen.
  const mangoRow = produce.locator('li', { hasText: 'mango' }).first()
  const carrotRow = produce.locator('li', { hasText: 'carrot' }).first()
  await mangoRow.getByRole('checkbox').check()
  await carrotRow.getByRole('checkbox').check()
  await list.getByRole('button', { name: 'Add ticked to kitchen' }).click()
  await expect(list.getByTestId('list-message')).toContainText('2 items moved to the kitchen list')
  await expect(produce.getByText('mango', { exact: true })).toHaveCount(0)
  await expect(produce.getByText('carrot', { exact: true })).toHaveCount(0)

  // 4. Reload: the built list (minus the two moved items) and the kitchen additions persist.
  await page.reload()
  await expect(list.getByTestId('aisle-produce').getByText('mango', { exact: true })).toHaveCount(0)
  await page.goto('/#/kitchen')
  await expect(page.getByTestId('screen-kitchen')).toBeVisible()
  await expect(page.getByText('mango', { exact: true })).toBeVisible()
  await expect(page.getByText('carrot', { exact: true })).toBeVisible()

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
