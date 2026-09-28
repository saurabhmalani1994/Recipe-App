import { Capacitor, registerPlugin } from '@capacitor/core'

/** The slice of @capacitor/haptics this app uses. Registered by name, so the web build needs no
 * extra package: on a native build that ships the plugin the call reaches it; anywhere else
 * `isPluginAvailable` is false and the web vibration API (if any) stands in. */
interface HapticsPlugin {
  impact(options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>
}

const Haptics = registerPlugin<HapticsPlugin>('Haptics')

/** A light tick of feedback (a swipe crossing its threshold). Never throws, never waits. */
export function hapticTick(): void {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Haptics')) {
      void Haptics.impact({ style: 'LIGHT' }).catch(() => undefined)
      return
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8)
    }
  } catch {
    // Feedback is a nicety: a device that refuses it just stays quiet.
  }
}
