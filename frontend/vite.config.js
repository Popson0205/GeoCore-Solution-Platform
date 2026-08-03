import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Three separate entry points => three separate bundles. Each can be
// deployed independently (its own static host / subdomain / CDN path) —
// "GeoCore Survey" and "GeoCore Dashboard" are genuinely standalone
// builds, not just routes inside the portal's bundle. They still share
// this one codebase and talk to the same backend API; VITE_PORTAL_URL
// controls where a standalone app's "open full editor" links point when
// it's deployed somewhere other than the portal (see src/config.js).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        portal: resolve(__dirname, 'index.html'),
        survey: resolve(__dirname, 'survey.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
      },
    },
  },
})
