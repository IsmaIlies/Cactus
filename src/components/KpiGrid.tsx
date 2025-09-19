import React from 'react';
import StatCard from './StatCard';
import { DASHBOARD_KPI_CONFIG, formatKpiValue } from '../config/dashboardKpiConfig';

interface KpiGridProps {
  region: 'FR' | 'CIV';
  metrics: Record<string, any> | null;
  loading?: boolean;
}

const skeletonItems = new Array(6).fill(0);

const KpiGrid: React.FC<KpiGridProps> = ({ region, metrics, loading }) => {
  const cfg = DASHBOARD_KPI_CONFIG[region] || [];
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {loading && skeletonItems.map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border border-white/10 bg-white/5 h-24" />
      ))}
      {!loading && cfg.map(item => (
        <StatCard
          key={item.key}
          title={item.label}
          value={formatKpiValue(metrics ? metrics[item.key] : null, item)}
        />
      ))}
    </div>
  );
};

export default KpiGrid;