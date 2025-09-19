import { useEffect, useState, useCallback } from 'react';
import { Sale } from '../services/salesService';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
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
      // Filtrage client: CIV => uniquement CIV ; FR => FR + legacy sans region
      const allowed = docs.filter((s:any)=> s?.region === region || (!s?.region && region === 'FR'));
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
  }, [includeValidated, refreshKey, region]);

  return { loading, error, sales, validatedSales, refresh: load, region: region as 'FR' | 'CIV' };
}

export default useMonthlySales;












