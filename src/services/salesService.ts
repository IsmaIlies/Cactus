// services/salesService.ts
import { db } from "../firebase";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";

export type Sale = {
  id: string;
  userId?: string;
  name?: string;
  offer?: string;
  basketStatus?: string;
  consent?: string; // legacy
  date: any; // Firestore Timestamp | Date | string
  // champs optionnels...
  orderNumber?: string;
  campaign?: string;
  clientFirstName?: string;
  clientLastName?: string;
  clientPhone?: string;
};

// Utilitaires de date pour bornes mois courant
const getMonthBounds = (ref = new Date()) => {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
};

/**
 * Récupère **toutes** les ventes du mois courant (quel que soit le statut panier)
 */
export async function getSalesThisMonth(region?: 'FR' | 'CIV'): Promise<Sale[]> {
  const activeRegion = region || (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || 'FR';
  const { start, end } = getMonthBounds();
  const constraints: any[] = [
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
    where('region', '==', activeRegion)
  ];
  const qRef = query(collection(db, 'sales'), ...constraints);
  const snap = await getDocs(qRef);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

/**
 * (Optionnel) Version “validées” si tu en as besoin ailleurs
 * Logique : basketStatus in ["OK","Valid SOFT"] (compat: accepte aussi l'ancien "VALID FINALE") ou fallback legacy consent === "yes"
 */
export async function getValidatedSalesThisMonth(region?: 'FR' | 'CIV'): Promise<Sale[]> {
  const all = await getSalesThisMonth(region);
  const isValidated = (s: Sale) => {
    const bs = (s as any).basketStatus as string | undefined;
    if (bs && ["OK", "Valid SOFT", "VALID FINALE"].includes(bs)) return true;
    if ((s as any).consent === "yes") return true; // legacy
    return false;
  };
  return all.filter(isValidated);
}
