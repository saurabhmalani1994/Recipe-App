import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode, UIEvent } from 'react'

/** Scroll distance (px) past which the top bar may tuck away. */
const COLLAPSE_AFTER = 64
/** Ignore scroll jitter smaller than this (px) when deciding the direction. */
const DIRECTION_SLOP = 6

interface ChromeState {
  /** Scrolled away from the top: the bar gets a hairline and shadow. */
  elevated: boolean
  /** Scrolling down, well past the top: the bar tucks away (it comes back on any scroll up). */
  collapsed: boolean
}

interface ChromeContextValue extends ChromeState {
  /** Attach to a screen's scroll container: `<div onScroll={onScroll}>`. */
  onScroll: (event: UIEvent<HTMLElement>) => void
  /** Back to the resting state (a new screen starts at the top). */
  reset: () => void
}

const ChromeContext = createContext<ChromeContextValue | null>(null)

/** Shared state for the collapsing top bar, driven by whichever screen is scrolling. */
export function ChromeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChromeState>({ elevated: false, collapsed: false })
  const lastY = useRef(0)

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const y = event.currentTarget.scrollTop
    const delta = y - lastY.current
    if (Math.abs(delta) < DIRECTION_SLOP && y > 0) return
    lastY.current = y
    const elevated = y > 2
    const collapsed = y > COLLAPSE_AFTER && delta > 0
    setState((prev) =>
      prev.elevated === elevated && prev.collapsed === collapsed ? prev : { elevated, collapsed },
    )
  }, [])

  const reset = useCallback(() => {
    lastY.current = 0
    setState((prev) =>
      prev.elevated || prev.collapsed ? { elevated: false, collapsed: false } : prev,
    )
  }, [])

  const value = useMemo(() => ({ ...state, onScroll, reset }), [state, onScroll, reset])
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useChrome(): ChromeContextValue {
  const context = useContext(ChromeContext)
  if (!context) throw new Error('useChrome() must be used inside <ChromeProvider>')
  return context
}
