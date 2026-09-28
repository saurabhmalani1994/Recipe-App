import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// S7 walk at 412x915: plan 3 corpus recipes onto different day/meal slots, build the grocery
// list, tick 2 items, add them to the kitchen, then reload and check it all persisted.
// corpus.db here is the bundled fixture.db (300 recipes); the three keys below are picked for a
// mix of resolvable (qty + slug) and unresolvable ("Check these", rule 11) ingredient lines.

const RECIPES: { key: string; title: string; day: number; meal: 'lunch' | 'dinner' }[] = [
  {
    key: 'foodcom:000534',
    title: 'Green Mango Salad With Cilantro Vinaigrette',
    day: 0,
    meal: 'lunch',
  },
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
  // S7c: lines read in shop units, rounded up to what you can buy.
  const lineFor = (name: string) =>
    produce.locator('li.shopping-item').filter({
      has: page.locator('.shopping-item__name', { hasText: new RegExp(`^${name}$`) }),
    })
  await expect(lineFor('mango')).toContainText('1 (150 g)')
  await expect(lineFor('carrot')).toContainText('1 (46 g + more, see recipe)')
  // The S7 "¾" lines: a bare number the source gave no unit for is never shown as an amount.
  await expect(lineFor('cilantro')).toContainText('amount: see recipe')
  await expect(lineFor('lemon')).toContainText('amount: see recipe')
  await expect(list.getByTestId('aisle-pantry')).toContainText('check you have some')
  await expect(list.getByText('¾')).toHaveCount(0)
  // Pantry defaults the kitchen list already has are left off, and said so.
  await expect(list.getByTestId('list-message')).toHaveText(
    'Left off 4 you already have: butter, salt, sugar, water.',
  )
  // A missing quantity is not "Check these": onion is on the list in its aisle (S7c #4).
  await expect(lineFor('onion')).toContainText('amount: see recipe')
  // "Check these" holds only lines with no recognisable ingredient (rule 11: never dropped).
  const checkThese = list.getByTestId('check-these')
  await expect(checkThese).toContainText('trassi oedang')
  await expect(checkThese).not.toContainText('onion')
  await page.screenshot({ path: 'e2e/screens/list-412x915.png' })
  await lineFor('carrot').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/screens/list-produce-412x915.png' })
  writeFileSync('e2e/screens/list-412x915.txt', `${await list.innerText()}\n`)

  // Tapping a line's "recipes" shows which planned recipes asked for it, and hides them again.
  const carrotSources = lineFor('carrot').getByRole('button', { name: 'Recipes for carrot' })
  await expect(carrotSources).toHaveText('3 recipes')
  await carrotSources.click()
  for (const r of RECIPES) await expect(lineFor('carrot')).toContainText(r.title)
  await carrotSources.click()
  await expect(lineFor('carrot')).not.toContainText(RECIPES[1].title)

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
