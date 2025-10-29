import React from 'react';
import { useParams } from 'react-router-dom';
import { getSalesThisMonth, getValidatedSalesThisMonth, Sale } from '../services/salesService';
import ChartComponent from '../components/ChartComponent';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToLeadKpis } from '../leads/services/leadsSalesService';

const SupervisorDashboard: React.FC = () => {
  // State pour le tableau ventes du jour par agent Canal+
  const [canalDayByAgent, setCanalDayByAgent] = React.useState<Array<{ agent: string; canal: number; cine: number; sport: number; cent: number; total: number }>>([]);
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
  const [leadDayByOrigin, setLeadDayByOrigin] = React.useState<{ opportunity: number; doleadd: number; mm: number }>({ opportunity: 0, doleadd: 0, mm: 0 });
  const [chartCanalOnly, setChartCanalOnly] = React.useState<{ data: any; options: any } | null>(null);

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
            // Additionne uniquement Internet + Internet Sosh (PAS mobile ni mobile sosh)
            const opportunity = (snap?.opportunity?.internetSosh || 0) + (snap?.opportunity?.box || 0 - (snap?.opportunity?.internetSosh || 0));
            const dol = (snap?.dolead?.internetSosh || 0) + (snap?.dolead?.box || 0 - (snap?.dolead?.internetSosh || 0));
            const mm = (snap?.mm?.internetSosh || 0) + (snap?.mm?.box || 0 - (snap?.mm?.internetSosh || 0));
            const day = opportunity + dol + mm;
            setKpi((prev) => ({ ...prev, daySales: day }));
            setLeadDayByOrigin({ opportunity, doleadd: dol, mm });
          });
          unsubs.push(() => { try { (un1 as any)?.(); } catch {} });

          // 2) Month timeline + 7d + top sellers using a month-bounded snapshot with fallback
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
          const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);

          // Conversion robuste Firestore Timestamp OU string Firestore
          const toDate = (v: any): Date | null => {
            try {
              if (!v) return null;
              if (v instanceof Date) return v;
              if (typeof v?.toDate === 'function') return v.toDate();
              // Si string Firestore (ex: 'October 1, 2025 at 5:44:34 PM UTC+2')
              if (typeof v === 'string') {
                // Essaye d'abord Date.parse
                let d = new Date(v);
                if (!isNaN(d.getTime())) return d;
                // Sinon, parse format Firestore
                const match = v.match(/(\w+) (\d+), (\d{4}) at (\d+):(\d+):(\d+) (AM|PM) UTC([+-]\d+)/);
                if (match) {
                  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                  const month = months.indexOf(match[1]);
                  const day = parseInt(match[2],10);
                  const year = parseInt(match[3],10);
                  let hour = parseInt(match[4],10);
                  const min = parseInt(match[5],10);
                  const sec = parseInt(match[6],10);
                  const pm = match[7] === 'PM';
                  if (pm && hour < 12) hour += 12;
                  if (!pm && hour === 12) hour = 0;
                  // UTC offset
                  const offset = parseInt(match[8],10);
                  const date = new Date(Date.UTC(year, month, day, hour - offset, min, sec));
                  return date;
                }
                return null;
              }
              const d = new Date(v);
              return isNaN(d.getTime()) ? null : d;
            } catch { return null; }
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
        // Conversion robuste Firestore Timestamp OU string Firestore
        const toDate = (v: any): Date | null => {
          try {
            if (!v) return null;
            if (v instanceof Date) return v;
            if (typeof v?.toDate === 'function') return v.toDate();
            // Si string Firestore (ex: 'October 1, 2025 at 5:44:34 PM UTC+2')
            if (typeof v === 'string') {
              // Essaye d'abord Date.parse
              let d = new Date(v);
              if (!isNaN(d.getTime())) return d;
              // Sinon, parse format Firestore
              const match = v.match(/(\w+) (\d+), (\d{4}) at (\d+):(\d+):(\d+) (AM|PM) UTC([+-]\d+)/);
              if (match) {
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                const month = months.indexOf(match[1]);
                const day = parseInt(match[2],10);
                const year = parseInt(match[3],10);
                let hour = parseInt(match[4],10);
                const min = parseInt(match[5],10);
                const sec = parseInt(match[6],10);
                const pm = match[7] === 'PM';
                if (pm && hour < 12) hour += 12;
                if (!pm && hour === 12) hour = 0;
                // UTC offset
                const offset = parseInt(match[8],10);
                const date = new Date(Date.UTC(year, month, day, hour - offset, min, sec));
                return date;
              }
              return null;
            }
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
          } catch { return null; }
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
        // Graphique multi courbes Canal+ (Canal+, Ciné Séries, Sport, 100%)
        const nowM = new Date();
        const startMonth = new Date(nowM.getFullYear(), nowM.getMonth(), 1, 0, 0, 0, 0);
        const daysInMonth = new Date(nowM.getFullYear(), nowM.getMonth() + 1, 0).getDate();
        const labels: string[] = [];
        for (let i = 0; i < daysInMonth; i++) {
          const day = new Date(startMonth.getFullYear(), startMonth.getMonth(), i + 1);
          labels.push(day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
        }
        // Initialisation des tableaux de ventes par jour pour chaque offre
        const offers = [
          { key: 'canal', label: 'Canal+', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
          { key: 'cine', label: 'Canal+ Ciné Séries', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
          { key: 'sport', label: 'Canal+ Sport', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
          { key: 'cent', label: '100% Canal', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
        ];
        const salesByDay: Record<string, number[]> = {
          canal: Array(daysInMonth).fill(0),
          cine: Array(daysInMonth).fill(0),
          sport: Array(daysInMonth).fill(0),
          cent: Array(daysInMonth).fill(0),
        };
        for (const s of validated) {
          const d = toDate((s as any).date);
          if (!d) continue;
          if (d.getMonth() !== nowM.getMonth() || d.getFullYear() !== nowM.getFullYear()) continue;
          const index = d.getDate() - 1;
          if (index < 0 || index >= daysInMonth) continue;
          // Détection de l'offre (adapter selon structure réelle)
          const offer = ((s as any).offer || (s as any).offre || '').toLowerCase();
          if (offer.includes('ciné') || offer.includes('cine')) salesByDay.cine[index]++;
          else if (offer.includes('sport')) salesByDay.sport[index]++;
          else if (offer.includes('100')) salesByDay.cent[index]++;
          else salesByDay.canal[index]++;
        }
        const datasets = offers.map(o => ({
          label: o.label,
          data: salesByDay[o.key],
          borderColor: o.color,
          backgroundColor: o.bg,
          pointBackgroundColor: o.color,
          fill: true,
          tension: 0.3,
        }));
        const chartData = { labels, datasets };
        const chartOptions = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 14, weight: 'bold' } } },
            tooltip: { enabled: true },
            title: { display: false },
          },
          scales: {
            x: { ticks: { color: '#93c5fd', font: { size: 13 } }, grid: { color: 'rgba(255,255,255,0.08)' } },
            y: { ticks: { color: '#93c5fd', font: { size: 13 } }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true, precision: 0 },
          },
        };
        // Prépare aussi un dataset pour les ventes Canal+ seules (hors Ciné, Sport, 100%)
        const canalOnlyData = salesByDay.canal.slice();
        const chartDataCanalOnly = {
          labels,
          datasets: [
            {
              label: 'Canal+ (seulement)',
              data: canalOnlyData,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.1)',
              pointBackgroundColor: '#3b82f6',
              fill: true,
              tension: 0.3,
            },
          ],
        };
        const chartOptionsCanalOnly = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 14, weight: 'bold' } } },
            tooltip: { enabled: true },
            title: { display: false },
          },
          scales: {
            x: { ticks: { color: '#93c5fd', font: { size: 13 } }, grid: { color: 'rgba(255,255,255,0.08)' } },
            y: { ticks: { color: '#93c5fd', font: { size: 13 } }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true, precision: 0 },
          },
        };
        // Calcul ventes du jour par agent Canal+
        const agentsMap: Record<string, { canal: number; cine: number; sport: number; cent: number; total: number }> = {};
        for (const s of validated) {
          const d = toDate((s as any).date);
          if (!d) continue;
          if (d.getDate() !== now.getDate() || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
          const offer = ((s as any).offer || (s as any).offre || '').toLowerCase();
          const agent = String((s as any).name || (s as any).userName || (s as any).agent || 'Inconnu');
          if (!agentsMap[agent]) agentsMap[agent] = { canal: 0, cine: 0, sport: 0, cent: 0, total: 0 };
          if (offer.includes('ciné') || offer.includes('cine')) { agentsMap[agent].cine++; agentsMap[agent].total++; }
          else if (offer.includes('sport')) { agentsMap[agent].sport++; agentsMap[agent].total++; }
          else if (offer.includes('100')) { agentsMap[agent].cent++; agentsMap[agent].total++; }
          else { agentsMap[agent].canal++; agentsMap[agent].total++; }
        }
        const canalDayRows = Object.entries(agentsMap)
          .map(([agent, v]) => ({ agent, ...v }))
          .sort((a, b) => b.total - a.total);
        if (!cancelled) {
          setKpi({ daySales: dayCount, weekSales: weekCount, conversion, topSeller: top[0]?.[0] || '—', monthSales: validated.length });
          setTopSellers(top.slice(0, 5));
          setChartMonth({ data: chartData, options: chartOptions });
          setChartCanalOnly({ data: chartDataCanalOnly, options: chartOptionsCanalOnly });
          setCanalDayByAgent(canalDayRows);
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
            <p className="text-blue-200 text-sm">Opportunity (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.opportunity}</p>
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
        <div className="lg:col-span-2 bg-white/10 rounded-2xl border border-white/10 p-6">
          <div className="flex flex-row justify-between items-center mb-2">
            <div>
              <h2 className="text-white text-2xl font-bold leading-tight mb-0">Historique mensuel</h2>
              <p className="text-[#b2becd] text-base font-normal mt-1 mb-0">Évolution des ventes Canal+ (toutes offres) sur le mois courant.</p>
            </div>
            <span className="text-[#b2becd] text-sm font-medium">Mois : {new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="h-80 mt-2">
            {chartMonth ? (
              <ChartComponent type="line" data={chartMonth.data} options={chartMonth.options} height={300} />
            ) : (
              <div className="h-full flex items-center justify-center text-blue-300">…</div>
            )}
          </div>
          {/* ...section Canal+ uniquement supprimée... */}
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
      {/* Tableau ventes du jour par agent Canal+ (style inspiré du screen fourni) */}
      <div className="bg-[#172635] rounded-2xl border border-[#22334a] p-6 mt-8 shadow-lg">
        <div className="flex flex-row justify-between items-center mb-2">
          <div>
            <h2 className="text-white text-2xl font-bold leading-tight mb-0">Ventes du jour par agent</h2>
            <p className="text-[#b2becd] text-base font-normal mt-1 mb-0">Canal+, Canal+ Ciné Séries, Canal+ Sport, Canal+ 100% consolidés.</p>
          </div>
          <span className="text-[#b2becd] text-sm font-medium">Actualisation automatique</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-base text-blue-100">
            <thead>
              <tr className="border-b border-[#22334a] bg-[#1e3147]">
                <th className="py-2 px-4 text-left tracking-widest font-semibold text-blue-200">AGENT</th>
                <th className="py-2 px-4 text-center tracking-widest font-semibold text-blue-200">CANAL+</th>
                <th className="py-2 px-4 text-center tracking-widest font-semibold text-blue-200">CINÉ SÉRIES</th>
                <th className="py-2 px-4 text-center tracking-widest font-semibold text-blue-200">SPORT</th>
                <th className="py-2 px-4 text-center tracking-widest font-semibold text-blue-200">100% CANAL</th>
                <th className="py-2 px-4 text-center tracking-widest font-semibold text-blue-200">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {canalDayByAgent.length === 0
                ? [<tr key="empty"><td colSpan={6} className="py-4 px-4 text-center text-blue-300">Aucun résultat</td></tr>]
                : canalDayByAgent.map((row) => (
                    <tr key={row.agent} className="border-b border-[#22334a] hover:bg-[#22334a]/40 transition-colors">
                      <td className="py-2 px-4 font-semibold text-white">{row.agent}</td>
                      <td className="py-2 px-4 text-center">{row.canal}</td>
                      <td className="py-2 px-4 text-center">{row.cine}</td>
                      <td className="py-2 px-4 text-center">{row.sport}</td>
                      <td className="py-2 px-4 text-center">{row.cent}</td>
                      <td className="py-2 px-4 text-center font-bold text-white">{row.total}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SupervisorDashboard;
