import { expect, test, type Locator, type Page } from '@playwright/test'

// S22b quality gate: every remaining screen on the S22a system, at 412x915 in light and dark and
// at 360 wide. No horizontal page scroll, every tap target at least 48dp, no screen showing its
// title twice. Swipe tests for List tick and delete, Plan remove and Kitchen remove (each with
// undo). Screenshots land in e2e/screens/s22b-*.png.

const PLANNED = [
  { key: 'foodcom:000534', title: 'Green Mango Salad With Cilantro Vinaigrette', meal: 'lunch' },
  { key: 'foodcom:000486', title: 'Amazing Nasi Goreng', meal: 'dinner' },
] as const

/** A recipe with a nutrition estimate and a source-labelled cuisine (fixture.db). */
const NUTRITION_KEY = 'cookwithipohbunny:recipe-pistachio-pesto-pasta'
/** A recipe whose cuisine the classifier guessed at 0.69: its tag must not show. */
const LOW_CONFIDENCE_KEY = 'bbcgoodfood:german-apple-cake'
const VIDEO_KEY = 'foodwishes:2007/02/boneless-pork-loin-chops-with-shallots'

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, 'the page itself should not scroll sideways').toBeLessThanOrEqual(clientWidth)
}

/** Every visible link, button, input and radio in the viewport, smaller than 48x48 CSS px. */
async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 48
    const out: string[] = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    for (const el of document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [role="radio"], [role="switch"]',
    )) {
      if (el.closest('[inert], [aria-hidden="true"]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue
      // An inline link inside a sentence is text, not a control (WCAG 2.5.8 exception).
      if (el.tagName === 'A' && el.closest('p') && !el.classList.contains('button')) continue
      if (r.width < MIN || r.height < MIN) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
          .trim()
          .slice(0, 40)
        out.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    return out
  })
}

/** "No screen shows its title twice": the top bar's title is not repeated as a page heading. */
async function titleShownOnce(page: Page) {
  const title = (await page.locator('.topbar__title').innerText()).trim().toLowerCase()
  const headings = (await page.locator('main h1, main h2').allInnerTexts()).map((t) =>
    t.trim().toLowerCase(),
  )
  expect(headings, `"${title}" is already the top bar's title`).not.toContain(title)
}

async function checkScreen(page: Page, shot: string) {
  await page.waitForTimeout(350) // let fade-ins and sheets settle
  await noHorizontalScroll(page)
  expect(await smallTapTargets(page)).toEqual([])
  await titleShownOnce(page)
  await page.screenshot({ path: `e2e/screens/${shot}.png` })
}

async function scrollScreen(page: Page, y: number) {
  await page.locator('.app-scroll').first().evaluate((el, top) => el.scrollTo(0, top), y)
  await page.waitForTimeout(350)
}

async function planRecipes(page: Page) {
  for (const r of PLANNED) {
    await page.goto(`/#/recipe/${encodeURIComponent(r.key)}`)
    const detail = page.getByTestId('screen-recipe-detail')
    await expect(detail.getByRole('heading', { name: r.title })).toBeVisible()
    await detail.getByTestId('add-to-plan-open').click()
    const sheet = page.getByRole('dialog', { name: 'Add to plan' })
    await sheet.getByLabel('Meal').selectOption(r.meal)
    await sheet.getByTestId('add-to-plan-confirm').click()
    await expect(detail.getByTestId('add-to-plan-open')).toContainText('Added to plan')
  }
}

