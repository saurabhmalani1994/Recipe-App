import { expect, test } from '@playwright/test'

// Every route the app has, by its `HashRouter` path, and a name for its screenshot.
// `/recipe/r07` stands in for the dynamic recipe detail route, and `/my-recipes/new` for the
// dynamic editor route.
const ROUTES: { path: string; name: string }[] = [
  { path: '/', name: 'home' },
  { path: '/cook', name: 'cook' },
  { path: '/plan', name: 'plan' },
  { path: '/list', name: 'list' },
  { path: '/my-recipes', name: 'my-recipes' },
  { path: '/my-recipes/new', name: 'my-recipe-editor' },
  { path: '/favorites', name: 'favorites' },
  { path: '/kitchen', name: 'kitchen' },
  { path: '/settings', name: 'settings' },
  { path: '/recipe/r07', name: 'recipe-detail' },
]

const WIDTHS = [360, 412]

for (const width of WIDTHS) {
  test.describe(`no horizontal scroll at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const route of ROUTES) {
      test(`route ${route.path}`, async ({ page }) => {
        await page.goto(`/#${route.path}`)
        await expect(page.locator('.app-shell')).toBeVisible()
        const loading = page.getByText('Loading…')
        if (await loading.isVisible().catch(() => false)) {
          await expect(loading).toBeHidden()
        }

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(
          scrollWidth,
          `document.scrollWidth should not exceed clientWidth`,
        ).toBeLessThanOrEqual(clientWidth)

        // One reference screenshot per route at the brief's canonical 412x915.
        if (width === 412) {
          await page.screenshot({ path: `e2e/screens/route-${route.name}-412x915.png` })
        }
      })
    }
  })
}
