import { NavLink } from 'react-router-dom'
import { TABS } from './shell/tabs'
import { Icon } from './ui/Icon'

/**
 * The bottom navigation (S22a): 64dp tall plus the safe-area inset, inline SVG icons, and a pill
 * behind the active tab's icon. Every item is a full-height tap target.
 */
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/'}
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`
          }
        >
          <span className="bottom-nav__pill" aria-hidden="true">
            <Icon name={tab.icon} size={24} />
          </span>
          <span className="bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
