import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { backAction } from './backAction'

/**
 * Takes over the Android back button from Capacitor's default, which leaves the app. Renders
 * nothing; mount it once inside the router.
 */
export function AndroidBackButton() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = useRef(location)

  useEffect(() => {
    current.current = location
  }, [location])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = CapacitorApp.addListener('backButton', () => {
      switch (backAction(current.current)) {
        case 'exit':
          void CapacitorApp.exitApp()
          break
        case 'back':
          void navigate(-1)
          break
        case 'home':
          void navigate('/', { replace: true })
          break
      }
    })
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [navigate])

  return null
}