/** Drags a row sideways with the mouse (pointer events), in steps, from its middle. */
async function swipe(page: Page, row: Locator, dx: number) {
  // Mid-screen, clear of the bottom nav and any snackbar sitting above it.
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(100)
  const box = await row.boundingBox()
  if (!box) throw new Error('row not on screen')
  const y = box.y + box.height / 2
  const x0 = box.x + box.width / 2 - dx / 4
  await page.mouse.move(x0, y)
  await page.mouse.down()
  for (let i = 1; i <= 14; i++) await page.mouse.move(x0 + (dx * i) / 14, y)
  await page.mouse.up()
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`S22b screens, ${scheme}, 412x915`, () => {
    test.use({ viewport: { width: 412, height: 915 }, colorScheme: scheme })

    test(`recipe detail views (${scheme})`, async ({ page }) => {
      await page.goto(`/#/recipe/${encodeURIComponent(NUTRITION_KEY)}`)
      const detail = page.getByTestId('screen-recipe-detail')
      await expect(detail.getByRole('heading', { name: 'Pistachio Pesto Pasta' })).toBeVisible()
      await expect(detail.locator('.detail-head .kicker')).toHaveText('Indonesian / Malaysian')
      await checkScreen(page, `s22b-detail-${scheme}-412x915`)

      // Kitchen-readable: ingredient and step text at 17px or more.
      for (const selector of ['.ingredient__text', '.step-card__text']) {
        const size = await detail
          .locator(selector)
          .first()
          .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
        expect(size, selector).toBeGreaterThanOrEqual(17)
      }

      // The servings stepper scales, and the bar sticks under the top bar while scrolling.
      const stepper = detail.getByTestId('servings-stepper')
      await expect(stepper).toContainText('2 people')
      await stepper.getByRole('button', { name: 'More people' }).click()
      await expect(stepper).toContainText('3 people')
      await expect(stepper).toContainText('5 servings')
      await scrollScreen(page, 700)
      const bar = await detail.getByTestId('detail-controls').boundingBox()
      expect(bar?.y ?? 0).toBeGreaterThanOrEqual(0)
      expect(bar?.y ?? 999).toBeLessThan(80)
      await page.screenshot({ path: `e2e/screens/s22b-detail-scrolled-${scheme}-412x915.png` })

      const nutrition = detail.getByTestId('nutrition')
      await nutrition.scrollIntoViewIfNeeded()
      await expect(nutrition).toContainText('estimate')
      await expect(nutrition).toContainText('kcal')
      await page.waitForTimeout(300)
      await page.screenshot({ path: `e2e/screens/s22b-detail-nutrition-${scheme}-412x915.png` })

      // The add-to-plan sheet.
      await scrollScreen(page, 0)
      await detail.getByTestId('add-to-plan-open').click()
      await expect(page.getByRole('dialog', { name: 'Add to plan' })).toBeVisible()
      await page.waitForTimeout(350)
      expect(await smallTapTargets(page)).toEqual([])
      await page.screenshot({ path: `e2e/screens/s22b-add-to-plan-${scheme}-412x915.png` })
      await page.keyboard.press('Escape')

      // Video-only: "Method in the video" is a big button.
      await page.goto(`/#/recipe/${encodeURIComponent(VIDEO_KEY)}`)
      const video = page.getByTestId('recipe-video')
      await expect(video.getByRole('link', { name: 'Watch the video' })).toBeVisible()
      const videoBox = await video.getByRole('link', { name: 'Watch the video' }).boundingBox()
      expect(videoBox?.height ?? 0).toBeGreaterThanOrEqual(48)
      await video.scrollIntoViewIfNeeded()
      await checkScreen(page, `s22b-detail-video-${scheme}-412x915`)

      // A fixture recipe, same layout.
      await page.goto('/#/recipe/r01')
      await expect(page.getByRole('heading', { name: 'Weeknight Chana Masala' })).toBeVisible()
      await checkScreen(page, `s22b-detail-fixture-${scheme}-412x915`)
    })

    test(`Plan, List and Kitchen (${scheme})`, async ({ page }) => {
      await planRecipes(page)

      await page.goto('/#/plan')
      const plan = page.getByTestId('screen-plan')
      await expect(plan.getByRole('link', { name: PLANNED[0].title })).toBeVisible()
      await checkScreen(page, `s22b-plan-${scheme}-412x915`)
      await plan.getByRole('radio', { name: 'Next week' }).click()
      await expect(plan).toContainText('Nothing planned')
      await plan.getByRole('radio', { name: 'This week' }).click()
      await expect(plan).toContainText('2 meals planned')

      // Building the list is one tap from Plan.
      await plan.getByTestId('plan-build-list').click()
      const list = page.getByTestId('screen-list')
      await expect(list.getByTestId('aisle-produce')).toBeVisible()
      await expect(list.getByTestId('list-message')).toContainText('Left off')
      await checkScreen(page, `s22b-list-${scheme}-412x915`)
      await scrollScreen(page, 600)
      // The aisle header in view sticks under the top bar (or the very top, once it tucks away).
      const stuck = await page.evaluate(() => {
        const titles = [...document.querySelectorAll('.aisle__title')]
        return titles.some((t) => {
          const top = t.getBoundingClientRect().top
          return top >= 0 && top <= 80
        })
      })
      expect(stuck).toBe(true)
      await page.screenshot({ path: `e2e/screens/s22b-list-scrolled-${scheme}-412x915.png` })
      await scrollScreen(page, 0)

      // Tick two (a tap and a swipe): the primary action and the Done section appear.
      await list.getByTestId('list-item-mango').getByRole('checkbox').check()
      await expect(list.getByTestId('list-done')).toContainText('Done (1)')
      await swipe(page, list.getByTestId('list-item-carrot'), 220)
      await expect(list.getByTestId('list-item-carrot').getByRole('checkbox')).toBeChecked()
      await expect(list.getByTestId('list-done')).toContainText('Done (2)')
      await list.getByTestId('list-done').getByRole('button', { name: /Done/ }).click()
      await list.getByTestId('list-done').scrollIntoViewIfNeeded()
      await checkScreen(page, `s22b-list-done-${scheme}-412x915`)

      await page.goto('/#/kitchen')
      await expect(page.getByTestId('screen-kitchen')).toBeVisible()
      await expect(page.getByTestId('kitchen-item-salt')).toBeVisible()
      await checkScreen(page, `s22b-kitchen-${scheme}-412x915`)
    })

    test(`My Recipes, editor, import, favorites, settings (${scheme})`, async ({ page }) => {
      await page.goto('/#/my-recipes')
      await expect(page.getByTestId('screen-my-recipes')).toBeVisible()
      await checkScreen(page, `s22b-my-recipes-empty-${scheme}-412x915`)

      await page.goto('/#/my-recipes/new')
      const editor = page.getByTestId('screen-my-recipe-editor')
      await editor.getByLabel('Title').fill('Cilantro chicken')
      for (const [i, text] of ['2 cups chopped cilantro', '400 g chicken thighs'].entries()) {
        await editor.getByRole('button', { name: '+ Ingredient' }).click()
        await editor.getByLabel(`Ingredient ${i + 1}`, { exact: true }).fill(text)
      }
      await editor.getByRole('button', { name: '+ Step' }).click()
      await editor.getByLabel('Step 1', { exact: true }).fill('Fry the chicken for 10 minutes.')
      await checkScreen(page, `s22b-editor-${scheme}-412x915`)
      await scrollScreen(page, 900)
      await page.screenshot({ path: `e2e/screens/s22b-editor-lines-${scheme}-412x915.png` })
      await editor.getByRole('button', { name: 'Save' }).click()
      await expect(page).toHaveURL(/#\/my-recipes\/my-/)

      await page.goto('/#/my-recipes')
      const mine = page.getByTestId('screen-my-recipes')
      await expect(mine.getByRole('link', { name: /Cilantro chicken/ })).toBeVisible()
      await checkScreen(page, `s22b-my-recipes-${scheme}-412x915`)
      await mine.getByTestId('my-recipes-add').click()
      const sheet = page.getByRole('dialog', { name: 'Add a recipe' })
      await expect(sheet.getByRole('link', { name: /Import from link/ })).toBeVisible()
      await page.waitForTimeout(350)
      await page.screenshot({ path: `e2e/screens/s22b-my-recipes-add-${scheme}-412x915.png` })
      await page.keyboard.press('Escape')

      // The My Recipe view: star it, so Favorites has a card.
      await mine.getByRole('link', { name: /Cilantro chicken/ }).click()
      const view = page.getByTestId('screen-recipe-detail')
      await expect(view.getByRole('heading', { name: 'Cilantro chicken' })).toBeVisible()
      await view.getByRole('button', { name: 'Add favorite' }).click()
      await checkScreen(page, `s22b-detail-mine-${scheme}-412x915`)

      await page.goto('/#/favorites')
      await expect(page.getByTestId('screen-favorites').getByText('Cilantro chicken')).toBeVisible()
      await checkScreen(page, `s22b-favorites-${scheme}-412x915`)

      await page.goto('/#/my-recipes/import')
      await expect(page.getByTestId('screen-import-url')).toBeVisible()
      await checkScreen(page, `s22b-import-${scheme}-412x915`)

      await page.goto('/#/settings')
      const settings = page.getByTestId('screen-settings')
      await expect(settings.getByRole('radiogroup', { name: 'Diet preset' })).toBeVisible()
      await checkScreen(page, `s22b-settings-${scheme}-412x915`)
      await settings.getByRole('switch', { name: 'Show breakfast on the plan' }).click()
      await expect(settings.getByRole('switch', { name: 'Show breakfast on the plan' })).toBeChecked()
      await settings.getByTestId('settings-backup').scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `e2e/screens/s22b-settings-backup-${scheme}-412x915.png` })
    })
  })
}

