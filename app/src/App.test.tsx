import { cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { resetUserDbForTests } from './db'
import { getSettings } from './features/settings/settingsRepo'

beforeEach(() => {
  window.localStorage.clear()
  // `user.db` is a module-level singleton (getUserDb()); force a fresh in-memory db per test
  // so one test's settings writes don't leak into the next.
  resetUserDbForTests()
})

afterEach(() => {
  cleanup()
})

describe('App shell', () => {
  beforeEach(() => {
    window.location.hash = '#/'
  })

  it('renders all five bottom nav tabs, and no global diet bar (S22a)', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const label of ['Home', 'Cook', 'Plan', 'List', 'My Recipes']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByRole('radiogroup', { name: 'Diet quick switch' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('defaults the Diet chip on Home to Everything', () => {
    render(<App />)
    const chip = screen.getByTestId('diet-chip')
    expect(chip).toHaveAccessibleName('Diet: Everything')
    expect(chip).not.toHaveAttribute('data-active')
  })

  it('the Diet chip opens a sheet, and a pick applies for the session without changing the default', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('diet-chip'))
    const sheet = screen.getByRole('dialog', { name: 'Diet' })
    await user.click(within(sheet).getByRole('radio', { name: /No red meat/ }))

    const chip = screen.getByTestId('diet-chip')
    expect(chip).toHaveAccessibleName('Diet: No red meat')
    expect(chip).toHaveAttribute('data-active', 'true')
    expect(chip).toHaveTextContent('No red meat')
    // The default lives in Settings; the chip does not write it.
    expect((await getSettings()).dietPreset).toBe('everything')
  })

  it('persists the default diet chosen in Settings to user.db, and applies it', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/settings'
    render(<App />)

    const group = await screen.findByRole('radiogroup', { name: 'Diet preset' })
    await user.click(within(group).getByRole('radio', { name: 'No red meat' }))
    await waitFor(async () => {
      expect((await getSettings()).dietPreset).toBe('no_red_meat')
    })

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByText('Home'))
    expect(await screen.findByTestId('diet-chip')).toHaveAccessibleName('Diet: No red meat')
  })
})
