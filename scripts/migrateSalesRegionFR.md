# Migration des ventes legacy (ajout champ region)

Objectif: Ajouter `region: 'FR'` à tous les documents de la collection `sales` qui n'ont pas encore ce champ.

## Script Node (Admin SDK)

Créer un fichier `migrateSalesRegionFR.ts` (ou .js) hors du bundle front :

```ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Fournir le chemin vers votre clé de service (variable d'environnement recommandée)
// process.env.GOOGLE_APPLICATION_CREDENTIALS doit pointer vers le JSON service account

initializeApp({
  // Si GOOGLE_APPLICATION_CREDENTIALS est défini, pas besoin d'autre chose
});

const db = getFirestore();

async function runBatchMigration(limit = 300) {
  const snap = await db.collection('sales')
    .where('region', '==', null) // ne matchera pas car Firestore n'autorise pas ce test
    .get();
  // Firestore ne permet pas where('region','==',null) => on scanne un chunk sans filtre region.
}

async function run(limit = 500) {
  const batchSize = limit;
  let processed = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let q = db.collection('sales').orderBy('__name__').limit(batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let updates = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      if (!('region' in data)) {
        batch.update(d.ref, { region: 'FR' });
        updates++;
      }
    });
    if (updates > 0) {
      await batch.commit();
      console.log(`Batch commit: ${updates} mises à jour`);
    } else {
      console.log('Batch sans modifications');
    }
    processed += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < batchSize) break; // fin
  }
  console.log('Migration terminée');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
```

## Étapes d'exécution
1. Créer un projet Node séparé ou dossier `admin/`.
2. Installer `firebase-admin`.
3. Exporter/clés service account (rôle minimal Firestore).
4. `set GOOGLE_APPLICATION_CREDENTIALS=chemin\vers\serviceAccount.json` (Windows Powershell: `$env:GOOGLE_APPLICATION_CREDENTIALS='C:\path\file.json'`).
5. Lancer `ts-node migrateSalesRegionFR.ts` ou compiler puis `node dist/...`.

## Après migration
- Les requêtes strictes `where('region','==','FR')` fonctionneront.
- Plus besoin de fallback côté client.

## Vérification rapide (console Node)
```js
const countNoRegion = (await db.collection('sales').where('region','==','FR').get()).size; // devrait refléter total FR
```

## Sécurité
Mettre à jour les règles Firestore pour exiger:
```rules
allow write: if request.resource.data.region == resource.data.region; // empêcher changement de région
```

(Adapte selon ton modèle d'autorisation actuelle.)