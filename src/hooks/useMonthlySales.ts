import { useEffect, useState, useCallback } from 'react';
import { Sale } from '../services/salesService';
import { collection, onSnapshot, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useRegion } from '../contexts/RegionContext';

export interface UseMonthlySalesOptions {
  /** Charger aussi les ventes validÃ©es sÃ©parÃ©ment */
  includeValidated?: boolean;
  /** Forcer la rÃ©gion (sinon on prend le contexte) */
  regionOverride?: 'FR' | 'CIV';
  /** Rechargement forcÃ© quand cette valeur change (ex: aprÃ¨s mutation) */
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
 * - Applique automatiquement la rÃ©gion active (contexte ou override)
 * - Retourne aussi les ventes validÃ©es si demandÃ©
 * - GÃ¨re rechargement manuel / refreshKey
 */
export function useMonthlySales(options: UseMonthlySalesOptions = {}): MonthlySalesState {
  const { includeValidated = false, regionOverride, refreshKey } = options;
  // Ancienne logique rÃ©gion supprimÃ©e pour revenir Ã  un dashboard unifiÃ©
  const { region: ctxRegion } = useRegion();
  const region = (regionOverride || ctxRegion || (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || 'FR');

  const [sales, setSales] = useState<Sale[]>([]);
  const [validatedSales, setValidatedSales] = useState<Sale[] | null>(includeValidated ? [] : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Agents CIV explicitement listés (noms insensibles Ã  la casse)
  const CIV_AGENT_NAMES = [
    'DYLAN OUATTARA',
    'Vinny Eymard Ray-Stephane Bodoua',
    'Benji',
    'Guy Laroche KOUADIO',
    'eunice oulai'
  ];
  const [civAgentIds, setCivAgentIds] = useState<string[]>([]);
  const [civAgentNameSet] = useState<Set<string>>(
    () => new Set(CIV_AGENT_NAMES.map(n => n.trim().toLowerCase()))
  );

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

  // Résoudre les userIds des agents CIV quand on est sur la région CIV
  useEffect(() => {
    let active = true;
    const resolveIds = async () => {
      if (region !== 'CIV') { setCivAgentIds([]); return; }
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        if (!active) return;
        const ids = usersSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(u => {
            const composite = (u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')).trim();
            return composite && civAgentNameSet.has(composite.toLowerCase());
          })
          .map(u => u.id);
        setCivAgentIds(ids);
      } catch {
        if (active) setCivAgentIds([]);
      }
    };
    resolveIds();
    return () => { active = false; };
  }, [region, civAgentNameSet]);

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
      // Filtrage client:
      // - FR => ventes FR + legacy sans region
      // - CIV => ventes CIV + ventes de la liste d'agents CIV (mÃªme si region manquante ou FR)
      const allowed = docs.filter((s:any)=>{
        if (region === 'FR') return (s?.region === 'FR' || !s?.region);
        // region CIV
        if (s?.region === 'CIV') return true;
        const uid = s?.userId as string | undefined;
        if (uid && civAgentIds.includes(uid)) return true;
        const nm = (s?.name || '').toString().trim().toLowerCase();
        if (nm && civAgentNameSet.has(nm)) return true;
        return false;
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
  }, [includeValidated, refreshKey, region, civAgentIds, civAgentNameSet]);

  return { loading, error, sales, validatedSales, refresh: load, region: region as 'FR' | 'CIV' };
}

export default useMonthlySales;












