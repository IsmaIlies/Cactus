import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type AppSpace = 'CANAL_FR' | 'CANAL_CIV' | 'LEADS';

export interface UserSpacesDoc {
  spaces?: AppSpace[];
  defaultSpace?: AppSpace;
}

const ALL_SPACES: AppSpace[] = ['CANAL_FR', 'CANAL_CIV', 'LEADS'];

function sanitizeSpaces(arr: any): AppSpace[] {
  if (!Array.isArray(arr)) return [];
  const set = new Set(ALL_SPACES);
  return arr.filter((s) => typeof s === 'string' && set.has(s as AppSpace)) as AppSpace[];
}

export async function fetchUserSpacesByKey(key: string): Promise<UserSpacesDoc | null> {
  const ref = doc(db, 'userSpaces', key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return {
    spaces: sanitizeSpaces(data?.spaces),
    defaultSpace: ALL_SPACES.includes(data?.defaultSpace) ? (data.defaultSpace as AppSpace) : undefined,
  };
}

export async function fetchUserSpaces(emailOrLocal: string): Promise<{ spaces: AppSpace[]; defaultSpace?: AppSpace }> {
  const emailLc = (emailOrLocal || '').toLowerCase().trim();
  const candidates: string[] = [];
  if (emailLc) {
    candidates.push(emailLc);
    if (emailLc.includes('@')) {
      const local = emailLc.split('@')[0];
      candidates.push(local);
    }
  }
  for (const key of candidates) {
    try {
      const doc = await fetchUserSpacesByKey(key);
      if (doc && doc.spaces && doc.spaces.length) {
        return { spaces: doc.spaces, defaultSpace: doc.defaultSpace };
      }
    } catch {}
  }
  return { spaces: [], defaultSpace: undefined };
}

export function spaceToRoute(space: AppSpace, supervisor?: boolean): string {
  if (supervisor) {
    switch (space) {
      case 'CANAL_FR':
        return '/dashboard/superviseur/fr';
      case 'CANAL_CIV':
        return '/dashboard/superviseur/civ';
      case 'LEADS':
        // Variante superviseur Leads : utilise la nouvelle vue « dashboard2 »
        return '/dashboard/superviseur/leads/dashboard2';
    }
  }
  switch (space) {
    case 'CANAL_FR':
      return '/dashboard/fr';
    case 'CANAL_CIV':
      return '/dashboard/civ';
    case 'LEADS':
      return '/leads/dashboard';
  }
}

// Assistant de mapping rôle → espaces
export function getSpacesFromRole(role?: string | null): AppSpace[] {
  const r = (role || '').trim().toUpperCase();
  switch (r) {
    // Superviseurs
    case 'SUPERVISEUR C+ FR':
    case 'SUPERVISEUR CANAL+ FR':
    case 'SUPERVISEUR FR':
      return ['CANAL_FR'];
    case 'SUPERVISEUR C+ CIV':
    case 'SUPERVISEUR CANAL+ CIV':
    case 'SUPERVISEUR CIV':
      return ['CANAL_CIV'];
    case 'SUPERVISEUR LEADS FR':
    case 'SUPERVISEUR LEADS':
      return ['LEADS'];
    // Rôles Agents d'Équipe (TA)
    case 'TA C+ FR':
    case 'TA CANAL+ FR':
      return ['CANAL_FR'];
    case 'TA C+ CIV':
    case 'TA CANAL+ CIV':
      return ['CANAL_CIV'];
    case 'TA LEADS FR':
    case 'TA LEADS':
      return ['LEADS'];
    case 'DIRECTION':
    case 'ADMINISTRATEUR':
    case 'ADMIN':
      return ['CANAL_FR', 'CANAL_CIV', 'LEADS'];
    default:
      // Heuristiques génériques pour les nouveaux rôles non listés
      if (r.includes('LEADS')) return ['LEADS'];
      if (r.includes('CIV')) return ['CANAL_CIV'];
      if (r.includes('FR')) return ['CANAL_FR'];
      return [];
  }
}
