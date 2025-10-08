// Annule une réclamation d'heures (retire hasDispute et les champs liés)
export async function cancelDispute(docId: string) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await updateDoc(ref, {
    hasDispute: false,
    disputeMessage: null,
    disputeNote: null,
    disputeSubmittedAt: null,
    claimStatus: null,
    claimAdminComment: null,
    claimHistory: null,
    updatedAt: serverTimestamp(),
  } as DocumentData);
}
// Message simplifié pour la réclamation d'heures
export const RECLAMATION_HEURES_MESSAGE = 'Reclamation faite en attente';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  Unsubscribe,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { DayEntry } from '../modules/checklist/lib/storage';
import { EntryReviewStatus } from '../modules/checklist/lib/constants';
import { getAuth } from 'firebase/auth';

export type HoursEntry = DayEntry & {
  userId: string;
  period: string; // yyyy-MM
  createdAt?: any;
  updatedAt?: any;
};

export type HoursEntryDoc = HoursEntry & { id: string; _docId: string };

const HOURS_ENTRIES = 'hoursEntries';
const HOURS_PERIODS = 'hoursPeriods'; // optional aggregation per user/period

function buildEntryDocId(userId: string, entryId: string) {
  // Contract: 1 document par entree unique => `${userId}_${entryId}`
  return `${userId}_${entryId}`;
}

function buildPeriodDocId(userId: string, period: string) {
  return `${userId}_${period}`;
}

export async function upsertAgentEntry(userId: string, period: string, entry: DayEntry, extras?: { userDisplayName?: string | null; userEmail?: string | null }) {
  const entryId = entry.id ?? entry.day;
  const _docId = buildEntryDocId(userId, entryId);
  const ref = doc(db, HOURS_ENTRIES, _docId);
  const derivedPeriod = (entry.day && entry.day.length >= 7) ? entry.day.slice(0,7) : period;
  // Stamp mission/region from local storage to classify entries per area (temporary until custom claims)
  let mission: string | null = null;
  let region: string | null = null;
  try {
    const m = localStorage.getItem('activeMission');
    const r = localStorage.getItem('activeRegion');
    mission = (m ? m : 'CANAL_PLUS').toUpperCase();
    region = r ? r.toUpperCase() : null; // don't default to FR; keep null when unset for inclusive supervisor filtering
  } catch {}
  const titleCase = (s: any) => {
    const str = ('' + s).trim();
    if (!str) return 'Pending';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };
  const payload: DocumentData = {
    ...entry,
    id: entryId,
    day: entry.day,
    // Force capitalized statuses for Admin contract
    reviewStatus: titleCase((entry as any).reviewStatus),
    status: ('' + (entry as any).status).toLowerCase(),
    userId,
    period: derivedPeriod,
    mission,
    region,
    userDisplayName: extras?.userDisplayName ?? null,
    userEmail: extras?.userEmail ?? null,
    rejectionNote: null,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  if (!entry.notes || entry.notes.length === 0) {
    delete (payload as any).notes;
  }
  await setDoc(ref, payload, { merge: true });
  if (localStorage.getItem('hoursDebug') === '1') {
    console.info('[hours] upsertAgentEntry OK', { docId: _docId, entryId, day: entry.day, period: derivedPeriod });
  }
  // Optional aggregation per user/period
  try {
    const periodRef = doc(db, HOURS_PERIODS, buildPeriodDocId(userId, derivedPeriod));
    await setDoc(periodRef, { userId, period: derivedPeriod, status: 'submitted', updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    // Non-blocking: this doc is optional and may be restricted by rules
    if (localStorage.getItem('hoursDebug') === '1') {
      console.warn('[hours] failed to upsert period aggregation', e);
    }
  }
  return { id: _docId };
}

// Public API matching the provided contract precisely for submission
export type AgentHoursEntry = {
  entryId?: string;
  day: string; // 'yyyy-MM-dd'
  includeMorning: boolean;
  includeAfternoon: boolean;
  morningStart: string; // 'HH:mm'
  morningEnd: string;   // 'HH:mm'
  afternoonStart: string; // 'HH:mm'
  afternoonEnd: string;   // 'HH:mm'
  project: string;
  notes?: string;
  hasDispute?: boolean;
  userDisplayName?: string | null;
  userEmail?: string | null;
  supervisor?: string;
};

export async function submitAgentHoursWithUid(userId: string, entry: AgentHoursEntry) {
  const period = entry.day.slice(0, 7); // yyyy-MM
  const entryId = entry.entryId ?? entry.day;
  const _docId = buildEntryDocId(userId, entryId);
  const ref = doc(db, HOURS_ENTRIES, _docId);
  // Stamp mission/region from local storage
  let mission: string | null = null;
  let region: string | null = null;
  try {
    const m = localStorage.getItem('activeMission');
    const r = localStorage.getItem('activeRegion');
    mission = (m ? m : 'CANAL_PLUS').toUpperCase();
    region = r ? r.toUpperCase() : null; // don't default to FR
  } catch {}
  const payload: DocumentData = {
    id: entryId,
    period,
    day: entry.day,
    includeMorning: !!entry.includeMorning,
    includeAfternoon: !!entry.includeAfternoon,
    morningStart: entry.morningStart || '',
    morningEnd: entry.morningEnd || '',
    afternoonStart: entry.afternoonStart || '',
    afternoonEnd: entry.afternoonEnd || '',
    project: entry.project || 'Autre',
    status: 'submitted',
    reviewStatus: 'Pending', // exact casing as Admin contract
    hasDispute: !!entry.hasDispute,
    userId,
    mission,
    region,
    userDisplayName: entry.userDisplayName ?? null,
    userEmail: entry.userEmail ?? null,
    supervisor: entry.supervisor || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (entry.notes && entry.notes.length > 0) {
    (payload as any).notes = entry.notes;
  }
  await setDoc(ref, payload, { merge: true });
  if (localStorage.getItem('hoursDebug') === '1') {
    console.info('[hours] submitAgentHoursWithUid OK', { docId: _docId, entryId, day: entry.day, period });
  }
}

// Helper that matches the provided snippet (uses getAuth to infer user)
export async function submitAgentHours(entry: AgentHoursEntry) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.day)) {
    throw new Error('Format day attendu: yyyy-MM-dd');
  }
  return submitAgentHoursWithUid(user.uid, {
    ...entry,
    userDisplayName: entry.userDisplayName ?? user.displayName ?? null,
    userEmail: entry.userEmail ?? user.email ?? null,
  });
}

export async function updateEntryFields(docId: string, patch: Partial<Pick<HoursEntry,
  'morningStart' | 'morningEnd' | 'afternoonStart' | 'afternoonEnd' | 'includeMorning' | 'includeAfternoon' | 'project' | 'notes' | 'day'
>>) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() } as DocumentData);
}

