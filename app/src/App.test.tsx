import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('App shell', () => {
  it('renders all five bottom nav tabs and the diet switch', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const label of ['Home', 'Cook', 'Plan', 'List', 'My Recipes']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('radiogroup', { name: 'Diet quick switch' })).toBeInTheDocument()
  })

  it('defaults the diet preset to Everything', () => {
    render(<App />)
    expect(screen.getByRole('radio', { name: 'Everything' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('persists the diet preset choice to localStorage', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: 'No red meat' }))

    expect(screen.getByRole('radio', { name: 'No red meat' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(window.localStorage.getItem('recipe-app.diet-preset')).toBe('no_red_meat')
  })
})
