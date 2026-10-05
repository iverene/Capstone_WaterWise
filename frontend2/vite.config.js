import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// Standalone dashboard (port 5174). Same trick as the main frontend:
// proxy /api to the backend so the browser stays same-origin and the
// HttpOnly session cookie + fingerprint header just work (no CORS change).
const localTarget = process.env.WATERWISE_API_TARGET ?? 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: localTarget,
        changeOrigin: true,
      },
    },
  },
})
