import { useEffect } from 'react'

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

/**
 * Keeps the screen on while the calling view is mounted (S22b: a recipe open in the kitchen).
 * Uses the Screen Wake Lock API. A browser without it, or one that refuses (battery saver, a
 * hidden page), just lets the screen sleep as usual: nothing throws. The lock drops whenever the
 * page is hidden, so it is taken again when the page comes back.
 */
export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
    if (!wakeLock) return
    let sentinel: WakeLockSentinelLike | null = null
    let active = true

    const acquire = () => {
      if (!active || document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      wakeLock
        .request('screen')
        .then((next) => {
          if (active) sentinel = next
          else void next.release().catch(() => undefined)
        })
        .catch(() => {
          // Refused (not visible, not allowed, power saving): tolerated, the screen may sleep.
        })
    }

    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', acquire)
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined)
    }
  }, [enabled])
}
