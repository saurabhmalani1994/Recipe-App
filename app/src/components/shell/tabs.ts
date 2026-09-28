import type { IconName } from '../ui/Icon'

/** The five top-level tabs, in pager order (S22a: swipe left or right between them). */
export const TABS: readonly { path: string; label: string; icon: IconName; title: string }[] = [
  { path: '/', label: 'Home', icon: 'home', title: 'Recipe App' },
  { path: '/cook', label: 'Cook', icon: 'cook', title: 'Cook' },
  { path: '/plan', label: 'Plan', icon: 'plan', title: 'Plan' },
  { path: '/list', label: 'List', icon: 'list', title: 'Grocery list' },
  { path: '/my-recipes', label: 'My Recipes', icon: 'book', title: 'My Recipes' },
]

export function tabIndexOf(pathname: string): number {
  return TABS.findIndex((tab) => tab.path === pathname)
}

/** The top bar's title for a route that is not a tab. */
export function routeTitle(pathname: string): string {
  const tab = TABS[tabIndexOf(pathname)]
  if (tab) return tab.title
  if (pathname === '/settings') return 'Settings'
  if (pathname === '/kitchen') return 'What I have'
  if (pathname === '/favorites') return 'Favorites'
  if (pathname === '/my-recipes/import') return 'Import a recipe'
  if (pathname.startsWith('/my-recipes/')) return 'My recipe'
  if (pathname.startsWith('/recipe/')) return 'Recipe'
  return 'Recipe App'
}
