
/**
 * Migration Script: Ajoute `region: 'FR'` à tous les documents `sales` sans champ `region`.
 * Utilisation:
 *   1. Créer un service account Firestore (rôle Datastore User ou Editor minimum).
 *   2. Exporter la variable d'environnement GOOGLE_APPLICATION_CREDENTIALS vers le chemin du JSON.
 *      PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\chemin\serviceAccount.json"
 *   3. Installer la dépendance firebase-admin (ajoutée dans package.json).
 *   4. Exécuter: npx ts-node scripts/migrateSalesRegionFR.ts  (ou: npm run migrate:sales-region)
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialisation: si GOOGLE_APPLICATION_CREDENTIALS défini, applicationDefault() suffit
initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

interface MigrationStats {
  scanned: number;
  updated: number;
  batches: number;
}

const BATCH_LIMIT = 400; // laisser marge sous la limite Firestore (500 écritures)

async function migrateSalesRegionFR(): Promise<MigrationStats> {
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let more = true;
  const stats: MigrationStats = { scanned: 0, updated: 0, batches: 0 };

  while (more) {
    let q = db.collection('sales').orderBy('__name__').limit(BATCH_LIMIT);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let localUpdates = 0;

    for (const docSnap of snap.docs) {
      stats.scanned++;
      const data = docSnap.data();
      if (!Object.prototype.hasOwnProperty.call(data, 'region')) {
        batch.update(docSnap.ref, { region: 'FR' });
        localUpdates++;
      }
    }

    if (localUpdates > 0) {
      await batch.commit();
      stats.updated += localUpdates;
      stats.batches++;
      console.log(`Batch #${stats.batches} : ${localUpdates} documents mis à jour.`);
    } else {
      console.log('Batch sans mise à jour.');
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_LIMIT) more = false; // fin pagination
  }
  return stats;
}

(async () => {
  console.log('--- Début migration ventes legacy (region=FR) ---');
  const start = Date.now();
  try {
    const result = await migrateSalesRegionFR();
    const ms = Date.now() - start;
    console.log('--- Migration terminée ---');
    console.log(`Scannés : ${result.scanned}`);
    console.log(`Mises à jour : ${result.updated}`);
    console.log(`Batches : ${result.batches}`);
    console.log(`Durée : ${(ms/1000).toFixed(2)}s`);
    if (result.updated === 0) {
      console.log('Aucun document legacy trouvé (tout est déjà migré).');
    }
  } catch (e) {
    console.error('Erreur migration:', e);
    process.exit(1);
  }
})();
