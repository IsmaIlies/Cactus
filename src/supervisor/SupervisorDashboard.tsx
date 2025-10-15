import React from 'react';
import { useParams } from 'react-router-dom';
import { getSalesThisMonth, getValidatedSalesThisMonth, Sale } from '../services/salesService';
import ChartComponent from '../components/ChartComponent';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToLeadKpis } from '../leads/services/leadsSalesService';

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
  // LEADS per-origin KPIs (du jour)
  const [leadDayByOrigin, setLeadDayByOrigin] = React.useState<{ hipto: number; doleadd: number; mm: number }>({ hipto: 0, doleadd: 0, mm: 0 });

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      try {
        if (effectiveArea === 'LEADS') {
          // Wire realtime KPIs from leads_sales
          // 1) Day KPIs via subscribeToLeadKpis (sum mobiles+box across sources)
          const unsubs: Array<() => void> = [];
          const un1 = subscribeToLeadKpis((snap) => {
            if (cancelled) return;
            const hip = (snap?.hipto?.mobiles || 0) + (snap?.hipto?.box || 0);
            const dol = (snap?.dolead?.mobiles || 0) + (snap?.dolead?.box || 0);
            const mm = (snap?.mm?.mobiles || 0) + (snap?.mm?.box || 0);
            const day = hip + dol + mm;
            setKpi((prev) => ({ ...prev, daySales: day }));
            setLeadDayByOrigin({ hipto: hip, doleadd: dol, mm });
          });
          unsubs.push(() => { try { (un1 as any)?.(); } catch {} });

          // 2) Month timeline + 7d + top sellers using a month-bounded snapshot with fallback
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
          const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);

          const toDate = (v: any): Date | null => {
            try { if (!v) return null; if (v instanceof Date) return v; if (typeof v?.toDate === 'function') return v.toDate(); const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; }
          };

          const computeFromSnapshot = (snap: any, clientFilterByMonth: boolean) => {
            const nowInMonth = new Date();
            const daysInMonth = new Date(nowInMonth.getFullYear(), nowInMonth.getMonth() + 1, 0).getDate();
            const counts = Array(daysInMonth).fill(0);
            const perSeller: Record<string, number> = {};
            let weekCount = 0;
            let monthTotal = 0;
            snap.forEach((doc: any) => {
              const data = doc.data() as any;
              const ts: Timestamp | null = data?.createdAt ?? null;
              const d = toDate(ts);
              if (!d) return;
              if (clientFilterByMonth) {
                if (d < monthStart || d >= nextMonth) return;
              }
              monthTotal += 1;
              if (d >= sevenDaysAgo) weekCount += 1;
              const index = d.getDate() - 1;
              if (index >= 0 && index < daysInMonth) counts[index] += 1;
              const seller = String(data?.createdBy?.displayName || data?.createdBy?.email || 'Inconnu');
              perSeller[seller] = (perSeller[seller] || 0) + 1;
            });
            const labels: string[] = [];
            for (let i = 0; i < daysInMonth; i++) {
              const day = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
              labels.push(day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
            }
            const chartData = {
              labels,
              datasets: [
                {
                  type: 'bar' as const,
                  label: 'Ventes (mois)',
                  data: counts,
                  backgroundColor: 'rgba(96,165,250,0.5)',
                  borderColor: 'rgba(59,130,246,1)',
                  borderWidth: 1,
                },
              ],
            };
            const chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom' as const, labels: { color: '#cbd5e1' } },
                tooltip: { enabled: true },
              },
              scales: {
                x: { ticks: { color: '#93c5fd' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                y: { ticks: { color: '#93c5fd' }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true, precision: 0 },
              },
            };
            const top = Object.entries(perSeller).sort((a,b) => b[1] - a[1]);
            if (!cancelled) {
              setKpi((prev) => ({ ...prev, weekSales: weekCount, topSeller: top[0]?.[0] || '—', monthSales: monthTotal }));
              setTopSellers(top.slice(0, 5));
              setChartMonth({ data: chartData, options: chartOptions });
              setLoading(false);
            }
          };

          const primary = query(
            collection(db, 'leads_sales'),
            where('mission', '==', 'ORANGE_LEADS'),
            where('createdAt', '>=', Timestamp.fromDate(monthStart)),
            where('createdAt', '<', Timestamp.fromDate(nextMonth)),
            orderBy('createdAt', 'asc')
          );

          const un2 = onSnapshot(
            primary,
            (snap) => computeFromSnapshot(snap, false),
            (err) => {
              const code = (err as any)?.code;
              if (code === 'failed-precondition') {
                // Fallback without date range/order to avoid composite index requirement
                const fb = query(collection(db, 'leads_sales'), where('mission', '==', 'ORANGE_LEADS'));
                const unfb = onSnapshot(
                  fb,
                  (snap) => computeFromSnapshot(snap, true),
                  (err2) => { if (!cancelled) { setError((err2 as any)?.message || 'Erreur lecture LEADS'); setLoading(false); } }
                );
                unsubs.push(() => { try { unfb(); } catch {} });
              } else if (code === 'permission-denied') {
                if (!cancelled) { setError("Accès refusé (LEADS)"); setLoading(false); }
              } else {
                if (!cancelled) { setError((err as any)?.message || 'Erreur lecture LEADS'); setLoading(false); }
              }
            }
          );
          unsubs.push(() => { try { un2(); } catch {} });

          return () => { unsubs.forEach((u) => u()); };
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
    const cleanupOrPromise = run();
    return () => { cancelled = true; try { (cleanupOrPromise as any)?.(); } catch {} };
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
      {effectiveArea === 'LEADS' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Hipto (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.hipto}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">Dolead (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.doleadd}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4 border border-white/10">
            <p className="text-blue-200 text-sm">MM (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.mm}</p>
          </div>
        </div>
      )}
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
