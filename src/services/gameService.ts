import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, addDoc, Timestamp, onSnapshot, query, where, orderBy, runTransaction, limit, getDocs, writeBatch } from 'firebase/firestore';

export interface GameCredits {
  userId: string;
  credits: number;
  startingCredits: number;
  updatedAt: any; // Timestamp
}

export interface CasinoBet {
  id: string;
  bettorUserId: string;
  targetUserId: string;
  condition: 'no_more_sales_today' | 'reach_additional_sales';
  stake: number;
  status: 'open' | 'won' | 'lost';
  createdAt: any; // Timestamp
  resolvedAt?: any; // Timestamp
  targetSalesBaseline: number; // sales count at bet creation
  payoutApplied?: boolean;
  // new variant fields (optional for legacy bets)
  goalIncrement?: number; // number of additional sales to reach
  deadlineAt?: any; // Timestamp when bet auto-resolves if not achieved
  payoutMultiplier?: number; // dynamic multiplier for win
}

export interface BetHistoryEvent {
  id: string;
  betId: string;
  type: 'created' | 'resolved';
  result?: 'won' | 'lost';
  bettorUserId: string;
  targetUserId: string;
  stake: number;
  targetSalesBaseline: number;
  ts: any; // Timestamp
}

const CREDITS_COLLECTION = 'gameCredits';
const BETS_COLLECTION = 'betsCasino';
const BET_HISTORY_COLLECTION = 'betHistory';

const STARTING_CREDITS = 100;

export async function ensureUserCredits(userId: string): Promise<GameCredits> {
  const ref = doc(db, CREDITS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const payload: GameCredits = {
      userId,
      credits: STARTING_CREDITS,
      startingCredits: STARTING_CREDITS,
      updatedAt: Timestamp.fromDate(new Date())
    };
    await setDoc(ref, payload);
    return payload;
  }
  const data = snap.data() as GameCredits;
  return data;
}

export async function getUserCredits(userId: string): Promise<number> {
  const ref = doc(db, CREDITS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return (await ensureUserCredits(userId)).credits;
  return (snap.data() as GameCredits).credits;
}

export async function adjustCredits(userId: string, delta: number) {
  const ref = doc(db, CREDITS_COLLECTION, userId);
  return runTransaction(db, async (trx) => {
    const snap = await trx.get(ref);
    if (!snap.exists()) {
      // initialize then refetch inside same transaction
      trx.set(ref, {
        userId,
        credits: STARTING_CREDITS,
        startingCredits: STARTING_CREDITS,
        updatedAt: Timestamp.fromDate(new Date())
      });
      if (delta === 0) return STARTING_CREDITS;
      const after = Math.max(0, STARTING_CREDITS + delta);
      trx.update(ref, { credits: after, updatedAt: Timestamp.fromDate(new Date()) });
      return after;
    }
    const data = snap.data() as GameCredits;
    const newCredits = Math.max(0, data.credits + delta);
    trx.update(ref, { credits: newCredits, updatedAt: Timestamp.fromDate(new Date()) });
    return newCredits;
  });
}

interface PlaceBetInput {
  bettorUserId: string;
  targetUserId: string;
  stake: number;
  targetSalesBaseline: number;
  variant: 'reach_additional_sales';
  goalIncrement: number; // additional sales predicted
  timeframeMinutes: number | 'day';
}

export async function placeBet(input: PlaceBetInput) {
  if (input.stake <= 0) throw new Error('Mise invalide');
  if (input.goalIncrement <= 0) throw new Error('Objectif invalide');
  const betRef = doc(collection(db, BETS_COLLECTION));
  const now = new Date();
  // compute deadline
  let deadline: Date;
  if (input.timeframeMinutes === 'day') {
    deadline = new Date();
    deadline.setHours(23,59,59,999);
  } else {
    deadline = new Date(now.getTime() + input.timeframeMinutes * 60000);
  }
  // compute payout multiplier simple heuristic
  const base = 1.6;
  const goalBonus = input.goalIncrement * 0.9; // more ambitious => more payout
  const timeBonus = (input.timeframeMinutes === 'day') ? 0.2 : (input.timeframeMinutes <= 30 ? 0.9 : input.timeframeMinutes <= 60 ? 0.6 : 0.4);
  const multiplier = Number((base + goalBonus + timeBonus).toFixed(2));
  await runTransaction(db, async (trx) => {
    const creditsRef = doc(db, CREDITS_COLLECTION, input.bettorUserId);
    const creditsSnap = await trx.get(creditsRef);
    if (!creditsSnap.exists()) throw new Error('Crédits introuvables');
    const creditsData = creditsSnap.data() as GameCredits;
    if (creditsData.credits < input.stake) throw new Error('Crédits insuffisants');
    trx.update(creditsRef, { credits: creditsData.credits - input.stake, updatedAt: Timestamp.fromDate(new Date()) });
    trx.set(betRef, {
      bettorUserId: input.bettorUserId,
      targetUserId: input.targetUserId,
      condition: 'reach_additional_sales',
      stake: input.stake,
      status: 'open',
      createdAt: Timestamp.fromDate(now),
      targetSalesBaseline: input.targetSalesBaseline,
      payoutApplied: false,
      goalIncrement: input.goalIncrement,
      deadlineAt: Timestamp.fromDate(deadline),
      payoutMultiplier: multiplier
    });
  });
  await addDoc(collection(db, BET_HISTORY_COLLECTION), {
    betId: betRef.id,
    type: 'created',
    bettorUserId: input.bettorUserId,
    targetUserId: input.targetUserId,
    stake: input.stake,
    targetSalesBaseline: input.targetSalesBaseline,
    goalIncrement: input.goalIncrement,
    deadlineAt: Timestamp.fromDate(deadline),
    payoutMultiplier: multiplier,
    ts: Timestamp.fromDate(new Date())
  });
  return { multiplier };
}

export function listenOpenBets(cb: (bets: CasinoBet[]) => void) {
  const qRef = query(collection(db, BETS_COLLECTION), where('status','==','open'), orderBy('createdAt','asc'));
  return onSnapshot(qRef, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as CasinoBet[]);
  });
}

