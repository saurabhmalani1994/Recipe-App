import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the app (it works offline): Fraunces for display, Inter for UI.
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/inter/wght.css'
import './styles/tokens.css'
import './styles/app.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
