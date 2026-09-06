import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { initPWAInstallCapture } from './services/pwaInstall.js'

// Capture `beforeinstallprompt` before React mounts so no download icon misses it.
initPWAInstallCapture()

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error('WaterWise service worker registration failed.', error)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
