import { Link } from 'react-router-dom'
import { DietSwitch } from './DietSwitch'

export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__row">
        <h1 className="app-header__title">Recipe App</h1>
        <Link to="/settings" className="app-header__settings" aria-label="Settings">
          ⚙
        </Link>
      </div>
      <DietSwitch />
    </header>
  )
}
