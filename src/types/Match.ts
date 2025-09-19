// src/types/Match.ts
// Modèle TypeScript pour un évènement sportif (match)
// Permet d'unifier la lecture depuis Firestore

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'canceled';

export interface SportsMatch {
  id: string;               // ID Firestore
  sport: string;            // ex: 'rugby', 'football'
  competition?: string;     // ex: 'TOP14'
  round?: string;           // ex: 'J3'
  startTime: Date;          // Horodatage en Date locale (converti depuis Firestore Timestamp)
  homeTeam: string;         // Équipe à domicile
  awayTeam: string;         // Équipe à l'extérieur
  channel?: string;         // Chaîne(s) de diffusion
  status?: MatchStatus;     // Statut du match
  createdAt?: Date;
  updatedAt?: Date;
}

// Shape Firestore brut (facultatif si besoin de validations)
export interface SportsMatchFirestore {
  sport: string;
  competition?: string;
  round?: string;
  startTime: any; // Firestore Timestamp
  homeTeam: string;
  awayTeam: string;
  channel?: string;
  status?: MatchStatus;
  createdAt?: any;
  updatedAt?: any;
}
