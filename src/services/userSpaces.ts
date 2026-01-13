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

// --- Intégration Azure AD groupes → rôle/espaces ---
export interface AdGroup {
  id?: string;
  displayName?: string;
}

// Map configurable pour correspondances par ID
// Renseignez VITE_AZURE_GROUP_MO_SUP_CANAL_ID dans .env pour le groupe « [MO] Sup Canal »
const GROUP_ID_MAP: Record<string, { role: string; spaces: AppSpace[] }> = (() => {
  const moSupCanal = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_SUP_CANAL_ID as string | undefined;
  const moAgentCanal = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_AGENT_CANAL_ID as string | undefined;
  const moAgentLeads = (import.meta as any)?.env?.VITE_AZURE_GROUP_MO_AGENT_LEADS_ID as string | undefined;
  const map: Record<string, { role: string; spaces: AppSpace[] }> = {};
  // Env override
  if (moSupCanal) {
    map[String(moSupCanal).toLowerCase()] = { role: 'SUPERVISEUR CANAL+ FR', spaces: ['CANAL_FR'] };
  }
  if (moAgentCanal) {
    map[String(moAgentCanal).toLowerCase()] = { role: 'AGENT CANAL+ FR', spaces: ['CANAL_FR'] };
  }
  if (moAgentLeads) {
    map[String(moAgentLeads).toLowerCase()] = { role: 'AGENT LEADS', spaces: ['LEADS'] };
  }
  // Mappage codé en dur demandé : c38dce07-743e-40c6-aab9-f46dc0ea9adb → Superviseur Canal+ FR
  map['c38dce07-743e-40c6-aab9-f46dc0ea9adb'] = { role: 'SUPERVISEUR CANAL+ FR', spaces: ['CANAL_FR'] };
  // Nouveau mappage : « [MO] Sup LEADS » (GUID fourni) → Superviseur LEADS
  map['54ef3c7c-1ec1-4c1c-aece-7db95d00737d'] = { role: 'SUPERVISEUR LEADS', spaces: ['LEADS'] };
  // Mappage agents LEADS (GUID fourni) → Agent LEADS
  map['2fc9a8c8-f140-49fc-9ca8-8501b1b954d6'] = { role: 'AGENT LEADS', spaces: ['LEADS'] };
  return map;
})();

// Map par nom d'affichage du groupe (exact ou contenant)
const GROUP_NAME_MAP: Array<{ match: (name: string) => boolean; role: string; spaces: AppSpace[] }> = [
  {
    // Groupe demandé: « [MO] Sup Canal »
    match: (n: string) => n === '[MO] Sup Canal' || (n.includes('SUP') && n.includes('CANAL') && n.includes('MO')),
    role: 'SUPERVISEUR CANAL+ FR',
    spaces: ['CANAL_FR'],
  },
  {
    // Groupe demandé: « [MO] Sup LEADS »
    match: (n: string) => n === '[MO] Sup LEADS' || (n.includes('SUP') && n.toUpperCase().includes('LEADS') && n.includes('MO')),
    role: 'SUPERVISEUR LEADS',
    spaces: ['LEADS'],
  },
  {
    // Groupe demandé: « [MO] Agent Canal » (agents côté FR)
    match: (n: string) => n === '[MO] Agent Canal' || (n.toUpperCase().includes('AGENT') && n.toUpperCase().includes('CANAL') && n.includes('MO')),
    role: 'AGENT CANAL+ FR',
    spaces: ['CANAL_FR'],
  },
  {
    // Groupe demandé: « [MO] Agent LEADS » (agents côté LEADS)
    match: (n: string) => n === '[MO] Agent LEADS' || (n.toUpperCase().includes('AGENT') && n.toUpperCase().includes('LEADS') && n.includes('MO')),
    role: 'AGENT LEADS',
    spaces: ['LEADS'],
  },
];

export function roleFromAzureGroups(groups: (AdGroup | string)[]): string | undefined {
  const norm = (v: any) => String(v || '').trim();
  const hits = new Set<string>();
  for (const g of groups) {
    const id = typeof g === 'string' ? norm(g) : norm((g as AdGroup)?.id);
    const name = typeof g === 'string' ? '' : norm((g as AdGroup)?.displayName);
    // Par ID (configurable via env + mappages codés)
    if (id) {
      const hit = GROUP_ID_MAP[id.toLowerCase()];
      if (hit) hits.add(hit.role);
    }
    // Par nom (règles explicites)
    const n = name.toUpperCase();
    for (const rule of GROUP_NAME_MAP) {
      if (name && rule.match(name)) hits.add(rule.role);
    }
    // Heuristiques génériques (précisées pour éviter les faux positifs)
    // Superviseur LEADS uniquement si le nom contient explicitement SUP + LEADS
    if (n.includes('SUP') && n.includes('LEADS')) hits.add('SUPERVISEUR LEADS');
    // Superviseur CANAL CIV si SUP + CIV (ou variantes pays)
    if (n.includes('SUP') && (n.includes('CIV') || n.includes('CÔTE D’IVOIRE') || n.includes("COTE D'IVOIRE"))) {
      hits.add('SUPERVISEUR CANAL+ CIV');
    }
    // Superviseur CANAL FR si SUP + CANAL sans CIV
    if (n.includes('SUP') && n.includes('CANAL') && !n.includes('CIV')) hits.add('SUPERVISEUR CANAL+ FR');
    // Agents génériques (si pas déjà couverts par GROUP_NAME_MAP)
    if (n.includes('AGENT') && n.includes('LEADS')) hits.add('AGENT LEADS');
    if (n.includes('AGENT') && n.includes('CANAL') && !n.includes('CIV')) hits.add('AGENT CANAL+ FR');
  }
  // Priorité: LEADS > CANAL CIV > CANAL FR
  if (hits.has('SUPERVISEUR LEADS')) return 'SUPERVISEUR LEADS';
  if (hits.has('SUPERVISEUR CANAL+ CIV')) return 'SUPERVISEUR CANAL+ CIV';
  if (hits.has('SUPERVISEUR CANAL+ FR')) return 'SUPERVISEUR CANAL+ FR';
  // Agents: retourner un rôle agent si détecté
  if (hits.has('AGENT CANAL+ FR')) return 'AGENT CANAL+ FR';
  if (hits.has('AGENT LEADS')) return 'AGENT LEADS';
  return undefined;
}

export function spacesFromAzureGroups(groups: (AdGroup | string)[]): AppSpace[] {
  const out = new Set<AppSpace>();
  const role = roleFromAzureGroups(groups);
  for (const s of getSpacesFromRole(role)) out.add(s);
  return Array.from(out);
}
