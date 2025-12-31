// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from 'firebase/storage';

// Support multi-env via Vite env variables. Falls back to current prod values if not provided.
const resolveAuthDomain = () => {
  try {
    if (typeof window !== 'undefined') {
      const host = (window.location?.hostname || '').toLowerCase();
      // Local dev: use a stable Firebase-hosted auth domain unless explicitly overridden.
      // Using the localhost hostname here would not work for OAuth handlers.
      if (host === 'localhost' || host === '127.0.0.1') {
        const explicit = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
        if (explicit && String(explicit).trim()) return String(explicit).trim();
        return 'cactus-mm.firebaseapp.com';
      }

      // Production/staging: prefer the domain the app is currently served from (custom domain or *.web.app).
      // This keeps the OAuth handler on the same domain and avoids Azure redirect URI mismatches.
      if (host) return host;
    }
  } catch {}

  // Fallback for non-browser contexts (build tooling/tests) or if you need to force a specific domain.
  const explicit = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
  if (explicit && String(explicit).trim()) return String(explicit).trim();

  // IMPORTANT: authDomain controls which domain hosts Firebase Auth OAuth handlers (popup/redirect).
  // For non-browser contexts, pick a stable default.
  return 'cactus-mm.firebaseapp.com';
};

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAVwI_khdW0p51YGGFBUJ8XfRqTdRIuHWQ",
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "cactus-mm",
  // IMPORTANT: Le bucket affiché dans la console est gs://cactus-mm.firebasestorage.app
  // Si tu utilises un autre projet (dev/staging), mets son bucket ci-dessous via VITE_FIREBASE_STORAGE_BUCKET
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "cactus-mm.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "696239719776",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:696239719776:web:d5fc5d9b73f3f65fea8a05",
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Configure Firestore to better handle restricted networks/dev environments
// Fixes issues like 400 on Write/Listen channel by falling back to long polling
// Allow forcing long polling via env to avoid WebChannel-based noise (400 on TYPE=terminate)
const FORCE_LP = import.meta.env.VITE_FIRESTORE_FORCE_LONG_POLLING === 'true';
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: !FORCE_LP,
  experimentalForceLongPolling: FORCE_LP,
});
export const firebaseApp = app;
export const storage = getStorage(app);

// Connect to local emulators only when explicitly requested.
// Default: disabled (dev uses prod backends) to avoid localhost handler issues (e.g. 127.0.0.1:9101 refusé).
try {
  const ENV_WANTS_EMU = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
  let USE_EMULATORS = false;

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search || '');
    const toggle = params.get('emu') || params.get('useEmu');
    if (toggle === '1' || toggle === 'true') USE_EMULATORS = true;
    if (toggle === '0' || toggle === 'false') USE_EMULATORS = false;

    // If env sets emulators=true but no explicit URL toggle, keep them OFF by default.
    if (toggle === null && ENV_WANTS_EMU) USE_EMULATORS = false;
  } else {
    // Non-browser contexts: follow env only.
    USE_EMULATORS = ENV_WANTS_EMU;
  }

  if (USE_EMULATORS) {
    const HOST = (import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1').toString();
    const AUTH_PORT = Number(import.meta.env.VITE_AUTH_EMULATOR_PORT || '9099');
    const FS_PORT = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || '8080');
    const ST_PORT = Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || '9199');

    // Auth emulator
    connectAuthEmulator(auth, `http://${HOST}:${AUTH_PORT}`);
    // Firestore emulator
    connectFirestoreEmulator(db, HOST, FS_PORT);
    // Storage emulator
    connectStorageEmulator(storage, HOST, ST_PORT);
  }
} catch {}
