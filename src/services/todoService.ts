// src/services/todoService.ts
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Timestamp | Date;
}

// 🔽 Récupérer les todos (snapshot unique, pas en temps réel)
export async function getTodos(userUID: string): Promise<TodoItem[]> {
  const todosRef = collection(db, "users", userUID, "todos");
  const snap = await getDocs(todosRef);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TodoItem[];
}

// ➕ Ajouter un nouveau todo
export async function addTodo(userUID: string, title: string): Promise<string> {
  const todosRef = collection(db, "users", userUID, "todos");
  const docRef = await addDoc(todosRef, {
    title,
    completed: false,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// ✅ Modifier completed
export async function toggleTodo(
  userUID: string,
  todoId: string,
  completed: boolean
): Promise<void> {
  const ref = doc(db, "users", userUID, "todos", todoId);
  await updateDoc(ref, { completed });
}

// 🗑️ Supprimer un todo
export async function deleteTodo(userUID: string, todoId: string): Promise<void> {
  const ref = doc(db, "users", userUID, "todos", todoId);
  await deleteDoc(ref);
}

// 🔁 Écoute temps réel des todos
export function listenToTodos(
  userUID: string,
  onUpdate: (todos: TodoItem[]) => void
): Unsubscribe {
  const todosRef = collection(db, "users", userUID, "todos");
  const q = query(todosRef, orderBy("createdAt", "desc"));
  // Ajout gestion d'erreur permission-denied pour ne pas crasher la console utilisateur
  return onSnapshot(q,
    (snapshot) => {
      // Debug optionnel
      if (import.meta.env.DEV && (window as any).__todosDebug !== false) {
        console.debug('[todoService] snapshot reçu', { userUID, count: snapshot.size });
      }
      const todos = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TodoItem[];
      onUpdate(todos);
    },
    (err) => {
      if (err?.code === 'permission-denied') {
        if (import.meta.env.DEV) {
          console.warn('[todoService] permission-denied pour userUID=', userUID, ' — tentative fallback one-shot getDocs');
        }
        // Fallback: tentative lecture unique (si la règle est strictement identique ça échouera aussi, mais on évite le bruit)
        (async () => {
          try {
            const snap = await getDocs(todosRef);
            const todos = snap.docs.map(d => ({ id: d.id, ...d.data() })) as TodoItem[];
            onUpdate(todos);
          } catch (e) {
            // Dernier recours: liste vide
            onUpdate([]);
          }
        })();
      } else {
        console.error('[todoService] Snapshot error', err);
      }
    }
  );
}
