import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Sticky footer (a "Done" or "Show 42 recipes" button). */
  footer?: ReactNode
  testId?: string
}

/** How far (px) a drag down the handle must travel before letting go closes the sheet. */
const DISMISS_DRAG = 80
/** Longest exit animation (tokens --dur-slow) plus slack, in case animationend never fires. */
const EXIT_FALLBACK_MS = 400

/**
 * A modal sheet that slides up from the bottom (S22a: filters open in one). Closes on the
 * backdrop, Escape, the close button, or dragging the handle down. Focus moves into the sheet
 * on open and back to whatever opened it on close.
 */
export function BottomSheet({ open, onClose, title, children, footer, testId }: BottomSheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)
  const dragStart = useRef<number | null>(null)
  const [drag, setDrag] = useState(0)
  // Stays mounted through the exit animation after `open` goes false.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  const closing = mounted && !open
  // The latest onClose, without re-running the open effect (and re-grabbing focus) on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(
      '[aria-checked="true"], input, button:not(.sheet__close), [href]',
    )
    ;(first ?? panel)?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const opener = openerRef.current
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => {
      setMounted(false)
      setDrag(0)
    }, EXIT_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [closing])

  if (!mounted) return null

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return
    setDrag(Math.max(0, event.clientY - dragStart.current))
  }
  function onPointerUp() {
    if (dragStart.current === null) return
    dragStart.current = null
    if (drag > DISMISS_DRAG) onClose()
    else setDrag(0)
  }

  return createPortal(
    <div className={`sheet-layer${closing ? ' sheet-layer--closing' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) {
            setMounted(false)
            setDrag(0)
          }
        }}
      >
        <div
          className="sheet__grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="sheet__handle" aria-hidden="true" />
          <div className="sheet__header">
            <h2 className="sheet__title" id={titleId}>
              {title}
            </h2>
            <button
              type="button"
              className="icon-button sheet__close"
              aria-label="Close"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

interface OptionListProps<T extends string> {
  label: string
  options: readonly { value: T; label: string; hint?: string }[]
  value: T
  onChange: (value: T) => void
}

/** A single-choice list for a sheet (Diet, Cuisine, Time): big rows, a check on the chosen one. */
export function OptionList<T extends string>({
  label,
  options,
  value,
  onChange,
}: OptionListProps<T>) {
  return (
    <div className="option-list" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`option${checked ? ' option--checked' : ''}`}
            onClick={() => onChange(option.value)}
          >
            <span className="option__text">
              <span className="option__label">{option.label}</span>
              {option.hint && <span className="option__hint">{option.hint}</span>}
            </span>
            <span className="option__check" aria-hidden="true">
              {checked && <Icon name="check" size={20} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
