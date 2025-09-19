// One-time migration script to add participants[] to legacy private messages.
// Usage (temporary): import and call runMigratePrivateMessages() from a protected admin view OR
// open browser console on any authenticated page where firebase app is initialized and paste the function body.
// After migration, you can tighten Firestore rules (remove backward compatibility block).

import { getFirestore, collection, getDocs, writeBatch, doc, DocumentData } from 'firebase/firestore';
import { app } from '../firebase';

interface LegacyMessage extends DocumentData {
  channel?: string;
  participants?: string[];
}

export async function runMigratePrivateMessages(limitPerBatch = 400) {
  const db = getFirestore(app);
  const colRef = collection(db, 'messages');
  const snap = await getDocs(colRef); // If very large, replace with pagination.
  const toFix: { id: string; channel: string }[] = [];
  snap.forEach(docSnap => {
    const data = docSnap.data() as LegacyMessage;
    if(!data) return;
    if(data.channel && data.channel !== 'public' && (!Array.isArray(data.participants) || !data.participantA || !data.participantB)) {
      if(data.channel.includes('_')) {
        const parts = data.channel.split('_').filter(Boolean);
        if(parts.length === 2) {
          toFix.push({ id: docSnap.id, channel: data.channel });
        }
      }
    }
  });

  console.log(`Found ${toFix.length} legacy private messages without participants.`);
  let processed = 0;
  while(processed < toFix.length) {
    const batch = writeBatch(db);
    const slice = toFix.slice(processed, processed + limitPerBatch);
    slice.forEach(item => {
      const parts = item.channel.split('_').filter(Boolean).sort();
      if(parts.length === 2) {
  batch.update(doc(db,'messages', item.id), { participants: parts, participantA: parts[0], participantB: parts[1] });
      } else {
        console.warn('Skipping malformed channel', item.channel);
      }
    });
    await batch.commit();
    processed += slice.length;
    console.log(`Updated ${processed}/${toFix.length}`);
  }
  console.log('Migration complete.');
}

// If you want to auto-run when explicitly imported:
// (async()=>{ await runMigratePrivateMessages(); })();