export function listenUserBets(userId: string, cb: (bets: CasinoBet[]) => void) {
  const qRef = query(collection(db, BETS_COLLECTION), where('bettorUserId','==', userId), orderBy('createdAt','desc'));
  return onSnapshot(qRef, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as CasinoBet[]);
  });
}

export async function resolveBet(bet: CasinoBet, result: 'won' | 'lost') {
  if (bet.status !== 'open') return;
  const ref = doc(db, BETS_COLLECTION, bet.id);
  await runTransaction(db, async (trx) => {
    const betSnap = await trx.get(ref);
    if (!betSnap.exists()) return;
    const live = betSnap.data() as CasinoBet;
    if (live.status !== 'open') return; // already handled
    if (result === 'won' && !live.payoutApplied) {
      const creditsRef = doc(db, CREDITS_COLLECTION, live.bettorUserId);
      const creditsSnap = await trx.get(creditsRef);
      const mult = live.payoutMultiplier || 2; // legacy default 2x
      if (creditsSnap.exists()) {
        const cr = creditsSnap.data() as GameCredits;
        trx.update(creditsRef, { credits: cr.credits + Math.round(live.stake * mult), updatedAt: Timestamp.fromDate(new Date()) });
      }
      trx.update(ref, { status: result, resolvedAt: Timestamp.fromDate(new Date()), payoutApplied: true });
    } else {
      trx.update(ref, { status: result, resolvedAt: Timestamp.fromDate(new Date()) });
    }
  });
  await addDoc(collection(db, BET_HISTORY_COLLECTION), {
    betId: bet.id,
    type: 'resolved',
    result,
    bettorUserId: bet.bettorUserId,
    targetUserId: bet.targetUserId,
    stake: bet.stake,
    targetSalesBaseline: bet.targetSalesBaseline,
    ts: Timestamp.fromDate(new Date())
  });
}

export function listenBetHistoryForUser(userId: string, cb: (events: BetHistoryEvent[]) => void, max: number = 40) {
  const events: Record<string, BetHistoryEvent> = {};
  const pushUpdate = () => {
    const arr = Object.values(events).sort((a,b) => b.ts.toMillis() - a.ts.toMillis()).slice(0, max);
    cb(arr);
  };
  const qBettor = query(collection(db, BET_HISTORY_COLLECTION), where('bettorUserId','==', userId), orderBy('ts','desc'), limit(max));
  const qTarget = query(collection(db, BET_HISTORY_COLLECTION), where('targetUserId','==', userId), orderBy('ts','desc'), limit(max));
  const unsub1 = onSnapshot(qBettor, snap => {
    snap.docs.forEach(d => { events[d.id] = { id: d.id, ...(d.data() as any) }; });
    pushUpdate();
  });
  const unsub2 = onSnapshot(qTarget, snap => {
    snap.docs.forEach(d => { events[d.id] = { id: d.id, ...(d.data() as any) }; });
    pushUpdate();
  });
  return () => { unsub1(); unsub2(); };
}

export function listenAllUserCredits(cb: (map: Record<string, number>) => void) {
  const qRef = collection(db, CREDITS_COLLECTION);
  return onSnapshot(qRef, snap => {
    const out: Record<string, number> = {};
    snap.docs.forEach(d => { const dt = d.data() as any; out[d.id] = dt.credits; });
    cb(out);
  });
}

// Initialize credits for all users to STARTING_CREDITS if missing (optionally overwrite)
export async function ensureAllUsersCredits(overwrite: boolean = false, value: number = STARTING_CREDITS) {
  const usersSnap = await getDocs(collection(db, 'users'));
  const creditsSnap = await getDocs(collection(db, CREDITS_COLLECTION));
  const existing: Record<string, number> = {};
  creditsSnap.docs.forEach(d => { const dt: any = d.data(); existing[d.id] = dt.credits; });
  const batch = writeBatch(db);
  usersSnap.docs.forEach(userDoc => {
    const uid = userDoc.id;
    if (overwrite || existing[uid] === undefined) {
      batch.set(doc(db, CREDITS_COLLECTION, uid), {
        userId: uid,
        credits: value,
        startingCredits: value,
        updatedAt: Timestamp.fromDate(new Date())
      }, { merge: true });
    }
  });
  if (!usersSnap.empty) await batch.commit();
}

// Force reset all credits to exactly 100
export async function resetAllCreditsTo100() {
  await ensureAllUsersCredits(true, 100);
}

// Set EVERY existing gameCredits doc (and create missing for users) to exactly `value` (default 100)
export async function boostAllCredits(value: number = 100) {
  const usersSnap = await getDocs(collection(db, 'users'));
  const batch = writeBatch(db);
  const nowTs = Timestamp.fromDate(new Date());
  usersSnap.docs.forEach(u => {
    const uid = u.id;
    batch.set(doc(db, CREDITS_COLLECTION, uid), {
      userId: uid,
      credits: value,
      startingCredits: value,
      updatedAt: nowTs
    }, { merge: true });
  });
  if (!usersSnap.empty) await batch.commit();
}

// Roulette removed: service now only handles generic credits & internal bets.
