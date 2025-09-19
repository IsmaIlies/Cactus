import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Dev helper: proxy /api/justwatch -> deployed Cloud Function to avoid 404 in local dev
// Alternative (if using emulator): change target to your local emulator URL.
const JUSTWATCH_FN_BASE = 'https://europe-west9-cactus-mm.cloudfunctions.net';

export default defineConfig({
  plugins: [react()],
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
        rewrite: (path) => path.replace(/^\/api\/justwatch$/, '/justwatchProxy'),
      },
    },
  },
});

