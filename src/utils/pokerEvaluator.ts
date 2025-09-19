/** Texas Hold'em hand evaluator (7 cards -> best 5) */
// Rank order (low to high)
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const;
const RANK_TO_INDEX: Record<string, number> = Object.fromEntries(RANKS.map((r,i)=>[r,i]));

export type HandCategory =
  | 'High Card'
  | 'One Pair'
  | 'Two Pair'
  | 'Three of a Kind'
  | 'Straight'
  | 'Flush'
  | 'Full House'
  | 'Four of a Kind'
  | 'Straight Flush'
  | 'Royal Flush';

interface EvalResult {
  category: HandCategory;
  rankValue: number; // comparable integer (bigger = better)
  primaryRanks: number[]; // kicker ordering indices high->low
  bestFive: string[]; // card codes
  description: string; // human readable
}

// Helper: sort descending rank indices
function sortDesc(a: number, b: number){ return b - a; }

function isStraight(indices: number[]): {high:number, used:number[]} | null {
  // Handle wheel A-2-3-4-5 (A treated as rank -1 for straight detection)
  const uniq = [...new Set(indices)].sort((a,b)=>a-b); // asc
  // add wheel mapping if contains Ace and 2
  const withWheel = uniq.includes(12) ? [...uniq, -1] : uniq; // Ace index=12 -> -1
  let run: number[] = [];
  for (let i=0;i<withWheel.length;i++) {
    if (i===0 || withWheel[i] === withWheel[i-1]+1) run.push(withWheel[i]); else run=[withWheel[i]];
    if (run.length>=5) {
      const slice = run.slice(-5);
      const highRaw = slice[slice.length-1];
      const high = highRaw === -1 ? 3 : highRaw; // wheel high is 5 (index 3 for '5')
      const used = slice.map(x=> x===-1?12:x); // convert -1 back to Ace for card selection logic
      return { high, used };
    }
  }
  return null;
}

