import { onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "../firebase"; // Reuse the shared app + auth-bound Firestore

type Notification = {
  message: string;
  type: "sale" | "message" | "objective";
  userName?: string; // Added userName to include the name of the person
};

// Real-time event listener for actual sales using Firebase
export const listenToRealTimeEvents = (
  callback: (notification: Notification) => void
) => {
  // Listen to the "sales" collection in Firestore
  const activeRegion = (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || 'FR';
  const q = query(collection(db, "sales"), where('region','==', activeRegion));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    let latestNotification: Notification | null = null;

    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const saleData = change.doc.data();

        if (!saleData.userName) {
          return; // Ignore la notification si userName est manquant
        }

        latestNotification = {
          message: `Vente de : ${saleData.userName || "Utilisateur inconnu"}`,
          type: "sale",
          userName: saleData.userName, // Use the actual user name from the Firestore document
        };
      }
    });

    // Trigger the callback with the latest notification if it exists
    if (latestNotification) {
      callback(latestNotification);
    }
  });

  // Return an unsubscribe function
  return unsubscribe;
};
