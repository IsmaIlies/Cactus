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
      cb({ region: "FR", date: data.date || date, entries: data.entries || {} });
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
  const partial: any = {};
  partial[path] = {
    name,
    am: false,
    pm: false,
    updatedAt: Timestamp.fromDate(new Date()),
    updatedBy,
    agentId,
  };
  await setDoc(ref, partial, { merge: true });
  const fieldPath = `entries.${agentId}.${part}` as any;
  await updateDoc(ref, { [fieldPath]: isPresent, [`entries.${agentId}.updatedAt`]: Timestamp.fromDate(new Date()), [`entries.${agentId}.updatedBy`]: updatedBy });
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
