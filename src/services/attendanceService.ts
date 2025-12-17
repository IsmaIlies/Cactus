import { db } from "../firebase";
import { Timestamp, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

export type AttendanceEntry = {
  name: string;
  am: boolean;
  pm: boolean;
  updatedAt?: Timestamp;
  updatedBy?: string;
  agentId?: string;
};

export type AttendanceDoc = {
  region: "FR";
  date: string; // YYYY-MM-DD
  entries: Record<string, AttendanceEntry>; // key = agentId
};

const docId = (date: string) => `FR_${date}`;

export const getAttendance = async (date: string): Promise<AttendanceDoc | null> => {
  const ref = doc(db, "attendance", docId(date));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    region: "FR",
    date: data.date || date,
    entries: data.entries || {},
  };
};

// Get attendance docs between two dates (inclusive). Dates are YYYY-MM-DD.
export const getAttendancesInRange = async (startDate: string, endDate: string): Promise<AttendanceDoc[]> => {
  const toDate = (s: string) => {
    const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const pad = (n: number) => n.toString().padStart(2, '0');
  const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let start = toDate(startDate);
  let end = toDate(endDate);
  // Ensure start <= end
  if (start > end) {
    const tmp = new Date(start.getTime());
    start = end;
    end = tmp;
  }

  const days: string[] = [];
  const cur = new Date(start.getTime());
  while (cur <= end) {
    days.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const results = await Promise.all(days.map(async (d) => (await getAttendance(d)) || { region: 'FR', date: d, entries: {} }));
  return results;
};

export const subscribeAttendance = (
  date: string,
  cb: (doc: AttendanceDoc | null) => void
) => {
  const ref = doc(db, "attendance", docId(date));
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb(null);
    } else {
      const data = snap.data() as any;
      const rawEntries = (data.entries || {}) as Record<string, any>;
      const normalized: Record<string, AttendanceEntry> = {};
      Object.keys(rawEntries).forEach((k) => {
        const e = rawEntries[k] || {};
        normalized[k] = {
          name: typeof e.name === "string" ? e.name : "",
          am: !!e.am,
          pm: !!e.pm,
          updatedAt: e.updatedAt,
          updatedBy: e.updatedBy,
          agentId: e.agentId || k,
        };
      });
      cb({ region: "FR", date: data.date || date, entries: normalized });
    }
  });
};

export const ensureAttendanceDoc = async (date: string) => {
  const ref = doc(db, "attendance", docId(date));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { region: "FR", date, entries: {} }, { merge: true });
  }
};

export const setPresence = async (
  date: string,
  agentId: string,
  name: string,
  part: "am" | "pm",
  isPresent: boolean,
  updatedBy?: string
) => {
  const ref = doc(db, "attendance", docId(date));
  await setDoc(ref, { region: "FR", date }, { merge: true });
  const path = `entries.${agentId}`;
  const baseEntry: any = {
    // Only set name if non-empty to avoid overwriting existing stored name
    ...(name && name.trim().length > 0 ? { name } : {}),
    am: false,
    pm: false,
    updatedAt: Timestamp.fromDate(new Date()),
    agentId,
  };
  // Only include updatedBy if defined (Firestore rejects undefined)
  if (updatedBy) baseEntry.updatedBy = updatedBy;
  const partial: any = { [path]: baseEntry };
  await setDoc(ref, partial, { merge: true });
  const fieldPath = `entries.${agentId}.${part}` as any;
  const updates: any = {
    [fieldPath]: isPresent,
    [`entries.${agentId}.updatedAt`]: Timestamp.fromDate(new Date()),
  };
  if (updatedBy) updates[`entries.${agentId}.updatedBy`] = updatedBy;
  await updateDoc(ref, updates);
};

// Patch helper: update missing names from roster
export const patchEntryName = async (date: string, agentId: string, name: string) => {
  if (!name || !name.trim()) return;
  const ref = doc(db, "attendance", docId(date));
  await setDoc(ref, { [`entries.${agentId}.name`]: name }, { merge: true });
};

// Simple roster storage in settings/canal_fr_roster (array of {id,name,active})
export type RosterItem = { id: string; name: string; active?: boolean };
export const rosterDocRef = () => doc(db, "settings", "canal_fr_roster");

export const getRoster = async (): Promise<RosterItem[]> => {
  const snap = await getDoc(rosterDocRef());
  if (!snap.exists()) return [];
  const data = snap.data() as any;
  return (data.agents || []) as RosterItem[];
};

export const addToRoster = async (item: RosterItem) => {
  const current = await getRoster();
  const exists = current.some((a) => a.id === item.id);
  const next = exists ? current : [...current, item];
  await setDoc(rosterDocRef(), { agents: next }, { merge: true });
};

// Remove one or multiple agents from roster by id
export const removeFromRoster = async (ids: string[] | string) => {
  const targets = Array.isArray(ids) ? ids : [ids];
  if (targets.length === 0) return;
  const current = await getRoster();
  const next = current.filter((a) => !targets.includes(a.id));
  await setDoc(rosterDocRef(), { agents: next }, { merge: true });
};
