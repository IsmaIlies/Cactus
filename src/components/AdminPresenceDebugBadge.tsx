import React from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, firebaseApp } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const ACTIVITY_WINDOW_MS = 15 * 60 * 1000;

function readTimestampMs(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (!v) continue;
    if (typeof v === 'number') return v;
    if (typeof v?.toDate === 'function') {
      try { return v.toDate().getTime(); } catch {}
    }
    if (typeof v?.seconds === 'number') {
      return v.seconds * 1000 + (typeof v?.nanoseconds === 'number' ? Math.floor(v.nanoseconds / 1e6) : 0);
    }
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

function isActiveByData(data: any): boolean {
  const ms = readTimestampMs(data, [
    'lastActive', 'lastPing', 'lastHeartbeat', 'lastActivity', 'lastLogin', 'lastSeenAt', 'updatedAt'
  ]);
  const now = Date.now();
  if (typeof ms === 'number') {
    const diff = now - ms;
    if (diff >= -60 * 60 * 1000 && diff <= ACTIVITY_WINDOW_MS) return true; // tolerate future skew 60m
  }
  // fallbacks
  if (data?.isOnline === true) return true;
  const status = (data?.status || '').toString().toLowerCase();
  if (['online','actif','active','present','présent'].includes(status)) return true;
  return false;
}

function timeAgo(ms: number | null): string {
  if (!ms) return '—';
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  return `il y a ${h}h`;
}

const AdminPresenceDebugBadge: React.FC = () => {
  const { user } = useAuth();
  const [enabled, setEnabled] = React.useState(false);
  const [selfLastActive, setSelfLastActive] = React.useState<number | null>(null);
  const [selfLastPing, setSelfLastPing] = React.useState<number | null>(null);
  const [lastWriteOk, setLastWriteOk] = React.useState<boolean | null>(null);
  const [fsActive, setFsActive] = React.useState<number | null>(null);
  const [authActive, setAuthActive] = React.useState<number | null>(null);
  const [loadingCounts, setLoadingCounts] = React.useState(false);

  // Decide visibility: admin roles or local debug flag
  React.useEffect(() => {
    const flag = typeof window !== 'undefined' && localStorage.getItem('presenceDebug') === '1';
    const isAdmin = !!(user?.role && ['admin','superviseur','direction'].includes(String(user.role).toLowerCase()));
    setEnabled(Boolean(flag || isAdmin));
  }, [user?.role]);

  // Subscribe to own user doc
  React.useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.id);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() || {};
      setSelfLastActive(readTimestampMs(data, ['lastActive']));
      const lp = readTimestampMs(data, ['lastPing']);
      setSelfLastPing(lp);
    });
    return () => { try { unsub(); } catch {} };
  }, [user?.id]);

  const forcePing = React.useCallback(async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.id), {
        lastActive: serverTimestamp(),
        lastPing: Date.now(),
        isOnline: true,
      }, { merge: true });
      setLastWriteOk(true);
    } catch (e) {
      setLastWriteOk(false);
    }
  }, [user?.id]);

  const refreshCounts = React.useCallback(async () => {
    setLoadingCounts(true);
    try {
      // Firestore live count
      const snaps = await getDocs(collection(db, 'users'));
      let c = 0;
      snaps.forEach((d) => { if (isActiveByData(d.data())) c += 1; });
      setFsActive(c);
    } catch {
      setFsActive(null);
    }
    try {
      // Cloud Function Auth count (1h window)
      const functions = getFunctions(firebaseApp, 'europe-west9');
      const callable = httpsCallable(functions, 'getAdminUserStats');
      const res: any = await callable({ window: '1h' }).catch(() => null);
      setAuthActive(res?.data?.activeUsers ?? null);
    } catch {
      setAuthActive(null);
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    // lazy initial load
    refreshCounts();
  }, [enabled, refreshCounts]);

  // Désactivé définitivement
  return null;
};

export default AdminPresenceDebugBadge;
