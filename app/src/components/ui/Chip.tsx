import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface ChipProps {
  children: ReactNode
  /** A remove (×) button inside the chip; the chip itself is then plain text. */
  onRemove?: () => void
  removeLabel?: string
}

/** A static chip (an ingredient you have), optionally removable. */
export function Chip({ children, onRemove, removeLabel }: ChipProps) {
  return (
    <span className={`chip${onRemove ? ' chip--removable' : ''}`}>
      <span className="chip__label">{children}</span>
      {onRemove && (
        <button type="button" className="chip__remove" aria-label={removeLabel} onClick={onRemove}>
          <Icon name="close" size={16} />
        </button>
      )}
    </span>
  )
}

interface FilterChipProps {
  label: ReactNode
  /** Highlighted: the filter is doing something. */
  active?: boolean
  icon?: IconName
  /** Opens a sheet: shows a caret, and announces `aria-haspopup="dialog"`. */
  opensSheet?: boolean
  /** A plain on/off toggle (One pot): announced with `aria-pressed`. */
  toggle?: boolean
  onClick: () => void
  testId?: string
  ariaLabel?: string
}

/**
 * A filter chip (S22a): Diet, Cuisine, Time, One pot, Equipment. A toggle chip carries
 * `aria-pressed`; a chip that opens a sheet carries a caret and `aria-haspopup`, and its label
 * turns into the chosen value ("Vegetarian", "Thai", "Under 30 min") when active.
 */
export function FilterChip({
  label,
  active = false,
  icon,
  opensSheet = false,
  toggle = false,
  onClick,
  testId,
  ariaLabel,
}: FilterChipProps) {
  return (
    <button
      type="button"
      className={`filter-chip${active ? ' filter-chip--active' : ''}`}
      aria-pressed={toggle ? active : undefined}
      aria-haspopup={opensSheet ? 'dialog' : undefined}
      aria-label={ariaLabel}
      data-active={active ? 'true' : undefined}
      data-testid={testId}
      onClick={onClick}
    >
      {active && toggle ? (
        <Icon name="check" size={18} className="filter-chip__icon" />
      ) : (
        icon && <Icon name={icon} size={18} className="filter-chip__icon" />
      )}
      <span className="filter-chip__label">{label}</span>
      {opensSheet && <Icon name="chevronDown" size={16} className="filter-chip__caret" />}
    </button>
  )
}

/**
 * A single row of chips that scrolls sideways inside itself (never the page). The pager's swipe
 * leaves a gesture that starts in here alone (`data-swipe-ignore`), so scrolling the chips never
 * flips the tab.
 */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="chip-row" role="group" aria-label={label} data-swipe-ignore="">
      {children}
    </div>
  )
}
