import { NavLink } from 'react-router-dom'

interface Tab {
  to: string
  label: string
  icon: string
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/cook', label: 'Cook', icon: '🍳' },
  { to: '/plan', label: 'Plan', icon: '📅' },
  { to: '/list', label: 'List', icon: '🛒' },
  { to: '/my-recipes', label: 'My Recipes', icon: '📖' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`
          }
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="bottom-nav__label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
