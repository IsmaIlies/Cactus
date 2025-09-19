import React, { useEffect, useState } from 'react';
import { useRegion } from '../contexts/RegionContext';
import KpiGrid from '../components/KpiGrid';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Placeholder simple: on récupère le dernier doc metricsDaily pour la région
interface MetricsDaily {
  dateKey: string;
  region: 'FR' | 'CIV';
  [key: string]: any;
}

const DashboardFrPage: React.FC = () => {
  const { region } = useRegion();
  const [metrics, setMetrics] = useState<MetricsDaily | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (region !== 'FR') return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'metricsDaily'),
            where('region', '==', 'FR'),
            orderBy('dateKey', 'desc'),
            limit(1)
        );
        const snap = await getDocs(q);
        if (!active) return;
        if (!snap.empty) {
          setMetrics(snap.docs[0].data() as MetricsDaily);
        }
      } catch (e) {
        console.warn('metrics FR load failed', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [region]);

  if (region && region !== 'FR') {
    return <div className="p-6 text-red-400">Accès refusé (mauvaise région)</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Dashboard Marseille (FR)</h1>
        <p className="text-sm text-white/60">Vue régionale France – KPI opérationnels quotidiens.</p>
      </div>
      <KpiGrid region="FR" metrics={metrics} loading={loading} />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 h-72 text-white/70">
          <h2 className="font-medium mb-2">Activité horaire (placeholder)</h2>
          <p className="text-xs">Ici un graphique (calls/hour).</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 h-72 text-white/70">
          <h2 className="font-medium mb-2">Top Agents (placeholder)</h2>
          <p className="text-xs">Ici un tableau des meilleures performances.</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardFrPage;
