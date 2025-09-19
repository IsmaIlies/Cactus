import React, { useEffect, useState } from 'react';
import { useRegion } from '../contexts/RegionContext';
import KpiGrid from '../components/KpiGrid';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

interface MetricsDaily {
  dateKey: string;
  region: 'FR' | 'CIV';
  [key: string]: any;
}

const DashboardCivPage: React.FC = () => {
  const { region } = useRegion();
  const [metrics, setMetrics] = useState<MetricsDaily | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (region !== 'CIV') return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'metricsDaily'),
          where('region', '==', 'CIV'),
          orderBy('dateKey', 'desc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!active) return;
        if (!snap.empty) {
          setMetrics(snap.docs[0].data() as MetricsDaily);
        }
      } catch (e) {
        console.warn('metrics CIV load failed', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [region]);

  // Pas de tableau ad hoc de ventes: on se repose sur les graphiques existants (Dashboard Home)

  if (region && region !== 'CIV') {
    return <div className="p-6 text-red-400">Accès refusé (mauvaise région)</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Dashboard Côte d'Ivoire (CIV)</h1>
        <p className="text-sm text-white/60">Vue régionale CIV – KPI spécifiques.</p>
      </div>
      <KpiGrid region="CIV" metrics={metrics} loading={loading} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 h-72 text-white/70">
          <h2 className="font-medium mb-2">Product Mix (placeholder)</h2>
          <p className="text-xs">Ici un graphique (répartition produits).</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 h-72 text-white/70">
          <h2 className="font-medium mb-2">Conformité Script (placeholder)</h2>
          <p className="text-xs">Ici une jauge conformité.</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardCivPage;