export function evaluateHoldem(seven: string[]): EvalResult {
  if (seven.length !== 7) throw new Error('Need 7 cards');
  const ranksIdx = seven.map(c=> RANK_TO_INDEX[c[0]]);
  // suits array not needed directly; kept grouping by suit below
  // Group by rank
  const byRank: Record<number,string[]> = {};
  seven.forEach((c,i)=> { const ri = ranksIdx[i]; (byRank[ri]||(byRank[ri]=[])).push(c); });
  // Counts
  const groups = Object.entries(byRank).map(([ri,cards])=> ({ri: parseInt(ri), cards})).sort((a,b)=> b.cards.length - a.cards.length || b.ri - a.ri);
  // Flush detection
  const bySuit: Record<string,string[]> = {};
  seven.forEach(c=> { const s=c[1]; (bySuit[s]||(bySuit[s]=[])).push(c); });
  const flushSuit = Object.keys(bySuit).find(s=> bySuit[s].length>=5);
  let flushCards: string[] | null = null;
  if (flushSuit) flushCards = bySuit[flushSuit].sort((a,b)=> RANK_TO_INDEX[b[0]] - RANK_TO_INDEX[a[0]]).slice(0,7);
  // Straight detection (overall and within flush for straight flush)
  const straightAll = isStraight(ranksIdx.sort((a,b)=>a-b));
  let straightFlush: {high:number, used:number[]} | null = null;
  if (flushCards) {
    const flushIdx = flushCards.map(c=> RANK_TO_INDEX[c[0]]);
    straightFlush = isStraight(flushIdx);
  }
  // Straight Flush / Royal Flush
  if (straightFlush) {
    const usedRanks = straightFlush.used;
    const bestFive = usedRanks.map(r => flushCards!.find(c=> RANK_TO_INDEX[c[0]]===r)!).slice(0,5);
    const isRoyal = usedRanks.includes(12) && usedRanks.includes(11) && usedRanks.includes(10) && usedRanks.includes(9) && usedRanks.includes(8);
    return {
      category: isRoyal ? 'Royal Flush':'Straight Flush',
      rankValue: 900000 + straightFlush.high,
      primaryRanks: [straightFlush.high],
      bestFive,
      description: isRoyal ? 'Quinte flush royale' : `Quinte flush haute ${RANKS[straightFlush.high]}`
    };
  }
  // Four / Full House / Trips / Pairs
  const four = groups.find(g=> g.cards.length===4);
  if (four) {
    const kick = groups.filter(g=> g.ri!==four.ri).map(g=> g.ri).sort(sortDesc)[0];
    const bestFive = [...four.cards, seven.find(c=> RANK_TO_INDEX[c[0]]===kick)!];
    return { category:'Four of a Kind', rankValue:800000 + four.ri*100 + kick, primaryRanks:[four.ri,kick], bestFive, description:`Carré de ${RANKS[four.ri]}` };
  }
  const trips = groups.filter(g=> g.cards.length===3);
  const pairs = groups.filter(g=> g.cards.length===2);
  if (trips.length>=1 && (pairs.length>=1 || trips.length>=2)) {
    const topTrips = trips[0];
    const secondPart = trips.length>=2 ? trips[1].ri : pairs[0].ri;
    const bestFive = [...topTrips.cards, ...seven.filter(c=> RANK_TO_INDEX[c[0]]===secondPart).slice(0,2)];
    return { category:'Full House', rankValue:700000 + topTrips.ri*100 + secondPart, primaryRanks:[topTrips.ri, secondPart], bestFive, description:`Full ${RANKS[topTrips.ri]} par ${RANKS[secondPart]}` };
  }
  if (flushCards) {
    const bestFive = flushCards.slice(0,5);
  const rankVal = bestFive.reduce((acc,c)=> acc*15 + RANK_TO_INDEX[c[0]],0);
    return { category:'Flush', rankValue:600000 + rankVal, primaryRanks: bestFive.map(c=> RANK_TO_INDEX[c[0]]), bestFive, description:`Couleur haute ${RANKS[RANK_TO_INDEX[bestFive[0][0]]]}` };
  }
  if (straightAll) {
    const usedRanks = straightAll.used;
    // Build bestFive mapping to actual cards
    const bestFive: string[] = [];
    for (const r of usedRanks) {
      const card = seven.find(c=> RANK_TO_INDEX[c[0]]===r);
      if (card && !bestFive.includes(card)) bestFive.push(card);
      if (bestFive.length===5) break;
    }
    return { category:'Straight', rankValue:500000 + straightAll.high, primaryRanks:[straightAll.high], bestFive, description:`Quinte haute ${RANKS[straightAll.high]}` };
  }
  if (trips.length>=1) {
    const topTrips = trips[0];
    const kickers = groups.filter(g=> g.ri!==topTrips.ri).map(g=> g.ri).sort(sortDesc).slice(0,2);
    const bestFive = [...topTrips.cards, ...kickers.map(k=> seven.find(c=> RANK_TO_INDEX[c[0]]===k)! )];
    return { category:'Three of a Kind', rankValue:400000 + topTrips.ri*400 + kickers[0]*20 + (kickers[1]||0), primaryRanks:[topTrips.ri,...kickers], bestFive, description:`Brelan de ${RANKS[topTrips.ri]}` };
  }
  if (pairs.length>=2) {
    const topTwo = pairs.slice(0,2).sort((a,b)=> b.ri - a.ri);
    const kick = groups.filter(g=> !topTwo.some(t=> t.ri===g.ri)).map(g=> g.ri).sort(sortDesc)[0];
    const bestFive = [...topTwo[0].cards.slice(0,2), ...topTwo[1].cards.slice(0,2), seven.find(c=> RANK_TO_INDEX[c[0]]===kick)!];
    return { category:'Two Pair', rankValue:300000 + topTwo[0].ri*400 + topTwo[1].ri*20 + kick, primaryRanks:[topTwo[0].ri, topTwo[1].ri, kick], bestFive, description:`Deux paires ${RANKS[topTwo[0].ri]} & ${RANKS[topTwo[1].ri]}` };
  }
  if (pairs.length===1) {
    const pair = pairs[0];
    const kickers = groups.filter(g=> g.ri!==pair.ri).map(g=> g.ri).sort(sortDesc).slice(0,3);
    const bestFive = [...pair.cards.slice(0,2), ...kickers.map(k=> seven.find(c=> RANK_TO_INDEX[c[0]]===k)! )];
    return { category:'One Pair', rankValue:200000 + pair.ri*8000 + kickers[0]*400 + kickers[1]*20 + (kickers[2]||0), primaryRanks:[pair.ri,...kickers], bestFive, description:`Paire de ${RANKS[pair.ri]}` };
  }
  // High card
  const sorted = [...seven].sort((a,b)=> RANK_TO_INDEX[b[0]] - RANK_TO_INDEX[a[0]])
    .slice(0,5);
  const primary = sorted.map(c=> RANK_TO_INDEX[c[0]]);
  const rankVal = primary.reduce((acc,v)=> acc*15 + v, 0);
  return { category:'High Card', rankValue:100000 + rankVal, primaryRanks:primary, bestFive:sorted, description:`Hauteur ${RANKS[primary[0]]}` };
}

export function compareEval(a: EvalResult, b: EvalResult): number { return a.rankValue - b.rankValue; }

export type { EvalResult };
