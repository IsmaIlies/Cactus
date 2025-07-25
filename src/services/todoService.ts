// src/services/todoService.ts
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  getDoc,
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

  return onSnapshot(q, (snapshot) => {
    const todos = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TodoItem[];
    onUpdate(todos);
  });
}
