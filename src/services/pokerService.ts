/**
 * Poker Duel (Prototype) – single heads-up table with spectators.
 * NOTE: Prototype: all validation client-side; move to Cloud Functions for production.
 */
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, runTransaction } from 'firebase/firestore';
import { evaluateHoldem, compareEval } from '../utils/pokerEvaluator';

export type PokerPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';

export interface PokerPlayerState {
  uid: string;
  displayName: string;
  stack: number;          // remaining chips
  committed: number;      // chips committed this street
  hole?: string[];        // two cards (only visible to self until showdown)
  folded?: boolean;
  allIn?: boolean;
  spectator?: boolean;    // true if not actually seated
}

export interface PokerDuelDoc {
  phase: PokerPhase;
  players: PokerPlayerState[]; // length 0..2 (spectators not here)
  pot: number;
  community: string[];   // revealed cards
  actingUid?: string;    // whose turn
  handIndex: number;
  deckCommit?: { hash: string };
  deckReveal?: { seed: string; deck: string[] };
  currentBet: number;    // highest commitment this street
  minBet: number;        // simple fixed min bet
  createdAt: any;
  updatedAt: any;
}

const DUEL_DOC_REF = doc(db, 'pokerDuel', 'main');

// --- Card + deck helpers --------------------------------------------------
const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const suits = ['s','h','d','c']; // spade, heart, diamond, club
export function makeDeck(): string[] { const d: string[] = []; for (const r of ranks) for (const s of suits) d.push(r+s); return d; }
export function shuffle(deck: string[], seed: number): string[] {
  // Simple deterministic LCG + Fisher-Yates (prototype – replace with crypto + commit reveal)
  const lcg = () => { seed = (seed * 48271) % 0x7fffffff; return seed / 0x7fffffff; };
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(lcg() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Legacy evaluate7 removed; using full evaluator evaluateHoldem

export function listenPokerDuel(cb: (doc: PokerDuelDoc | null) => void) {
  return onSnapshot(DUEL_DOC_REF, snap => {
    if (!snap.exists()) { cb(null); return; }
    cb(snap.data() as PokerDuelDoc);
  });
}

export async function ensureDuelDoc() {
  const snap = await getDoc(DUEL_DOC_REF);
  if (!snap.exists()) {
    const base: PokerDuelDoc = {
      phase: 'waiting', players: [], pot: 0, community: [], handIndex: 0,
      currentBet: 0, minBet: 50, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    } as any;
    await setDoc(DUEL_DOC_REF, base);
  }
}

export async function joinDuel(stake: number) {
  const user = auth.currentUser; if (!user) throw new Error('Not auth');
  await ensureDuelDoc();
  await runTransaction(db, async trx => {
    const snap = await trx.get(DUEL_DOC_REF);
    if (!snap.exists()) throw new Error('Missing duel');
    const data = snap.data() as PokerDuelDoc;
    if (data.players.find(p => p.uid === user.uid)) return; // already seated
    if (data.players.length >= 2) throw new Error('Table pleine');
    if (data.phase !== 'waiting' && data.phase !== 'finished') throw new Error('Main en cours');
    const player: PokerPlayerState = {
      uid: user.uid,
      displayName: user.displayName || user.email || user.uid.slice(0,6),
      stack: stake,
      committed: 0
    };
    const players = [...data.players, player];
    trx.update(DUEL_DOC_REF, { players, updatedAt: serverTimestamp() });
  });
}

export async function leaveDuel() {
  const user = auth.currentUser; if (!user) return;
  await runTransaction(db, async trx => {
    const snap = await trx.get(DUEL_DOC_REF);
    if (!snap.exists()) return;
    const data = snap.data() as PokerDuelDoc;
    if (data.phase !== 'waiting' && data.phase !== 'finished') throw new Error('Impossible pendant une main');
    const players = data.players.filter(p => p.uid !== user.uid);
    trx.update(DUEL_DOC_REF, { players, updatedAt: serverTimestamp() });
  });
}

export async function startHand() {
  const user = auth.currentUser; if (!user) throw new Error('Not auth');
  await runTransaction(db, async trx => {
    const snap = await trx.get(DUEL_DOC_REF);
    if (!snap.exists()) throw new Error('Missing');
    const d = snap.data() as PokerDuelDoc;
    if (d.players.length !== 2) throw new Error('Besoin de 2 joueurs');
    if (d.phase !== 'waiting' && d.phase !== 'finished') throw new Error('Déjà en cours');
    // setup deck
    const seed = Math.floor(Math.random()*1e9);
    const deck = shuffle(makeDeck(), seed);
    const pA = { ...d.players[0], committed:0, folded:false, allIn:false, hole:[deck[0], deck[2]] };
    const pB = { ...d.players[1], committed:0, folded:false, allIn:false, hole:[deck[1], deck[3]] };
  // remaining cards after hole: deck.slice(4)
    const actingUid = Math.random()<0.5 ? pA.uid : pB.uid;
    trx.update(DUEL_DOC_REF, {
      phase: 'preflop', players:[pA,pB], pot:0, community:[], actingUid,
      handIndex: d.handIndex+1, currentBet:0, deckCommit:{ hash: 'seed:'+seed }, // placeholder commit
      deckReveal: { seed: seed.toString(), deck }, updatedAt: serverTimestamp()
    });
  });
}

function advanceStreet(mut: PokerDuelDoc, deck: string[]) {
  if (mut.phase === 'preflop') {
    mut.phase = 'flop'; mut.community = deck.slice(0,3);
  } else if (mut.phase === 'flop') { mut.phase='turn'; mut.community=[...mut.community, deck[3]]; }
  else if (mut.phase === 'turn') { mut.phase='river'; mut.community=[...mut.community, deck[4]]; }
  else if (mut.phase === 'river') { mut.phase='showdown'; }
  mut.currentBet = 0; mut.players = mut.players.map(p=> ({...p, committed:0}));
}

// nextActor helper omitted in prototype (turn alternation simplified)

export async function playerAction(action: 'fold'|'check'|'call'|'bet', amount?: number) {
  const user = auth.currentUser; if (!user) throw new Error('Not auth');
  await runTransaction(db, async trx => {
    const snap = await trx.get(DUEL_DOC_REF);
    if (!snap.exists()) throw new Error('Missing');
    const d = snap.data() as PokerDuelDoc;
    if (d.actingUid !== user.uid) throw new Error('Pas ton tour');
    if (!['preflop','flop','turn','river'].includes(d.phase)) throw new Error('Phase inactive');
    const deck = d.deckReveal?.deck || [];
    const me = d.players.find(p=>p.uid===user.uid)!;
    const opp = d.players.find(p=>p.uid!==user.uid)!;
    if (action==='fold') {
      me.folded = true; d.phase='finished'; me.hole = me.hole; opp.hole = opp.hole; me.stack += 0; opp.stack += d.pot + me.committed + opp.committed; d.pot=0;
      d.actingUid = undefined;
    } else if (action==='bet') {
      const bet = amount ?? d.minBet;
      if (bet > me.stack) throw new Error('Stack insuffisant');
      me.stack -= bet; me.committed += bet; d.pot += bet; d.currentBet = me.committed; d.actingUid = opp.uid;
    } else if (action==='call') {
      const need = d.currentBet - me.committed; if (need<0) return; const pay = Math.min(need, me.stack); me.stack -= pay; me.committed += pay; d.pot += pay;
      // round settled?
      if (me.committed === d.currentBet && opp.committed === d.currentBet) {
        advanceStreet(d, deck.slice(6));
        d.actingUid = opp.uid; // simple rotate
        if (d.phase === 'showdown') {
          // evaluate showdown
          const evalMe = evaluateHoldem([...(me.hole||[]), ...d.community]);
          const evalOpp = evaluateHoldem([...(opp.hole||[]), ...d.community]);
          const cmp = compareEval(evalMe, evalOpp);
          if (cmp > 0) { me.stack += d.pot; }
          else if (cmp < 0) { opp.stack += d.pot; }
          else { // split
            me.stack += Math.floor(d.pot/2); opp.stack += d.pot - Math.floor(d.pot/2);
          }
          d.pot = 0; d.phase='finished'; d.actingUid=undefined;
        }
      } else {
        d.actingUid = opp.uid;
      }
    } else if (action==='check') {
      if (d.currentBet !== me.committed) throw new Error('Impossible (miser avant)');
      // both checked? (if opponent also matched and just checked earlier -> we advanced when he acted)
      // we treat check like call with zero when both equal
      if (opp.committed === d.currentBet) {
        advanceStreet(d, deck.slice(6));
        d.actingUid = opp.uid;
        if (d.phase === 'showdown') {
          const evalMe = evaluateHoldem([...(me.hole||[]), ...d.community]);
          const evalOpp = evaluateHoldem([...(opp.hole||[]), ...d.community]);
          const cmp = compareEval(evalMe, evalOpp);
          if (cmp > 0) { me.stack += d.pot; }
          else if (cmp < 0) { opp.stack += d.pot; }
          else { me.stack += Math.floor(d.pot/2); opp.stack += d.pot - Math.floor(d.pot/2); }
          d.pot=0; d.phase='finished'; d.actingUid=undefined;
        }
      } else {
        d.actingUid = opp.uid;
      }
    }
    d.updatedAt = serverTimestamp();
    trx.update(DUEL_DOC_REF, d as any);
  });
}