export async function approveEntry(docId: string) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await updateDoc(ref, { reviewStatus: EntryReviewStatus.Approved, updatedAt: serverTimestamp() } as DocumentData);
}

export async function rejectEntry(docId: string) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await updateDoc(ref, { reviewStatus: EntryReviewStatus.Rejected, status: 'draft', updatedAt: serverTimestamp() } as DocumentData);
}

export async function revertToDraft(docId: string) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await updateDoc(ref, { status: 'draft', reviewStatus: EntryReviewStatus.Pending, updatedAt: serverTimestamp() } as DocumentData);
}

export async function deleteEntry(docId: string) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await deleteDoc(ref);
}

export function subscribeEntriesByPeriod(period: string, cb: (entries: HoursEntryDoc[]) => void): Unsubscribe {
  const q = query(collection(db, HOURS_ENTRIES), where('period', '==', period));
  return onSnapshot(q, (snap) => {
    const list: HoursEntryDoc[] = [];
    snap.forEach((d) => {
      const data = d.data() as HoursEntry;
      // Normalize reviewStatus to lowercase enum shape for UI safety
      const normStatus = ('' + (data as any).reviewStatus).toLowerCase();
      list.push({ ...(data as any), reviewStatus: normStatus, id: data.id, _docId: d.id } as any);
    });
    // Sort by day ascending then by project for readability
    list.sort((a, b) => (a.day === b.day ? a.project.localeCompare(b.project) : a.day.localeCompare(b.day)));
    cb(list);
  });
}

export function getEntryDocIdFor(userId: string, entryId: string) {
  return buildEntryDocId(userId, entryId);
}

export function subscribeEntriesByUser(userId: string, period: string, cb: (entries: HoursEntryDoc[]) => void): Unsubscribe {
  const q = query(collection(db, HOURS_ENTRIES), where('userId', '==', userId), where('period', '==', period));
  return onSnapshot(q, (snap) => {
    const list: HoursEntryDoc[] = [];
    snap.forEach((d) => {
      const data = d.data() as HoursEntry;
      const normStatus = ('' + (data as any).reviewStatus).toLowerCase();
      list.push({ ...(data as any), reviewStatus: normStatus, id: data.id, _docId: d.id } as any);
    });
    list.sort((a, b) => (a.day === b.day ? a.project.localeCompare(b.project) : a.day.localeCompare(b.day)));
    cb(list);
  });
}

export async function createDispute(docId: string, note: string) {
  const ref = doc(db, HOURS_ENTRIES, docId);
  await updateDoc(ref, {
    hasDispute: true,
    disputeMessage: note,
    disputeNote: note,
    disputeSubmittedAt: serverTimestamp(),
  } as DocumentData);
}