test.describe('S22b screens at 360x800', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('every S22b screen fits 360 wide', async ({ page }) => {
    await planRecipes(page)
    const screens: { path: string; ready: (p: Page) => Promise<void>; shot: string }[] = [
      {
        path: `/recipe/${encodeURIComponent(NUTRITION_KEY)}`,
        ready: (p) => expect(p.getByRole('heading', { name: 'Ingredients' })).toBeVisible(),
        shot: 'detail',
      },
      {
        path: '/plan',
        ready: (p) => expect(p.getByRole('link', { name: PLANNED[1].title })).toBeVisible(),
        shot: 'plan',
      },
      {
        path: '/list',
        ready: (p) => expect(p.getByTestId('screen-list')).toBeVisible(),
        shot: 'list-empty',
      },
      {
        path: '/kitchen',
        ready: (p) => expect(p.getByTestId('kitchen-item-salt')).toBeVisible(),
        shot: 'kitchen',
      },
      {
        path: '/my-recipes',
        ready: (p) => expect(p.getByTestId('my-recipes-add')).toBeVisible(),
        shot: 'my-recipes',
      },
      {
        path: '/my-recipes/new',
        ready: (p) => expect(p.getByLabel('Title')).toBeVisible(),
        shot: 'editor',
      },
      {
        path: '/my-recipes/import',
        ready: (p) => expect(p.getByLabel('Recipe URL')).toBeVisible(),
        shot: 'import',
      },
      {
        path: '/favorites',
        ready: (p) => expect(p.getByTestId('screen-favorites')).toBeVisible(),
        shot: 'favorites',
      },
      {
        path: '/settings',
        ready: (p) => expect(p.getByRole('radiogroup', { name: 'Diet preset' })).toBeVisible(),
        shot: 'settings',
      },
    ]
    for (const s of screens) {
      await page.goto(`/#${s.path}`)
      await s.ready(page)
      await checkScreen(page, `s22b-${s.shot}-360x800`)
    }
    // The list, built from Plan.
    await page.goto('/#/plan')
    await page.getByTestId('plan-build-list').click()
    await expect(page.getByTestId('aisle-produce')).toBeVisible()
    await checkScreen(page, 's22b-list-360x800')
  })
})

