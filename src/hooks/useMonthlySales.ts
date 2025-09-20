import { useEffect, useState, useCallback } from 'react';
import { Sale } from '../services/salesService';
import { collection, onSnapshot, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useRegion } from '../contexts/RegionContext';

export interface UseMonthlySalesOptions {
  /** Charger aussi les ventes validées séparément */
  includeValidated?: boolean;
  /** Forcer la région (sinon on prend le contexte) */
  regionOverride?: 'FR' | 'CIV';
  /** Rechargement forcé quand cette valeur change (ex: après mutation) */
  refreshKey?: any;
}

interface MonthlySalesState {
  loading: boolean;
  error: Error | null;
  sales: Sale[];
  validatedSales: Sale[] | null;
  refresh: () => Promise<void>;
  region: 'FR' | 'CIV';
}

/**
 * Hook centralisant le chargement des ventes du mois en cours.
 * - Applique automatiquement la région active (contexte ou override)
 * - Retourne aussi les ventes validÃ©es si demandé
 * - GÃ¨re rechargement manuel / refreshKey
 */
export function useMonthlySales(options: UseMonthlySalesOptions = {}): MonthlySalesState {
  const { includeValidated = false, regionOverride, refreshKey } = options;
  // Ancienne logique région supprimée pour revenir Ã  un dashboard unifié
  const { region: ctxRegion } = useRegion();
  const region = (regionOverride || ctxRegion || (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || 'FR');

  const [sales, setSales] = useState<Sale[]>([]);
  const [validatedSales, setValidatedSales] = useState<Sale[] | null>(includeValidated ? [] : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Agents CIV (fourni par la demande) — utiliser des mots-clés simples + synonymes pour robustesse
  const CIV_AGENT_KEYWORDS = [
    'dylan',
    'eunice',
    'benjamin',
    'vinny',
    'fatim',
    'ismael',
    'guy la roche',
    'auguste',
    'marie cecile',
    'judith',
  ];
  // Synonymes/variantes (ex: noms complets connus historiquement)
  const CIV_AGENT_SYNONYMS = [
    'dylan ouattara',
    'vinny eymard ray-stephane bodoua',
    'benji',
    'guy laroche kouadio',
    'eunice oulai',
  ];
  const [civAgentIds, setCivAgentIds] = useState<string[]>([]);
  const [civKeywordSet] = useState<Set<string>>(
    () => new Set([...CIV_AGENT_KEYWORDS, ...CIV_AGENT_SYNONYMS].map(n => n.trim().toLowerCase()))
  );
  const normalize = (s?: string) => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ').trim();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // remplacÃ© par Ã©coute temps rÃ©el dans useEffect ci-dessous
      setSales([]);
      if (includeValidated) setValidatedSales([]);
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error('Erreur chargement ventes'));
      setSales([]);
      if (includeValidated) setValidatedSales([]);
    } finally {
      setLoading(false);
    }
  }, [region, includeValidated]);

  // Résoudre les userIds des agents CIV (pour matcher solidement par ID)
  useEffect(() => {
    let active = true;
    const resolveIds = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        if (!active) return;
        const ids = usersSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(u => {
            const composite = normalize(u.name || [u.firstName, u.lastName].filter(Boolean).join(' '));
            if (!composite) return false;
            // match si la chaîne normalisée contient un des mots-clés/synonymes
            for (const kw of civKeywordSet) {
              const nkw = normalize(kw);
              if (nkw && composite.includes(nkw)) return true;
            }
            return false;
          })
          .map(u => u.id);
        setCivAgentIds(ids);
      } catch {
        if (active) setCivAgentIds([]);
      }
    };
    resolveIds();
    return () => { active = false; };
  }, [region, civKeywordSet]);

  useEffect(() => {
    // bornes de month
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
    const end = new Date(now.getFullYear(), now.getMonth()+1, 1, 0,0,0,0);
    const qRef = query(
      collection(db,'sales'),
      where('date','>=', Timestamp.fromDate(start)),
      where('date','<', Timestamp.fromDate(end)),
    );
    setLoading(true);
    const unsub = onSnapshot(qRef, (snap) => {
      const docs: Sale[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // Filtrage client demandé:
      // - FR: afficher FR + legacy sans région, mais EXCLURE les agents CIV listés (par userId ou nom)
      // - CIV: afficher UNIQUEMENT les ventes des agents CIV listés (quelque soit la valeur region du doc)
      const allowed = docs.filter((s:any)=>{
        const uid = s?.userId as string | undefined;
        const nameNorm = normalize((s?.name || '').toString());
        const isCivAgentById = !!(uid && civAgentIds.includes(uid));
        let isCivAgentByName = false;
        if (nameNorm) {
          for (const kw of civKeywordSet) {
            const nkw = normalize(kw);
            if (nkw && nameNorm.includes(nkw)) { isCivAgentByName = true; break; }
          }
        }
        const isCivAgent = isCivAgentById || isCivAgentByName;

        if (region === 'FR') {
          const base = (s?.region === 'FR' || !s?.region);
          return base && !isCivAgent; // exclure les agents CIV du scope FR
        }
        // region CIV => uniquement les agents CIV
        return isCivAgent;
      });
      setSales(allowed);      if (includeValidated) {
        const isValidated = (s: Sale) => {
          const bs = (s as any).basketStatus as string | undefined;
          if (bs && ["OK","Valid SOFT","VALID FINALE"].includes(bs)) return true;
          if ((s as any).consent === 'yes') return true;
          return false;
        };
        setValidatedSales(allowed.filter(isValidated));
      }
      setLoading(false);
    }, (err) => {
      setError(err instanceof Error ? err : new Error('Erreur temps rÃ©el ventes'));
      setSales([]);
      if (includeValidated) setValidatedSales([]);
      setLoading(false);
    });
    return () => unsub();
  }, [includeValidated, refreshKey, region, civAgentIds, civKeywordSet]);

  return { loading, error, sales, validatedSales, refresh: load, region: region as 'FR' | 'CIV' };
}

export default useMonthlySales;












