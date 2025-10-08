import React from 'react';
import { useParams } from 'react-router-dom';
import { getSalesThisMonth, getValidatedSalesThisMonth, Sale } from '../services/salesService';
import ChartComponent from '../components/ChartComponent';

const SupervisorDashboard: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const subtitle = area?.toUpperCase() === 'LEADS'
    ? 'KPIs LEADS — collection "leads_sales"'
    : area?.toUpperCase() === 'CIV'
      ? 'KPIs CANAL+ CIV — collection "sales"'
      : 'KPIs CANAL+ FR — collection "sales"';

  const effectiveArea = React.useMemo(() => {
    // For CANAL+ supervisor side, default to CIV KPIs unless area explicitly set to FR
    const a = (area || '').toUpperCase();
    if (a === 'LEADS') return 'LEADS';
    if (a === 'FR') return 'FR';
    return 'CIV';
  }, [area]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [kpi, setKpi] = React.useState({
    daySales: 0,
    weekSales: 0,
    conversion: '—',
    topSeller: '—',
    monthSales: 0,
  });
  const [topSellers, setTopSellers] = React.useState<Array<[string, number]>>([]);
  const [chartMonth, setChartMonth] = React.useState<{ data: any; options: any } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        if (effectiveArea === 'LEADS') {
          // placeholder: no leads collection wired yet
          if (!cancelled) { setKpi({ daySales: 0, weekSales: 0, conversion: '—', topSeller: '—', monthSales: 0 }); setTopSellers([]); setLoading(false); }
          return;
        }
        const region = effectiveArea as 'FR' | 'CIV';
        const all = await getSalesThisMonth(region);
        const validated = await getValidatedSalesThisMonth(region);
        // build day/7d
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        const toDate = (v: any): Date | null => {
          try { if (!v) return null; if (v instanceof Date) return v; if (typeof v?.toDate === 'function') return v.toDate(); const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; }
        };
        const isSameDayOrAfter = (d: Date, ref: Date) => d.getTime() >= ref.getTime();
        const dayCount = validated.filter(s => { const d = toDate((s as any).date); return d && d >= startOfToday; }).length;
        const weekCount = validated.filter(s => { const d = toDate((s as any).date); return d && isSameDayOrAfter(d, sevenDaysAgo); }).length;
        // conversion (rough): validated / all (avoid div0)
        const conv = all.length ? Math.round((validated.length / all.length) * 100) : 0;
        const conversion = `${conv}%`;
        // top sellers by validated sales this month
        const sellerKey = (s: Sale) => String((s as any).name || (s as any).userName || (s as any).agent || 'Inconnu');
        const perSeller: Record<string, number> = {};
        validated.forEach(s => { const k = sellerKey(s); perSeller[k] = (perSeller[k] || 0) + 1; });
        const top = Object.entries(perSeller).sort((a,b) => b[1]-a[1]);
        // Graphique du mois (validées/jour) — du 1er au dernier jour du mois courant
        const nowM = new Date();
        const startMonth = new Date(nowM.getFullYear(), nowM.getMonth(), 1, 0, 0, 0, 0);
        const daysInMonth = new Date(nowM.getFullYear(), nowM.getMonth() + 1, 0).getDate();
        const labels: string[] = [];
        const counts = Array(daysInMonth).fill(0);
        for (let i = 0; i < daysInMonth; i++) {
          const day = new Date(startMonth.getFullYear(), startMonth.getMonth(), i + 1);
          labels.push(day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
        }
        for (const s of validated) {
          const d = toDate((s as any).date);
          if (!d) continue;
          if (d.getMonth() !== nowM.getMonth() || d.getFullYear() !== nowM.getFullYear()) continue; // sécurité
          const index = d.getDate() - 1;
          if (index >= 0 && index < daysInMonth) counts[index] += 1;
        }
        const chartData = {
          labels,
          datasets: [
            {
              type: 'bar',
              label: 'Ventes validées (mois)',
              data: counts,
              backgroundColor: 'rgba(16,185,129,0.6)',
              borderColor: 'rgba(16,185,129,1)',
              borderWidth: 1,
            },
          ],
        };
        const chartOptions = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#cbd5e1' } },
            tooltip: { enabled: true },
          },
          scales: {
            x: { ticks: { color: '#93c5fd' }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: '#93c5fd' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true, precision: 0 },
          },
        };
        if (!cancelled) {
          setKpi({ daySales: dayCount, weekSales: weekCount, conversion, topSeller: top[0]?.[0] || '—', monthSales: validated.length });
          setTopSellers(top.slice(0, 5));
          setChartMonth({ data: chartData, options: chartOptions });
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'Erreur chargement KPIs'); setLoading(false); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [effectiveArea]);

  return (
    <div className="space-y-4">
      <p className="text-blue-200">{subtitle} • Région effective: {effectiveArea}</p>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${effectiveArea === 'CIV' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
        {effectiveArea === 'CIV' && (
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Ventes CIV (mois)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : kpi.monthSales}</p>
          </div>
        )}
        <div className="bg-white/10 rounded-lg p-4 border border-white/10">
          <p className="text-blue-200 text-sm">Ventes jour</p>
          <p className="text-3xl font-extrabold">{loading ? '…' : kpi.daySales}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-4 border border-white/10">
          <p className="text-blue-200 text-sm">Ventes 7j</p>
          <p className="text-3xl font-extrabold">{loading ? '…' : kpi.weekSales}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-4 border border-white/10">
          <p className="text-blue-200 text-sm">Taux conv.</p>
          <p className="text-3xl font-extrabold">{loading ? '…' : kpi.conversion}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-4 border border-white/10">
          <p className="text-blue-200 text-sm">Top vendeur {effectiveArea === 'CIV' ? 'CIV' : ''}</p>
          <p className="text-3xl font-extrabold">{loading ? '…' : kpi.topSeller}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white/10 rounded-lg border border-white/10 p-4">
          <p className="text-blue-200 text-sm mb-2">Chronologie du mois (du 1er au dernier jour)</p>
          <div className="h-56">
            {chartMonth ? (
              <ChartComponent type="bar" data={chartMonth.data} options={chartMonth.options} height={220} />
            ) : (
              <div className="h-full flex items-center justify-center text-blue-300">…</div>
            )}
          </div>
        </div>
        <div className="bg-white/10 rounded-lg border border-white/10 p-4">
          <p className="text-blue-200 text-sm mb-2">Top vendeurs</p>
          {error && <div className="text-rose-300 text-sm">{error}</div>}
          <ul className="space-y-2 text-sm">
            {loading && <li className="flex justify-between"><span>…</span><span>…</span></li>}
            {!loading && topSellers.slice(0,5).map(([name, n]) => (
              <li key={name} className="flex justify-between"><span>{name}</span><span>{n}</span></li>
            ))}
            {!loading && topSellers.length === 0 && <li className="text-blue-300">—</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SupervisorDashboard;
