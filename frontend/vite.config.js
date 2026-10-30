import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredApi = env.WATERWISE_BACKEND_ORIGIN;
  let localTarget = 'http://127.0.0.1:5000';
  try {
    const target = new URL(configuredApi);
    if (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) localTarget = target.origin;
  } catch { /* Use the default local backend for relative API URLs. */ }
  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'autoUpdate',
      // Keep the application shell available while testing offline on `npm run dev`.
      // Navigation fallback for SPA routes (e.g. /admin/settings) is handled
      // in src/sw.js, which always resolves to a cached Response or a 503
      // instead of rejecting the FetchEvent.
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeManifestIcons: false,
      manifest: {
        name: 'WaterWise',
        short_name: 'WaterWise',
        description: 'Barangay water readings, billing, payments, analytics, and resident services.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4fafb',
        theme_color: '#0b2b40',
        icons: [
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: configuredApi ?? localTarget,
        changeOrigin: true,
      },
    },
  },
  };
})
