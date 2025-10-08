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
  // First try with the region as-is (e.g., 'CIV' or 'FR')
  const baseConstraints: any[] = [
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
    where('region', '==', activeRegion)
  ];
  try {
    const qRef = query(collection(db, 'sales'), ...baseConstraints);
    let snap = await getDocs(qRef);
    // If no results and region might be stored lowercase (e.g., 'civ'), retry once with lowercase variant
    if (snap.empty && region) {
      const lowerConstraints: any[] = [
        where('date', '>=', Timestamp.fromDate(start)),
        where('date', '<', Timestamp.fromDate(end)),
        where('region', '==', (activeRegion as string).toLowerCase())
      ];
      const qRefLower = query(collection(db, 'sales'), ...lowerConstraints);
      snap = await getDocs(qRefLower);
    }
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (err: any) {
    const isIndexMissing = (err?.code === 'failed-precondition') || /index/i.test(String(err?.message || ''));
    if (!isIndexMissing) throw err;
    // Fallback: query by date only, then filter region in-memory (temporary until index builds)
    const dateOnlyConstraints: any[] = [
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<', Timestamp.fromDate(end)),
    ];
    const qRefDateOnly = query(collection(db, 'sales'), ...dateOnlyConstraints);
    const snap = await getDocs(qRefDateOnly);
    const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    if (!region) return items;
    const ar = String(activeRegion).toUpperCase();
    return items.filter(it => String((it as any).region || '').toUpperCase() === ar);
  }
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
