import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { initPWAInstallCapture } from './services/pwaInstall.js'

// Capture `beforeinstallprompt` before React mounts so no download icon misses it.
initPWAInstallCapture()

const registerServiceWorker = () => registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error('WaterWise service worker registration failed.', error)
  },
})

// Avoid competing with the first paint on slower mobile devices. Once the
// page is loaded, install/update the PWA cache during an idle browser window.
const scheduleServiceWorker = () => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(registerServiceWorker, { timeout: 4000 })
  } else {
    window.setTimeout(registerServiceWorker, 1500)
  }
}

if (document.readyState === 'complete') scheduleServiceWorker()
else window.addEventListener('load', scheduleServiceWorker, { once: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
