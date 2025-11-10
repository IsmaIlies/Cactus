import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Hook de debug (DEV uniquement)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  import('./services/geminiService')
    .then((m) => {
      // @ts-ignore
      (window as any).__geminiDebugResolve = m.debugResolveApiKey;
      // @ts-ignore
      (window as any).__viteEnv = import.meta.env;
      // Logs dev discrets (désactiver si inutile)
      // console.debug('[Gemini] Debug hook prêt: window.__geminiDebugResolve()');
      // console.debug('[Vite] Env keys:', Object.keys(import.meta.env));
      // console.debug('[Vite] VITE_GEMINI_API_KEY length:', import.meta.env.VITE_GEMINI_API_KEY?.length ?? 0);
    })
    .catch(() => {});
}

// Injecter la clé Gemini sur window pour un fallback runtime fiable (DEV uniquement)
if (import.meta.env.DEV) {
  try {
    const k = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (typeof window !== 'undefined' && k && k.length > 0) {
      // @ts-ignore
      (window as any).__INITIAL_GEMINI_KEY = k;
      // console.debug('[Gemini] __INITIAL_GEMINI_KEY injectée (length):', k.length);
    }
  } catch {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);