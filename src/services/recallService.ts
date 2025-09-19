import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, orderBy, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export type RecallReason = 'no-answer' | 'partial' | 'follow-up';
export type RecallStatus = 'pending' | 'done' | 'skipped';

export interface Recall {
  id: string;
  userId: string;
  saleId?: string;
  phone: string;
  clientFirstName?: string;
  clientLastName?: string;
  reason: RecallReason;
  status: RecallStatus;
  scheduledFor: any; // Firestore Timestamp
  createdAt: any; // Firestore Timestamp
  notes?: string;
}

interface CreateRecallInput {
  userId: string;
  saleId?: string;
  phone: string;
  clientFirstName?: string;
  clientLastName?: string;
  reason: RecallReason;
  scheduledFor: Date;
  notes?: string;
}

const COLLECTION = 'recalls';

export async function addRecall(input: CreateRecallInput): Promise<string> {
  const payload = {
    userId: input.userId,
    saleId: input.saleId || null,
    phone: input.phone,
    clientFirstName: input.clientFirstName || '',
    clientLastName: input.clientLastName || '',
    reason: input.reason,
    status: 'pending' as RecallStatus,
    scheduledFor: Timestamp.fromDate(input.scheduledFor),
    createdAt: Timestamp.fromDate(new Date()),
    notes: input.notes || ''
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

export async function markRecallStatus(id: string, status: RecallStatus) {
  await updateDoc(doc(db, COLLECTION, id), { status });
}

export async function postponeRecall(id: string, minutes: number) {
  const q = query(collection(db, COLLECTION), where('__name__','==', id));
  const snap = await getDocs(q);
  const d = snap.docs[0];
  if (!d) return;
  const data: any = d.data();
  let sched: Date;
  if (data.scheduledFor?.toDate) sched = data.scheduledFor.toDate(); else sched = new Date();
  sched = new Date(sched.getTime() + minutes*60000);
  await updateDoc(doc(db, COLLECTION, id), { scheduledFor: Timestamp.fromDate(sched) });
}

export function listenUserRecalls(userId: string, cb: (recalls: Recall[]) => void) {
  const qRef = query(collection(db, COLLECTION), where('userId','==', userId), where('status','==','pending'), orderBy('scheduledFor','asc'));
  return onSnapshot(qRef, snap => {
    const list: Recall[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    cb(list);
  });
}