test.describe('S22b swipes', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('List: swipe right ticks, swipe left deletes, and Undo puts it back', async ({ page }) => {
    await planRecipes(page)
    await page.goto('/#/list')
    const list = page.getByTestId('screen-list')
    await list.getByRole('button', { name: 'Build list' }).click()
    const mango = list.getByTestId('list-item-mango')
    await expect(mango).toBeVisible()

    // A short drag springs back and does nothing.
    await swipe(page, mango, 40)
    await expect(mango.getByRole('checkbox')).not.toBeChecked()

    // Right: ticked, then folded into Done.
    await swipe(page, mango, 220)
    await expect(mango.getByRole('checkbox')).toBeChecked()
    await expect(list.getByTestId('list-done')).toContainText('Done (1)')
    await expect(list.getByTestId('aisle-produce').getByText('mango', { exact: true })).toHaveCount(0)
    await expect(list.getByRole('button', { name: 'Add ticked to kitchen' })).toBeVisible()

    // Left: deleted, with an undo snackbar.
    const carrot = list.getByTestId('list-item-carrot')
    await swipe(page, carrot, -240)
    await expect(carrot).toHaveCount(0)
    const snackbar = page.getByTestId('snackbar')
    await expect(snackbar).toContainText('Deleted carrot')
    await page.screenshot({ path: 'e2e/screens/s22b-list-undo-412x915.png' })
    await snackbar.getByRole('button', { name: 'Undo' }).click()
    await expect(list.getByTestId('list-item-carrot')).toBeVisible()
    await expect(list.getByTestId('list-item-carrot')).toContainText('1 (46 g + more, see recipe)')

    // A deleted line stays deleted across a reload.
    await swipe(page, list.getByTestId('list-item-onion'), -240)
    await expect(list.getByTestId('list-item-onion')).toHaveCount(0)
    await page.reload()
    await expect(list.getByTestId('list-item-carrot')).toBeVisible()
    await expect(list.getByTestId('list-item-onion')).toHaveCount(0)

    // The non-swipe way to delete: a real button, named for the line.
    await expect(list.getByRole('button', { name: 'Delete carrot' })).toHaveCount(1)
  })

  test('Plan: swipe a meal left to remove it, and Undo brings it back', async ({ page }) => {
    await planRecipes(page)
    await page.goto('/#/plan')
    const plan = page.getByTestId('screen-plan')
    const title = PLANNED[1].title
    const row = plan.locator('.slot--filled', { hasText: title })
    await expect(row).toBeVisible()
    // A short drag springs back: nothing removed, no tab switch.
    await swipe(page, row, -30)
    await expect(row).toBeVisible()
    await expect(page).toHaveURL(/#\/plan$/)

    await swipe(page, row, -260)
    await expect(plan.getByRole('link', { name: title })).toHaveCount(0)
    // Still on Plan: the row's swipe did not reach the tab pager.
    await expect(page).toHaveURL(/#\/plan$/)
    const snackbar = page.getByTestId('snackbar')
    await expect(snackbar).toContainText(`Removed ${title}`)
    await snackbar.getByRole('button', { name: 'Undo' }).click()
    await expect(plan.getByRole('link', { name: title })).toBeVisible()

    // Without a swipe: the meal's options sheet removes it too.
    await plan.getByRole('button', { name: `Options for ${title}` }).click()
    const sheet = page.getByRole('dialog', { name: title })
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await expect(plan.getByRole('link', { name: title })).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('screen-plan').getByRole('link', { name: title })).toHaveCount(0)
  })

  test('Kitchen: swipe left removes an ingredient, and Undo puts it back', async ({ page }) => {
    await page.goto('/#/kitchen')
    const kitchen = page.getByTestId('screen-kitchen')
    const salt = kitchen.getByTestId('kitchen-item-salt')
    await expect(salt).toBeVisible()
    await swipe(page, salt, -240)
    await expect(salt).toHaveCount(0)
    const snackbar = page.getByTestId('snackbar')
    await expect(snackbar).toContainText('Removed salt')
    await snackbar.getByRole('button', { name: 'Undo' }).click()
    await expect(kitchen.getByTestId('kitchen-item-salt')).toBeVisible()

    await swipe(page, kitchen.getByTestId('kitchen-item-salt'), -240)
    await expect(kitchen.getByTestId('kitchen-item-salt')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('screen-kitchen')).toBeVisible()
    await expect(page.getByTestId('kitchen-item-butter')).toBeVisible()
    await expect(page.getByTestId('kitchen-item-salt')).toHaveCount(0)
  })
})

