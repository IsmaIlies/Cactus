import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION = 'presenceRosters';

function docIdForRegion(region?: string) {
  const r = (region || 'GLOBAL').toUpperCase();
  return `${r}`;
}

export async function getRoster(region?: string): Promise<string[] | null> {
  try {
    const ref = doc(db, COLLECTION, docIdForRegion(region));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    if (Array.isArray(data?.agents)) return data.agents as string[];
    return null;
  } catch {
    return null;
  }
}

export async function saveRoster(agents: string[], region?: string) {
  const ref = doc(db, COLLECTION, docIdForRegion(region));
  await setDoc(ref, { agents }, { merge: true });
}
