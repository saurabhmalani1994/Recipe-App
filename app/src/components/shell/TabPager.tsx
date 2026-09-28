import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChrome } from './chrome'
import { TABS, tabIndexOf } from './tabs'

/** Movement (px) before a gesture is read as a horizontal swipe or a vertical scroll. */
const LOCK_DISTANCE = 10
/** A swipe must be this much more horizontal than vertical to count. */
const HORIZONTAL_BIAS = 1.2
/** Let go past this share of the width and the pager moves on. */
const COMMIT_FRACTION = 0.28
/** ... or flick at least this fast (px/ms) over at least FLICK_MIN_DX px. */
const FLICK_VELOCITY = 0.35
const FLICK_MIN_DX = 24
/** Pulling past the first or last tab moves at this fraction of the finger (rubber band). */
const EDGE_RESISTANCE = 0.25
/** Longest settle animation (--dur-slow) plus slack, in case transitionend never fires. */
const SETTLE_FALLBACK_MS = 420

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  /** null until the gesture has moved far enough to pick an axis. */
  axis: 'x' | 'y' | null
  dx: number
  /** Recent samples for the release velocity. */
  samples: { x: number; t: number }[]
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** A gesture that starts on a form control, or inside something that scrolls sideways itself
 * (a chip row, a photo carousel), belongs to that element, not to the pager. */
function ownsHorizontalGesture(target: EventTarget | null, stop: Element): boolean {
  let el = target instanceof Element ? target : null
  while (el && el !== stop) {
    if (el.matches('[data-swipe-ignore], input, textarea, select, [contenteditable="true"]'))
      return true
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

/**
 * The five tabs as a horizontal pager (S22a, owner D21: "Swipe between tabs"). The page under
 * the finger moves with it, the neighbour slides in beside it, and letting go past a threshold
 * (or with a flick) lands on the neighbour's route. Vertical scrolling stays native: a gesture
 * only becomes a swipe once it is clearly horizontal, and one that starts in a sideways scroller
 * is left to it.
 *
 * At rest only the current tab is mounted (so tests, focus and data stay exactly as before); the
 * neighbours mount for the length of a drag.
 */
export function TabPager({ screens }: { screens: readonly ReactNode[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { onScroll, reset } = useChrome()
  const active = Math.max(0, tabIndexOf(location.pathname))

  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const settling = useRef(false)
  const [peek, setPeek] = useState<number[]>([])
  const [dragging, setDragging] = useState(false)

  // How the current tab arrived: a swipe lands in place; a nav tap slides the new page in.
  const [arrival, setArrival] = useState<{ index: number; enter: 'left' | 'right' | null }>({
    index: active,
    enter: null,
  })
  const [swipedTo, setSwipedTo] = useState<number | null>(null)
  if (arrival.index !== active) {
    const enter =
      swipedTo === active || reducedMotion() ? null : active > arrival.index ? 'right' : 'left'
    setArrival({ index: active, enter })
    setSwipedTo(null)
    setPeek([])
  }

  // A new tab: the track snaps back to rest in the same frame its panels move, so a finished
  // swipe never flickers; the top bar comes back.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (track) {
      track.style.transition = 'none'
      track.style.transform = ''
    }
    settling.current = false
    reset()
  }, [active, reset])

  // Swallow the click that ends a drag, so letting go over a card doesn't open it.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onClick = (event: MouseEvent) => {
      if (viewport.dataset.suppressClick) {
        event.preventDefault()
        event.stopPropagation()
        delete viewport.dataset.suppressClick
      }
    }
    viewport.addEventListener('click', onClick, true)
    return () => viewport.removeEventListener('click', onClick, true)
  }, [])

  function setOffset(px: number, animate: boolean) {
    const track = trackRef.current
    if (!track) return
    track.style.transition = animate ? 'transform var(--dur-slow) var(--ease-standard)' : 'none'
    track.style.transform = px === 0 ? '' : `translate3d(${px}px, 0, 0)`
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (settling.current || gesture.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (ownsHorizontalGesture(event.target, event.currentTarget)) return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      dx: 0,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    const dx = event.clientX - g.startX
    const dy = event.clientY - g.startY
    if (g.axis === null) {
      if (Math.abs(dx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return
      if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS) {
        g.axis = 'x'
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
        setPeek([active - 1, active + 1].filter((i) => i >= 0 && i < TABS.length))
      } else {
        gesture.current = null // a vertical scroll: leave it to the browser
        return
      }
    }
    const atEdge = (dx > 0 && active === 0) || (dx < 0 && active === TABS.length - 1)
    g.dx = atEdge ? dx * EDGE_RESISTANCE : dx
    g.samples.push({ x: event.clientX, t: event.timeStamp })
    if (g.samples.length > 6) g.samples.shift()
    setOffset(g.dx, false)
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    gesture.current = null
    if (g.axis !== 'x') return
    setDragging(false)
    const viewport = viewportRef.current
    if (viewport && Math.abs(g.dx) > LOCK_DISTANCE) viewport.dataset.suppressClick = '1'
    window.setTimeout(() => {
      if (viewport) delete viewport.dataset.suppressClick
    }, 0)

    const first = g.samples[0]
    const last = g.samples[g.samples.length - 1]
    const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0
    const width = viewport?.clientWidth ?? window.innerWidth
    const direction = g.dx < 0 ? 1 : -1 // +1: to the next tab (finger moved left)
    const target = active + direction
    const far = Math.abs(g.dx) > width * COMMIT_FRACTION
    const flick =
      Math.abs(velocity) > FLICK_VELOCITY &&
      Math.abs(g.dx) > FLICK_MIN_DX &&
      Math.sign(velocity) === -direction
    const canMove = target >= 0 && target < TABS.length && event.type !== 'pointercancel'

    if (!canMove || !(far || flick)) {
      setOffset(0, true)
      window.setTimeout(() => {
        if (!gesture.current) setPeek([])
      }, SETTLE_FALLBACK_MS)
      return
    }

    settling.current = true
    let landed = false
    const land = () => {
      if (landed) return
      landed = true
      setSwipedTo(target)
      navigate(TABS[target].path)
    }
    if (reducedMotion()) {
      land()
      return
    }
    setOffset(-direction * width, true)
    const track = trackRef.current
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== track) return
      track?.removeEventListener('transitionend', onEnd)
      land()
    }
    track?.addEventListener('transitionend', onEnd)
    window.setTimeout(land, SETTLE_FALLBACK_MS)
  }

  const mounted = [...new Set([active, ...peek])].sort((a, b) => a - b)

  return (
    <div
      ref={viewportRef}
      className={`pager${dragging ? ' pager--dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDragStart={(event) => {
        if (gesture.current) event.preventDefault()
      }}
      data-testid="tab-pager"
    >
      <div ref={trackRef} className="pager__track">
        {mounted.map((index) => {
          const isActive = index === active
          const enter = isActive ? arrival.enter : null
          return (
            <div
              key={TABS[index].path}
              className={`pager__panel app-scroll${enter ? ` pager__panel--enter-${enter}` : ''}`}
              style={{ transform: `translate3d(${(index - active) * 100}%, 0, 0)` }}
              aria-hidden={isActive ? undefined : true}
              inert={!isActive}
              onScroll={isActive ? onScroll : undefined}
              data-tab={TABS[index].path}
            >
              {screens[index]}
            </div>
          )
        })}
      </div>
    </div>
  )
}
