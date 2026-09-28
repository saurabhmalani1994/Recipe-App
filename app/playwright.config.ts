import { defineConfig, devices } from '@playwright/test'

// Uses the browser already installed in this container instead of downloading one.
// Each checkout gets its own server: parallel worktrees used to share 4173 and
// silently test each other's builds. Set PW_PORT to run two suites at once.
const port = Number(process.env.PW_PORT ?? 4173)

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 412, height: 915 },
        launchOptions: { executablePath },
      },
    },
  ],
})
