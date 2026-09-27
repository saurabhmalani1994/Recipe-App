import { DietSwitch } from './DietSwitch'

export function Header() {
  return (
    <header className="app-header">
      <h1 className="app-header__title">Recipe App</h1>
      <DietSwitch />
    </header>
  )
}
