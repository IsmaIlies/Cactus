import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export type RecapPayload = {
  subject: string;
  to?: string;
  cc?: string;
  date: string; // yyyy-MM-dd
  mission?: string;
  encadrants?: string[];
  kpis: {
    ventesConfirmees: number;
    mailsCommandes: number;
    conges: number;
    sanction: number;
    demission: number;
    absence: number;
    retard: number;
  };
  notes?: { technique?: string; electricite?: string; production?: string };
  presence: {
    present: string[];
    absent: string[];
    unmarked: string[];
    delaysByAgent?: Record<string, { value: number; unit: 'minutes' | 'heures' }>;
  };
  salesBySeller?: Record<string, number>;
};

const COLLECTION = 'presenceRecaps';

export async function addRecap(date: string, payload: RecapPayload) {
  const ref = doc(db, COLLECTION, date);
  await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true });
}
