import type { ReactNode } from 'react'
import { Icon } from './Icon'

interface TopBarProps {
  title: string
  /** Shows a back arrow on the left (a screen below the tabs). */
  onBack?: () => void
  /** Icon buttons or links on the right. */
  actions?: ReactNode
  elevated?: boolean
  collapsed?: boolean
}

/**
 * The compact top bar (S22a): a serif title, an optional back arrow, and actions. It gains a
 * hairline once the screen scrolls, and tucks away while scrolling down (back on scroll up).
 */
export function TopBar({
  title,
  onBack,
  actions,
  elevated = false,
  collapsed = false,
}: TopBarProps) {
  return (
    <header
      className={`topbar${elevated ? ' topbar--elevated' : ''}${collapsed ? ' topbar--collapsed' : ''}`}
      data-collapsed={collapsed ? 'true' : undefined}
    >
      <div className="topbar__row">
        {onBack && (
          <button
            type="button"
            className="icon-button topbar__back"
            aria-label="Back"
            onClick={onBack}
          >
            <Icon name="back" />
          </button>
        )}
        <h1 className="topbar__title">{title}</h1>
        {actions && <div className="topbar__actions">{actions}</div>}
      </div>
    </header>
  )
}
