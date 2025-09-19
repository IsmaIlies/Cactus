import { collection, getDocs, query, orderBy, limit, writeBatch, startAfter } from 'firebase/firestore';
import { db } from '../firebase';

export interface MigrationResult {
  scanned: number;
  updated: number;
  batches: number;
  done: boolean;
}

// Note: Firestore ne permet pas where('region','==',null). On scanne donc par page et on teste en mémoire.
// Ce script est destiné à être lancé par un compte ADMIN côté front; ne pas exposer publiquement.

export async function migrateLegacySalesRegionFR(maxPerBatch = 400, maxBatches = 20, onProgress?: (r: MigrationResult) => void): Promise<MigrationResult> {
  let lastDoc: any = undefined;
  let batches = 0;
  let scanned = 0;
  let updated = 0;
  let done = false;

  while (batches < maxBatches) {
    let qRef = query(collection(db, 'sales'), orderBy('__name__'), limit(maxPerBatch));
    if (lastDoc) qRef = query(collection(db, 'sales'), orderBy('__name__'), startAfter(lastDoc), limit(maxPerBatch));
    const snap = await getDocs(qRef);
    if (snap.empty) { done = true; break; }

    const batch = writeBatch(db);
    let localUpdates = 0;
    snap.docs.forEach(d => {
      scanned++;
      const data = d.data();
      if (!('region' in data)) {
        batch.update(d.ref, { region: 'FR' });
        localUpdates++;
      }
    });
    if (localUpdates > 0) {
      await batch.commit();
      updated += localUpdates;
    }
    batches++;
    lastDoc = snap.docs[snap.docs.length - 1];
    onProgress?.({ scanned, updated, batches, done: false });
    if (snap.size < maxPerBatch) { done = true; break; }
  }
  const result = { scanned, updated, batches, done };
  onProgress?.(result);
  return result;
}
