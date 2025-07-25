// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAVwI_khdW0p51YGGFBUJ8XfRqTdRIuHWQ",
  authDomain: "cactus-mm.firebaseapp.com",
  projectId: "cactus-mm",
  storageBucket: "cactus-mm.firebasestorage.app",
  messagingSenderId: "696239719776",
  appId: "1:696239719776:web:d5fc5d9b73f3f65fea8a05",
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const firebaseApp = app;
