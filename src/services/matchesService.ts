// src/services/matchesService.ts
// Service Firestore pour récupérer les prochains matchs (rugby / autres)
import { collection, getDocs, query, where, orderBy, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { SportsMatch, SportsMatchFirestore } from '../types/Match';

const COLLECTION = 'matches';

// Conversion helper
const toSportsMatch = (id: string, data: DocumentData): SportsMatch => {
  const d = data as SportsMatchFirestore;
  return {
    id,
    sport: d.sport,
    competition: d.competition,
    round: d.round,
    startTime: d.startTime instanceof Timestamp ? d.startTime.toDate() : new Date(d.startTime),
    homeTeam: d.homeTeam,
    awayTeam: d.awayTeam,
    channel: d.channel,
    status: d.status,
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : undefined,
    updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : undefined,
  };
};

export interface FetchUpcomingOptions {
  sport?: string;        // Filtrer un sport (ex 'rugby')
  limitDays?: number;    // Fenêtre glissante en jours (défaut: 14)
  fromDate?: Date;       // Point de départ (défaut: maintenant)
}

export const fetchUpcomingMatches = async (options: FetchUpcomingOptions = {}): Promise<SportsMatch[]> => {
  const { sport, limitDays = 21, fromDate = new Date() } = options;
  const start = new Date(fromDate);
  const end = new Date(start);
  end.setDate(end.getDate() + limitDays);

  const colRef = collection(db, COLLECTION);
  const constraints = [
    where('startTime', '>=', start),
    where('startTime', '<', end),
    orderBy('startTime', 'asc'),
  ];
  if (sport) {
    // Firestore limitation : field must be included in index if compound; prévoir index si nécessaire
    constraints.unshift(where('sport', '==', sport));
  }
  const q = query(colRef, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(doc => toSportsMatch(doc.id, doc.data()));
};

// Filtre / groupement utilitaires
export interface GroupedMatchesWeek {
  weekKey: string; // ex: '2025-W37'
  weekStart: Date; // Lundi
  matches: SportsMatch[];
}

const getISOWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNum };
};

export const groupMatchesByISOWeek = (matches: SportsMatch[]): GroupedMatchesWeek[] => {
  const groups: Record<string, GroupedMatchesWeek> = {};
  matches.forEach(m => {
    const { year, week } = getISOWeek(m.startTime);
    const key = `${year}-W${week.toString().padStart(2, '0')}`;
    if (!groups[key]) {
      // Calcul lundi de la semaine
      const tmp = new Date(m.startTime);
      const day = (tmp.getDay() + 6) % 7; // 0=Mon ... 6=Sun
      tmp.setDate(tmp.getDate() - day);
      tmp.setHours(0,0,0,0);
      groups[key] = { weekKey: key, weekStart: tmp, matches: [] };
    }
    groups[key].matches.push(m);
  });
  return Object.values(groups).sort((a,b) => a.weekStart.getTime() - b.weekStart.getTime());
};
