// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyAVwI_khdW0p51YGGFBUJ8XfRqTdRIuHWQ",
  authDomain: "cactus-mm.firebaseapp.com",
  projectId: "cactus-mm",
  // IMPORTANT: Le bucket affiché dans la console est gs://cactus-mm.firebasestorage.app
  // Le 404 venait du fait que "cactus-mm.appspot.com" n'existe pas.
  // Si tu crées plus tard le bucket par défaut appspot.com tu pourras revenir dessus.
  storageBucket: "cactus-mm.firebasestorage.app",
  messagingSenderId: "696239719776",
  appId: "1:696239719776:web:d5fc5d9b73f3f65fea8a05",
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Configure Firestore to better handle restricted networks/dev environments
// Fixes issues like 400 on Write/Listen channel by falling back to long polling
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const firebaseApp = app;
export const storage = getStorage(app);
