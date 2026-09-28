import type { CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface SectionHeaderProps {
  title: string
  /** A small line under the title ("Picked from what's in your kitchen"). */
  subtitle?: ReactNode
  /** Small uppercase label above the title. */
  kicker?: string
  action?: ReactNode
  id?: string
  level?: 2 | 3
}

/** A magazine-style section header: optional kicker, serif title, optional subtitle and action. */
export function SectionHeader({
  title,
  subtitle,
  kicker,
  action,
  id,
  level = 3,
}: SectionHeaderProps) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className="section-header">
      <div className="section-header__text">
        {kicker && <p className="kicker">{kicker}</p>}
        <Heading className="section-header__title" id={id}>
          {title}
        </Heading>
        {subtitle && <p className="section-header__subtitle">{subtitle}</p>}
      </div>
      {action && <div className="section-header__action">{action}</div>}
    </div>
  )
}

interface EmptyStateProps {
  icon?: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
  testId?: string
}

/** A friendly, centred "nothing here yet" with a clear next step. */
export function EmptyState({
  icon = 'whisk',
  title,
  children,
  action,
  compact,
  testId,
}: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? ' empty-state--compact' : ''}`} data-testid={testId}>
      <span className="empty-state__icon">
        <Icon name={icon} size={compact ? 22 : 28} />
      </span>
      <p className="empty-state__title">{title}</p>
      {children && <div className="empty-state__body">{children}</div>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}

/** A shimmering placeholder block. Decorative: screen readers get a status line instead. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />
}
