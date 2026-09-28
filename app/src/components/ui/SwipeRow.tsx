import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { hapticTick } from './haptics'
import { Icon, type IconName } from './Icon'

/** Movement (px) before a gesture is read as a horizontal swipe or a vertical scroll. */
const LOCK_DISTANCE = 10
/** A swipe must be this much more horizontal than vertical to count. */
const HORIZONTAL_BIAS = 1.2
/** Let go past this share of the row's width (capped at SWIPE_COMMIT_MAX px) to act. */
export const SWIPE_COMMIT_FRACTION = 0.35
const SWIPE_COMMIT_MAX = 140
/** Pulling a way that has no action moves at this fraction of the finger. */
const NO_ACTION_RESISTANCE = 0.15
/** Longest slide-out (--dur-med) plus slack, in case transitionend never fires. */
const SETTLE_FALLBACK_MS = 300

export interface SwipeAction {
  /** Names the action for assistive tech and on the revealed button ("Delete mango"). */
  label: string
  icon: IconName
  /** herb: a positive action (tick); danger: a destructive one (delete, remove). */
  tone: 'herb' | 'danger'
  onAction: () => void
  /** The row slides away before `onAction` runs (it is leaving the list). */
  dismiss?: boolean
  /** Render the non-swipe button for this action (on by default). Turn off only when the row
   * already shows its own visible control for the same thing (Kitchen's remove ×). */
  button?: boolean
}

interface SwipeRowProps {
  children: ReactNode
  /** Revealed by swiping right (from the start edge): tick. */
  startAction?: SwipeAction
  /** Revealed by swiping left (from the end edge): delete, remove. */
  endAction?: SwipeAction
  className?: string
  testId?: string
  as?: 'li' | 'div'
}

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  axis: 'x' | 'y' | null
  dx: number
  armed: boolean
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The one swipe-row primitive (S22b; owner, D21: "Swipe list items"). Swipe right for the start
 * action (tick), left for the end action (delete). Pointer events drive it, so touch, pen and
 * mouse all work; the row follows the finger, the action colour and icon show underneath, and
 * crossing the threshold arms it with a haptic tick. Letting go past the threshold acts; short
 * of it, the row springs back.
 *
 * Vertical scrolling stays native (`touch-action: pan-y`, and a gesture that locks vertical is
 * dropped). The tab pager leaves a gesture that starts here alone (`data-swipe-ignore`).
 *
 * Every action also has a non-swipe way in: a real button, labelled with the action, that is
 * transparent until it has keyboard focus (so it reads for TalkBack and a keyboard, and does not
 * crowd the row for a thumb). A row can turn it off when it shows its own visible control.
 */
export function SwipeRow({
  children,
  startAction,
  endAction,
  className = '',
  testId,
  as = 'li',
}: SwipeRowProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const [offset, setOffset] = useState(0)
  const [armed, setArmed] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function threshold(): number {
    const width = rootRef.current?.clientWidth ?? 320
    return Math.min(width * SWIPE_COMMIT_FRACTION, SWIPE_COMMIT_MAX)
  }

  function run(action: SwipeAction, direction: 1 | -1) {
    if (action.dismiss && !reducedMotion()) {
      const width = rootRef.current?.clientWidth ?? 320
      setAnimating(true)
      setLeaving(true)
      setOffset(direction * width)
      timer.current = window.setTimeout(() => {
        action.onAction()
        // A row that stays mounted (an undo put it back) returns to rest.
        setLeaving(false)
        setAnimating(false)
        setOffset(0)
      }, SETTLE_FALLBACK_MS)
      return
    }
    setAnimating(true)
    setOffset(0)
    action.onAction()
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.current || leaving) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as Element
    if (target.closest('input[type="text"], textarea, select')) return
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      dx: 0,
      armed: false,
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
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setAnimating(false)
      } else {
        gesture.current = null // a vertical scroll: the browser's
        return
      }
    }
    const action = dx > 0 ? startAction : endAction
    g.dx = action ? dx : dx * NO_ACTION_RESISTANCE
    const nowArmed = !!action && Math.abs(g.dx) >= threshold()
    if (nowArmed !== g.armed) {
      g.armed = nowArmed
      setArmed(nowArmed)
      if (nowArmed) hapticTick()
    }
    setOffset(g.dx)
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    gesture.current = null
    if (g.axis !== 'x') return
    if (Math.abs(g.dx) > LOCK_DISTANCE) {
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
    setArmed(false)
    const action = g.dx > 0 ? startAction : endAction
    if (action && g.armed && event.type !== 'pointercancel') {
      run(action, g.dx > 0 ? 1 : -1)
      return
    }
    setAnimating(true)
    setOffset(0)
  }

  const Root = as
  const direction = offset > 0 ? 'start' : offset < 0 ? 'end' : null
  const shown = direction === 'start' ? startAction : direction === 'end' ? endAction : undefined
  const classes = ['swipe-row', className]
  if (armed) classes.push('swipe-row--armed')
  if (leaving) classes.push('swipe-row--leaving')

  return (
    <Root
      ref={(el: HTMLElement | null) => {
        rootRef.current = el
      }}
      className={classes.filter(Boolean).join(' ')}
      data-testid={testId}
      data-swipe-ignore=""
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {shown && (
        <div
          className={`swipe-row__under swipe-row__under--${direction} swipe-row__under--${shown.tone}`}
          aria-hidden="true"
        >
          <Icon name={shown.icon} size={22} />
        </div>
      )}
      <div
        ref={contentRef}
        className={`swipe-row__content${animating ? ' swipe-row__content--settle' : ''}`}
        style={offset !== 0 ? { transform: `translate3d(${offset}px, 0, 0)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // A link or image in the row must not start a native drag (it would cancel the swipe).
        onDragStart={(event) => event.preventDefault()}
        onTransitionEnd={() => setAnimating(false)}
      >
        {children}
      </div>
      {[startAction, endAction].map((action, i) =>
        action && action.button !== false ? (
          <button
            key={i}
            type="button"
            className={`swipe-row__alt swipe-row__alt--${i === 0 ? 'start' : 'end'}`}
            onClick={() => run(action, i === 0 ? 1 : -1)}
          >
            <Icon name={action.icon} size={20} />
            <span>{action.label}</span>
          </button>
        ) : null,
      )}
    </Root>
  )
}
