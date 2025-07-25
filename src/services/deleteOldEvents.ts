import { collection, getDocs, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

const EVENTS_COLLECTION = "mrwhite_events";

export async function deleteOldEvents() {
  const now = Timestamp.now();
  const eventsCol = collection(db, EVENTS_COLLECTION);
  const snapshot = await getDocs(eventsCol);
  const promises: Promise<any>[] = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.createdAt && now.seconds - data.createdAt.seconds > 10) {
      promises.push(deleteDoc(docSnap.ref));
    }
  });
  await Promise.all(promises);
}
