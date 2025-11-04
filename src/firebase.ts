// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from 'firebase/storage';

// Support multi-env via Vite env variables. Falls back to current prod values if not provided.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAVwI_khdW0p51YGGFBUJ8XfRqTdRIuHWQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "cactus-mm.firebaseapp.com",
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

// Optional: connect to local emulators for safe development
// Enable by setting VITE_USE_FIREBASE_EMULATORS=true in your .env (dev only)
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  try {
    // Hosts/ports can be overridden via env if needed
    const host = import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1';
    const authPort = Number(import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099);
    const firestorePort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
    const storagePort = Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 9199);

    connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, firestorePort);
    connectStorageEmulator(storage, host, storagePort);
    // eslint-disable-next-line no-console
    console.info('[Firebase] Emulators connected:', { host, authPort, firestorePort, storagePort });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Firebase] Failed to connect emulators', e);
  }
}
