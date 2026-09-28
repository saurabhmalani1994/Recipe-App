import { expect, test, type Page } from '@playwright/test'

// S22a quality gate: Home and Cook at 412x915 in light and dark, and at 360 wide; no horizontal
// page scroll; every tap target at least 48dp; the tab pager follows a swipe; the Diet chip opens
// its sheet. Screenshots land in e2e/screens/redesign-*.png.

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
      'a[href], button, input, select, textarea, [role="radio"]',
    )) {
      if (el.closest('[inert], [aria-hidden="true"]')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue
      // Clipped by a scroller (a carousel card half off-screen) still has its full box.
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

async function openHome(page: Page) {
  await page.goto('/#/')
  const home = page.getByTestId('screen-home')
  await expect(home).toBeVisible()
  await expect(page.getByTestId('home-row-cook')).toBeVisible()
  await expect(page.getByTestId('home-hero')).toBeVisible()
  // Let the fade-ins finish.
  await page.waitForTimeout(400)
  return home
}

async function openCook(page: Page) {
  await page.goto('/#/cook')
  const cook = page.getByTestId('screen-cook')
  await expect(cook).toBeVisible()
  await expect(cook.getByTestId('cook-count')).toContainText('recipes')
  await page.waitForTimeout(400)
  return cook
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} at 412x915`, () => {
    test.use({ viewport: { width: 412, height: 915 }, colorScheme: scheme })

    test(`Home (${scheme})`, async ({ page }) => {
      await openHome(page)
      await noHorizontalScroll(page)
      expect(await smallTapTargets(page)).toEqual([])
      await page.screenshot({ path: `e2e/screens/redesign-home-${scheme}-412x915.png` })
      // Scrolled: the rows as carousels, and the top bar tucked away.
      await page
        .getByTestId('tab-pager')
        .locator('.pager__panel')
        .evaluate((el) => el.scrollTo(0, 700))
      await page.waitForTimeout(400)
      await page.screenshot({ path: `e2e/screens/redesign-home-rows-${scheme}-412x915.png` })
    })

    test(`Cook (${scheme})`, async ({ page }) => {
      await openCook(page)
      await noHorizontalScroll(page)
      expect(await smallTapTargets(page)).toEqual([])
      await page.screenshot({ path: `e2e/screens/redesign-cook-${scheme}-412x915.png` })
      await page
        .getByTestId('tab-pager')
        .locator('.pager__panel')
        .evaluate((el) => el.scrollTo(0, 520))
      await page.waitForTimeout(400)
      await page.screenshot({ path: `e2e/screens/redesign-cook-results-${scheme}-412x915.png` })
    })

    test(`Diet sheet (${scheme})`, async ({ page }) => {
      await openCook(page)
      await page.getByTestId('diet-chip').click()
      const sheet = page.getByRole('dialog', { name: 'Diet' })
      await expect(sheet).toBeVisible()
      await page.waitForTimeout(400)
      expect(await smallTapTargets(page)).toEqual([])
      await page.screenshot({ path: `e2e/screens/redesign-diet-sheet-${scheme}-412x915.png` })
      await sheet.getByRole('radio', { name: /Vegetarian/ }).click()
      await expect(sheet).toBeHidden()
      const chip = page.getByTestId('diet-chip')
      await expect(chip).toHaveAttribute('data-active', 'true')
      await expect(chip).toHaveText(/Vegetarian/)
      await expect(page.getByTestId('cook-count')).toContainText('Vegetarian')
    })
  })
}

test.describe('360 wide', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('Home and Cook at 360x800', async ({ page }) => {
    await openHome(page)
    await noHorizontalScroll(page)
    expect(await smallTapTargets(page)).toEqual([])
    await page.screenshot({ path: 'e2e/screens/redesign-home-360x800.png' })
    await openCook(page)
    await noHorizontalScroll(page)
    expect(await smallTapTargets(page)).toEqual([])
    await page.screenshot({ path: 'e2e/screens/redesign-cook-360x800.png' })
  })
})

test.describe('swipe between tabs', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  async function drag(page: Page, from: { x: number; y: number }, dx: number, dy = 0, steps = 12) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps)
    }
    await page.mouse.up()
  }

  test('a swipe left moves Home to Cook, and a swipe right comes back', async ({ page }) => {
    await openHome(page)
    // Start on the masthead, clear of the sideways-scrolling rows.
    await drag(page, { x: 330, y: 140 }, -260)
    await expect(page).toHaveURL(/#\/cook$/)
    await expect(page.getByTestId('screen-cook')).toBeVisible()
    await expect(page.getByTestId('screen-home')).toHaveCount(0)

    await drag(page, { x: 80, y: 140 }, 260)
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByTestId('screen-home')).toBeVisible()
  })

  test('the page follows the finger mid-swipe, and a short drag springs back', async ({ page }) => {
    await openHome(page)
    await page.mouse.move(330, 140)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(330 - i * 25, 142)
    // Mid-drag: the track has moved with the finger and Cook is mounted beside Home.
    const offset = await page
      .getByTestId('tab-pager')
      .locator('.pager__track')
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)
    expect(offset).toBeLessThan(-100)
    await expect(page.getByTestId('screen-cook')).toHaveCount(1)
    await page.screenshot({ path: 'e2e/screens/redesign-swipe-midway-412x915.png' })
    // Drag back to a small offset and let go: stays on Home.
    await page.mouse.move(310, 142)
    await page.mouse.up()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByTestId('screen-cook')).toHaveCount(0)
  })

  test('a drag across a chip row scrolls the chips, not the tabs; a vertical drag scrolls', async ({
    page,
  }) => {
    await openCook(page)
    const chips = page.getByRole('group', { name: 'Filters' })
    const box = (await chips.boundingBox())!
    await drag(page, { x: box.x + box.width - 20, y: box.y + box.height / 2 }, -250)
    await page.waitForTimeout(450)
    await expect(page).toHaveURL(/#\/cook$/)

    // A mostly vertical drag is never taken as a swipe.
    await drag(page, { x: 200, y: 700 }, -40, -300)
    await page.waitForTimeout(450)
    await expect(page).toHaveURL(/#\/cook$/)
  })

  test('swipe past the last tab rubber-bands and stays', async ({ page }) => {
    await page.goto('/#/my-recipes')
    await expect(page.getByTestId('screen-my-recipes')).toBeVisible()
    await drag(page, { x: 330, y: 300 }, -300)
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/#\/my-recipes$/)
  })
})

// With the network up, recipes show their photos. The container has no internet, so every
// remote image is answered with a small, deliberately light "photo" (the worst case for white
// text over it): the hero's scrim must fade in and its text turn white.
const LIGHT_PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAoklEQVR4nGP49OjEh/tH3t898O723jc3dr6+tvXVlU0vLq57fn7Vs7PLn5xa/PjE/EfH5jw4POP+wSn39k9kIEn1nT29DCSpvr2rk4Ek1bd2tDGQpPrG1iYGklRf31zHQJLqaxurGUhSfWVdOQNJqi+vKWYgSfWlVQUMJKm+sDyHgSTV55dmMJCk+tziVAaSVJ9ZkMhAkurT82IZSFJ9ak4UABSdLSCbzGbZAAAAAElFTkSuQmCC',
  'base64',
)

test.describe('with photos', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('photos load into the hero and cards, with the scrim under the hero text', async ({
    page,
  }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
      route.request().resourceType() === 'image'
        ? route.fulfill({ contentType: 'image/png', body: LIGHT_PHOTO })
        : route.abort(),
    )
    await openHome(page)
    const hero = page.getByTestId('home-hero')
    // The fixture's day pick may have no photo; only assert the photo path when it has one.
    const photo = hero.locator('.recipe-image')
    if ((await photo.getAttribute('data-photo')) !== 'none') {
      await expect(photo).toHaveAttribute('data-photo', 'loaded')
      await page.waitForTimeout(400)
      const color = await hero
        .locator('.recipe-hero__title')
        .evaluate((el) => getComputedStyle(el).color)
      expect(color).toBe('rgb(255, 255, 255)')
    }
    await expect(
      page.locator('.recipe-tile .recipe-image[data-photo="loaded"]').first(),
    ).toBeVisible()
    await page.screenshot({ path: 'e2e/screens/redesign-home-photos-412x915.png' })
  })
})
