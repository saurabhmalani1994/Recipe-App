import type { Location } from 'react-router-dom'

export type BackAction = 'exit' | 'back' | 'home'

/**
 * What the Android back gesture or button does on `location` (S21): it exits only from the Home
 * root, goes back through the app's history anywhere else, and goes Home from a screen the app
 * was opened on directly (the first history entry, which react-router keys "default").
 */
export function backAction(location: Pick<Location, 'pathname' | 'key'>): BackAction {
  if (location.pathname === '/') return 'exit'
  return location.key === 'default' ? 'home' : 'back'
}
