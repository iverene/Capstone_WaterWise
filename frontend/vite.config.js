import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      // Keep the application shell available while testing offline on `npm run dev`.
      devOptions: {
        enabled: true,
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
            src: '/pwa-icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-maskable.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.WATERWISE_API_TARGET ?? 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
