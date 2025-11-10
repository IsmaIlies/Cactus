import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Dev helper: proxy some /api/* -> deployed Cloud Functions to avoid 404 in local dev
// Alternative (if using emulator): change target to your local emulator URL.
const JUSTWATCH_FN_BASE = 'https://europe-west9-cactus-mm.cloudfunctions.net';
const LEADS_FN_BASE = 'https://europe-west1-cactus-mm.cloudfunctions.net';

export default defineConfig({
  plugins: [react()],
  // Ensure only variables prefixed with VITE_ are exposed to the client
  envPrefix: 'VITE_',
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173, // keep stable so it's whitelisted in allowedOrigins
    // If 5173 is busy and you REALLY need auto-increment, remove strictPort and also add 5174 in allowedOrigins (done in function)
    strictPort: false,
    proxy: {
      // Forward the relative frontend call /api/justwatch to the Cloud Function
      '/api/justwatch': {
        target: JUSTWATCH_FN_BASE,
        changeOrigin: true,
        // Allow querystrings (e.g., /api/justwatch?title=...)
        rewrite: (path) => path.replace(/^\/api\/justwatch/, '/justwatchProxy'),
      },
      // Forward /api/leads-stats to the leadsStats Cloud Function (prevents DOCTYPE HTML from SPA fallback)
      '/api/leads-stats': {
        target: LEADS_FN_BASE,
        changeOrigin: true,
        // Allow querystrings (e.g., /api/leads-stats?date_start=YYYY-MM-DD&date_end=YYYY-MM-DD)
        rewrite: (path) => path.replace(/^\/api\/leads-stats/, '/leadsStats'),
      },
      // Dev-only proxy to call the vendor API without CORS from the browser
      '/vendor/leads-stats': {
        target: 'https://orange-leads.mm.emitel.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/vendor\/leads-stats/, '/stats-lead.php'),
      },
    },
  },
});