test.describe('S22b fixes and kitchen mode', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('a classifier cuisine under 0.8 shows no tag; a source label does', async ({ page }) => {
    await page.goto(`/#/recipe/${encodeURIComponent(LOW_CONFIDENCE_KEY)}`)
    const detail = page.getByTestId('screen-recipe-detail')
    await expect(detail.getByRole('heading', { name: 'German apple cake' })).toBeVisible()
    await expect(detail.locator('.detail-head .kicker')).toHaveCount(0)
    await expect(detail).not.toContainText('British / Irish')

    await page.goto(`/#/recipe/${encodeURIComponent('themealdb:53191')}`)
    await expect(page.getByRole('heading', { name: 'Pad Thai' })).toBeVisible()
    await expect(page.locator('.detail-head .kicker')).toHaveText('Thai')
  })

  test('the recipe view holds a screen wake lock, and a refusal breaks nothing', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __wakeRequests: number; __wakeReleases: number }
      w.__wakeRequests = 0
      w.__wakeReleases = 0
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: () => {
            w.__wakeRequests++
            // The first request is refused (power saving); later ones succeed.
            if (w.__wakeRequests === 1) return Promise.reject(new Error('NotAllowedError'))
            const sentinel = {
              released: false,
              release: () => {
                sentinel.released = true
                w.__wakeReleases++
                return Promise.resolve()
              },
            }
            return Promise.resolve(sentinel)
          },
        },
      })
    })
    await page.goto('/#/recipe/r01')
    await expect(page.getByRole('heading', { name: 'Weeknight Chana Masala' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as never)['__wakeRequests'])).toBe(1)
    // Refused, and the page is fine. Coming back to the page asks again.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => page.evaluate(() => (window as never)['__wakeRequests'])).toBe(2)
    // Leaving the recipe lets the screen sleep again.
    await page.getByRole('navigation', { name: 'Main' }).getByText('Plan').click()
    await expect(page.getByTestId('screen-plan')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as never)['__wakeReleases'])).toBe(1)
  })
})
