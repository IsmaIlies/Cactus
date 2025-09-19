import { db, auth } from '../firebase';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

const PRESENCE_COL = collection(db, 'pokerPresence');

export interface PokerSpectatorDoc {
  uid: string;
  displayName: string;
  lastActive: any;
}

export function listenSpectators(cb: (list: PokerSpectatorDoc[]) => void) {
  // All presence docs; client will filter stale (>120s)
  return onSnapshot(PRESENCE_COL, snap => {
    const now = Date.now();
    const list: PokerSpectatorDoc[] = [];
    snap.forEach(d => {
      const data = d.data() as any;
      const ts = data.lastActive?.toMillis?.() ?? 0;
      if (now - ts < 120000) list.push(data as PokerSpectatorDoc);
    });
    cb(list.sort((a,b)=> a.displayName.localeCompare(b.displayName)));
  });
}

export async function enterSpectator() {
  const user = auth.currentUser; if (!user) return;
  const ref = doc(PRESENCE_COL, user.uid);
  await setDoc(ref, { uid: user.uid, displayName: user.displayName || user.email || user.uid.slice(0,6), lastActive: serverTimestamp() }, { merge: true });
}

export async function heartbeatPresence() {
  const user = auth.currentUser; if (!user) return;
  // Simple client-side throttle: avoid spamming writes if called too frequently
  // (Firestore internal assertion can appear with very fast successive writes/offline flaps)
  const now = Date.now();
  // @ts-ignore attach cached last ts on function object
  const last = (heartbeatPresence as any)._lastTs || 0;
  if (now - last < 9000) return; // skip if <9s since last successful attempt
  const ref = doc(PRESENCE_COL, user.uid);
  try {
    await setDoc(ref, { lastActive: serverTimestamp() }, { merge: true });
    // @ts-ignore store last ts
    (heartbeatPresence as any)._lastTs = now;
  } catch (e) {
    // Silent network/offline errors; will retry next interval
    if (process.env.NODE_ENV === 'development') console.warn('[presence] heartbeat skipped', e);
  }
}
