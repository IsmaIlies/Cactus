import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export interface Sale {
  id: string;
  userId: string;
  name: string;
  offer: string;
  date: any;
  status?: string;
  consent?: "yes" | "pending";
}

// Récupère toutes les ventes validées (consent === 'yes') du mois en cours
export async function getValidatedSalesThisMonth(): Promise<Sale[]> {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const snapshot = await getDocs(collection(db, "sales"));
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId || "",
        name: data.name || "",
        offer: data.offer || "",
        date: data.date,
        status: data.status,
        consent: data.consent,
      } as Sale;
    })
    .filter((s) => {
      // On ne garde que les ventes avec consentement explicite (consent === 'yes')
      if (s.consent !== "yes") return false;
      const d =
        s.date && typeof s.date.toDate === "function"
          ? s.date.toDate()
          : new Date(s.date);
      return d >= firstDay && d <= lastDay;
    });
}
