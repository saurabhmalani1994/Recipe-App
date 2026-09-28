import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** How long a snackbar stays up before it goes on its own (ms). */
const SNACKBAR_MS = 6000

export interface SnackbarOptions {
  message: string
  /** The button's label; "Undo" by default. */
  actionLabel?: string
  /** Runs when the button is tapped. No action: a plain notice. */
  onAction?: () => void
}

interface ShownSnackbar extends SnackbarOptions {
  id: number
}

interface SnackbarContextValue {
  show: (options: SnackbarOptions) => void
  dismiss: () => void
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null)

/**
 * The undo snackbar (S22b). One at a time: a new one replaces the last. It sits above the bottom
 * nav, is announced politely, and goes after SNACKBAR_MS, or when its action is tapped.
 * Deletes happen straight away (so closing the app never loses or resurrects anything); "Undo"
 * puts the thing back.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ShownSnackbar | null>(null)
  const nextId = useRef(1)
  const timer = useRef<number | undefined>(undefined)

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current)
    setCurrent(null)
  }, [])

  const show = useCallback((options: SnackbarOptions) => {
    window.clearTimeout(timer.current)
    const id = nextId.current++
    setCurrent({ ...options, id })
    timer.current = window.setTimeout(() => {
      setCurrent((prev) => (prev?.id === id ? null : prev))
    }, SNACKBAR_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div className="snackbar-region" role="status" aria-live="polite">
        {current && (
          <div className="snackbar" key={current.id} data-testid="snackbar">
            <span className="snackbar__message">{current.message}</span>
            {current.onAction && (
              <button
                type="button"
                className="snackbar__action"
                onClick={() => {
                  current.onAction?.()
                  dismiss()
                }}
              >
                {current.actionLabel ?? 'Undo'}
              </button>
            )}
          </div>
        )}
      </div>
    </SnackbarContext.Provider>
  )
}

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext)
  if (!context) throw new Error('useSnackbar() must be used inside <SnackbarProvider>')
  return context
}
