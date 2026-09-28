import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  backListeners: [] as (() => void)[],
  exits: 0,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (event: string, fn: () => void) => {
      if (event === 'backButton') native.backListeners.push(fn)
      return {
        remove: async () => {
          native.backListeners = native.backListeners.filter((l) => l !== fn)
        },
      }
    },
    exitApp: async () => {
      native.exits += 1
    },
  },
}))

const { AndroidBackButton } = await import('./AndroidBackButton')
const { backAction } = await import('./backAction')

function Screens({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <AndroidBackButton />
      <Routes>
        <Route path="/" element={<Link to="/cook">screen-home</Link>} />
        <Route path="/cook" element={<Link to="/recipe/r01">screen-cook</Link>} />
        <Route path="/recipe/:id" element={<p>screen-recipe</p>} />
      </Routes>
    </MemoryRouter>
  )
}

async function pressBack() {
  await act(async () => {
    for (const listener of native.backListeners) listener()
  })
}

beforeEach(() => {
  native.backListeners = []
  native.exits = 0
})

afterEach(() => {
  cleanup()
})

describe('backAction', () => {
  it('exits only from the Home root', () => {
    expect(backAction({ pathname: '/', key: 'default' })).toBe('exit')
    expect(backAction({ pathname: '/', key: 'abc' })).toBe('exit')
    expect(backAction({ pathname: '/cook', key: 'abc' })).toBe('back')
    expect(backAction({ pathname: '/cook', key: 'default' })).toBe('home')
  })
})

describe('AndroidBackButton', () => {
  it('walks back through the app history, and exits only at Home', async () => {
    const user = userEvent.setup()
    render(<Screens initial="/" />)
    await user.click(await screen.findByText('screen-home'))
    await user.click(await screen.findByText('screen-cook'))
    expect(await screen.findByText('screen-recipe')).toBeInTheDocument()
    expect(native.backListeners).toHaveLength(1)

    await pressBack()
    expect(await screen.findByText('screen-cook')).toBeInTheDocument()
    await pressBack()
    expect(await screen.findByText('screen-home')).toBeInTheDocument()
    expect(native.exits).toBe(0)
    await pressBack()
    expect(native.exits).toBe(1)
  })

  it('goes Home, not out of the app, from a screen it was opened on', async () => {
    render(<Screens initial="/cook" />)
    await screen.findByText('screen-cook')
    await pressBack()
    expect(await screen.findByText('screen-home')).toBeInTheDocument()
    expect(native.exits).toBe(0)
  })
})
