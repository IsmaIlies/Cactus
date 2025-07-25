// src/services/chatHistoryService.ts
import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date | Timestamp;
}

export interface ChatHistory {
  id: string;
  createdAt: Date | Timestamp;
  title?: string;
  messages: ChatMessage[];
}

// Get all chat histories for a user (sorted by createdAt desc)
export async function getUserHistories(
  userUID: string
): Promise<ChatHistory[]> {
  const historiesRef = collection(db, "users", userUID, "chatHistories");
  const q = query(historiesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ChatHistory[];
}

// Get a single chat history (by id)
export async function getHistory(
  userUID: string,
  historyId: string
): Promise<ChatHistory | null> {
  const ref = doc(db, "users", userUID, "chatHistories", historyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ChatHistory;
}

// Create a new chat history (returns the new history id)
export async function createHistory(
  userUID: string,
  title = "Nouvelle conversation"
): Promise<string> {
  const historiesRef = collection(db, "users", userUID, "chatHistories");
  const docRef = await addDoc(historiesRef, {
    createdAt: serverTimestamp(),
    title,
    messages: [],
  });
  return docRef.id;
}

// Get paginated messages for a chat history (last N, then older)
export async function getMessagesPage(
  userUID: string,
  historyId: string,
  pageSize: number = 10,
  startAfterDoc?: QueryDocumentSnapshot
): Promise<{ messages: ChatMessage[]; lastDoc: QueryDocumentSnapshot | null }> {
  const messagesRef = collection(
    db,
    "users",
    userUID,
    "chatHistories",
    historyId,
    "messages"
  );
  let q = query(messagesRef, orderBy("timestamp", "desc"), limit(pageSize));
  if (startAfterDoc) {
    q = query(
      messagesRef,
      orderBy("timestamp", "desc"),
      startAfter(startAfterDoc),
      limit(pageSize)
    );
  }
  const snap = await getDocs(q);
  const messages = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ChatMessage[];
  return {
    messages,
    lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
  };
}

// Add a message to a chat history (as a document in subcollection)
export async function addMessageToHistory(
  userUID: string,
  historyId: string,
  message: ChatMessage
): Promise<void> {
  const messagesRef = collection(
    db,
    "users",
    userUID,
    "chatHistories",
    historyId,
    "messages"
  );
  await setDoc(doc(messagesRef, message.id), message);
}

// Delete a chat history and all its messages
export async function deleteHistory(
  userUID: string,
  historyId: string
): Promise<void> {
  const ref = doc(db, "users", userUID, "chatHistories", historyId);
  // Supprimer tous les messages de la sous-collection
  const messagesRef = collection(
    db,
    "users",
    userUID,
    "chatHistories",
    historyId,
    "messages"
  );
  const snap = await getDocs(messagesRef);
  const batchDeletes = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(batchDeletes);
  await deleteDoc(ref);
}

// Update the title of a chat history
export async function updateHistoryTitle(
  userUID: string,
  historyId: string,
  newTitle: string
): Promise<void> {
  const ref = doc(db, "users", userUID, "chatHistories", historyId);
  await updateDoc(ref, {
    title: newTitle,
  });
}
