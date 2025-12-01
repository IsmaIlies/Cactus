import React from 'react';
import CountUp from 'react-countup';
import { useParams } from 'react-router-dom';
import { getSalesThisMonth, getValidatedSalesThisMonth, Sale } from '../services/salesService';
import ChartComponent from '../components/ChartComponent';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { subscribeToLeadKpis } from '../leads/services/leadsSalesService';
import AlertsPanel, { SmartAlert } from '../components/AlertsPanel';
import RecordsHistory from '../components/RecordsHistory';

const SupervisorDashboard: React.FC = () => {
  // State pour le tableau ventes du jour par agent Canal+
  const [canalDayByAgent, setCanalDayByAgent] = React.useState<Array<{ agent: string; canal: number; cine: number; sport: number; cent: number; total: number }>>([]);
  // Période personnalisée
  const todayStr = React.useMemo(() => new Date().toISOString().slice(0,10), []);
  const [startDate, setStartDate] = React.useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0,10);
  });
  const [endDate, setEndDate] = React.useState<string>(todayStr);
  // Saisie non validée (évite recalcul à la frappe)
  const [draftStart, setDraftStart] = React.useState<string>(() => startDate);
  const [draftEnd, setDraftEnd] = React.useState<string>(() => endDate);
  const [dateError, setDateError] = React.useState<string | null>(null);
  // Record de ventes sur une journée
  const [recordDay, setRecordDay] = React.useState<{ date: string; total: number; topAgent: string; topAgentCount: number } | null>(null);
  // Historique records (top days/agents/mois)
  const [recordDays, setRecordDays] = React.useState<Array<{ date: string; total: number }>>([]);
  const [recordAgents, setRecordAgents] = React.useState<Array<{ name: string; total: number }>>([]);
  const [recordMonths, setRecordMonths] = React.useState<Array<{ month: string; total: number }>>([]);
  // Smart alerts
  const [alerts, setAlerts] = React.useState<SmartAlert[]>([]);
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
  const [chartStatus, setChartStatus] = React.useState<{ data: any; options: any } | null>(null);
  const [chartAgents, setChartAgents] = React.useState<{ data: any; options: any } | null>(null);
  // LEADS per-origin KPIs (du jour)
  const [leadDayByOrigin, setLeadDayByOrigin] = React.useState<{ opportunity: number; doleadd: number; mm: number }>({ opportunity: 0, doleadd: 0, mm: 0 });
  // const [chartCanalOnly, setChartCanalOnly] = React.useState<{ data: any; options: any } | null>(null);
  // Répartition des offres (jour)
  const [dayOffers, setDayOffers] = React.useState<{ canal: number; cine: number; sport: number; cent: number }>({ canal: 0, cine: 0, sport: 0, cent: 0 });
  // Multi-critères filters
  const [selectedOffers, setSelectedOffers] = React.useState<Set<'canal'|'cine'|'sport'|'cent'>>(new Set(['canal','cine','sport','cent']));
  const [availableStatuses, setAvailableStatuses] = React.useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = React.useState<Set<string>>(new Set());
  const [availableAgents, setAvailableAgents] = React.useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = React.useState<Set<string>>(new Set());
  const [regionOverride, setRegionOverride] = React.useState<'FR'|'CIV'|''>('');

  // UI tokens (harmonized colors)
  // Palette Canal+ jour – augmenter la différenciation visuelle : Canal+ passe à un dégradé turquoise
  const COLORS = React.useMemo(() => ({
    // Canal+ passe en véritable turquoise clair + contour accent pour visibilité
    canalSolid: '#22d3ee',      // turquoise principale (CANAL+ segment plein)
    canalBorder: '#06b6d4',     // bord / barre accent
    canalGradientFrom: '#0ea5e9',
    canalGradientTo: '#22d3ee',
    cine: '#8b5cf6',
    sport: '#10b981',
    cent: '#f59e0b',
    primary: '#60a5fa',
  }), []);

  // Lightweight spinner for KPIs
  const Spinner: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg
      className="animate-spin text-blue-200"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );

  // KPI card UI aligned with Leads dashboard aesthetics
  const KpiCard: React.FC<{ label: string; value: React.ReactNode; subtitle?: string; gradient?: string; accent?: string }>
    = ({ label, value, subtitle = 'Période', gradient = 'from-[#0a152a] via-[#09172f] to-[#071326]', accent = 'text-blue-200' }) => (
      <article className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-5 shadow-[0_18px_45px_rgba(8,20,60,0.45)]`}> 
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.22),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="relative flex h-full flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className={`text-sm font-semibold ${accent}`}>{label}</h3>
            <span className="text-[10px] font-semibold uppercase tracking-[0.4em] text-blue-100/70">{subtitle}</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold text-white leading-none">{value}</p>
          </div>
        </div>
      </article>
    );

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true); setError(null);
      // Utilitaire: conversion Firestore Timestamp/string -> Date
      function toDate(v: any): Date | null {
        try {
          if (!v) return null;
          if (v instanceof Date) return v;
          if (typeof v?.toDate === 'function') return v.toDate();
          if (typeof v === 'string') {
            let d = new Date(v);
            if (!isNaN(d.getTime())) return d;
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
              const offset = parseInt(match[8],10);
              const date = new Date(Date.UTC(year, month, day, hour - offset, min, sec));
              return date;
            }
            return null;
          }
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d;
        } catch { return null; }
      }
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

          const activeRegion = (() => { try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase()==='CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; } })();
          const primary = activeRegion === 'CIV'
            ? query(
                collection(db, 'leads_sales'),
                where('mission', '==', 'ORANGE_LEADS'),
                where('region', '==', 'CIV'),
                where('createdAt', '>=', Timestamp.fromDate(monthStart)),
                where('createdAt', '<', Timestamp.fromDate(nextMonth)),
                orderBy('createdAt', 'asc')
              )
            : query(
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
                const fb = activeRegion === 'CIV'
                  ? query(collection(db, 'leads_sales'), where('mission', '==', 'ORANGE_LEADS'), where('region','==', 'CIV'))
                  : query(collection(db, 'leads_sales'), where('mission', '==', 'ORANGE_LEADS'));
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
  const region = (regionOverride || (effectiveArea as 'FR' | 'CIV')) as 'FR' | 'CIV';
  // Récupère toutes les ventes du mois courant puis filtre côté client selon la période personnalisée
  const all = await getSalesThisMonth(region);
  const validated = await getValidatedSalesThisMonth(region);
  // Filtrage période personnalisée (inclusif)
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T23:59:59');
  const inPeriod = (d: Date) => d >= start && d <= end;
  // Préparer options dynamiques
  if (!cancelled) {
    const statuses = Array.from(new Set(all.map((s: any) => String(s?.basketStatus || '—')).filter(Boolean))).sort();
    const agents = Array.from(new Set(all.map((s: any) => String(s?.name || s?.userName || s?.agent || 'Inconnu')))).sort((a,b)=>a.localeCompare(b));
    setAvailableStatuses(statuses);
    setAvailableAgents(agents);
  }
  let allPeriod = all.filter(s => { const d = toDate((s as any).date); return d && inPeriod(d); });
  let validatedPeriod = validated.filter(s => { const d = toDate((s as any).date); return d && inPeriod(d); });
  const classify = (offerRaw: string) => {
    const offer = (offerRaw || '').toLowerCase();
    if (offer.includes('ciné') || offer.includes('cine')) return 'cine' as const;
    if (offer.includes('sport')) return 'sport' as const;
    if (offer.includes('100')) return 'cent' as const;
    return 'canal' as const;
  };
  if (selectedOffers.size > 0) {
    allPeriod = allPeriod.filter((s:any)=> selectedOffers.has(classify((s as any).offer || (s as any).offre || '')));
    validatedPeriod = validatedPeriod.filter((s:any)=> selectedOffers.has(classify((s as any).offer || (s as any).offre || '')));
  }
  if (selectedStatuses.size > 0) {
    allPeriod = allPeriod.filter((s:any)=> selectedStatuses.has(String((s as any).basketStatus || '—')));
    validatedPeriod = validatedPeriod.filter((s:any)=> selectedStatuses.has(String((s as any).basketStatus || '—')));
  }
  if (selectedAgents.size > 0) {
    const getAgent = (s:any)=> String((s as any).name || (s as any).userName || (s as any).agent || 'Inconnu');
    allPeriod = allPeriod.filter((s:any)=> selectedAgents.has(getAgent(s)));
    validatedPeriod = validatedPeriod.filter((s:any)=> selectedAgents.has(getAgent(s)));
  }
        // build day/7d
  // const now = new Date();
  
  // const isSameDayOrAfter = (d: Date, ref: Date) => d.getTime() >= ref.getTime();
        // KPIs filtrés sur la période personnalisée
        const dayCount = validatedPeriod.filter(s => {
          const d = toDate((s as any).date);
          return d && d.toISOString().slice(0,10) === endDate;
        }).length;
        const weekCount = validatedPeriod.length; // sur la période sélectionnée
        const conv = allPeriod.length ? Math.round((validatedPeriod.length / allPeriod.length) * 100) : 0;
        const conversion = `${conv}%`;
        // top sellers by validated sales this month
  const sellerKey = (s: Sale) => String((s as any).name || (s as any).userName || (s as any).agent || 'Inconnu');
        const perSeller: Record<string, number> = {};
  validatedPeriod.forEach(s => { const k = sellerKey(s); perSeller[k] = (perSeller[k] || 0) + 1; });
  const top = Object.entries(perSeller).sort((a,b) => b[1]-a[1]);
        // Graphique multi courbes Canal+ (Canal+, Ciné Séries, Sport, 100%)
        // Labels pour la période sélectionnée
        const labels: string[] = [];
        const dateCursor = new Date(startDate + 'T00:00:00');
        const endCursor = new Date(endDate + 'T00:00:00');
        while (dateCursor <= endCursor) {
          labels.push(dateCursor.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
          dateCursor.setDate(dateCursor.getDate() + 1);
        }
        // Initialisation des tableaux de ventes par jour pour chaque offre
        const offers = [
          { key: 'canal', label: 'Canal+', color: COLORS.canalSolid, bg: 'rgba(34,211,238,0.18)' },
          { key: 'cine', label: 'Canal+ Ciné Séries', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
          { key: 'sport', label: 'Canal+ Sport', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
          { key: 'cent', label: '100% Canal', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
        ];
        const nbDays = labels.length;
        const salesByDay: Record<string, number[]> = {
          canal: Array(nbDays).fill(0),
          cine: Array(nbDays).fill(0),
          sport: Array(nbDays).fill(0),
          cent: Array(nbDays).fill(0),
        };
        for (const s of validatedPeriod) {
          const d = toDate((s as any).date);
          if (!d) continue;
          const index = Math.floor((d.getTime() - new Date(startDate + 'T00:00:00').getTime()) / (1000*60*60*24));
          if (index < 0 || index >= nbDays) continue;
          const okey = ((offerRaw: string)=>{
            const offer = (offerRaw||'').toLowerCase();
            if (offer.includes('ciné') || offer.includes('cine')) return 'cine';
            if (offer.includes('sport')) return 'sport';
            if (offer.includes('100')) return 'cent';
            return 'canal';
          })(((s as any).offer || (s as any).offre || '')) as 'canal'|'cine'|'sport'|'cent';
          salesByDay[okey][index]++;
        }
        const datasets = offers.map(o => ({
           label: o.label,
           data: salesByDay[o.key],
           borderColor: o.color,
           backgroundColor: o.bg,
           pointBackgroundColor: o.color,
           pointRadius: 5,
           pointHoverRadius: 7,
           pointBorderWidth: 2,
           borderWidth: 3,
           fill: true,
           tension: 0.35,
           shadowOffsetX: 0,
           shadowOffsetY: 2,
           shadowBlur: 8,
           shadowColor: o.color,
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
          animation: { duration: 600, easing: 'easeOutQuart' },
        };
        // Répartition des statuts empilée par jour (sur la période, toutes ventes)
        const oneDay = 24*60*60*1000;
        const startMs = new Date(startDate + 'T00:00:00').getTime();
        const statusTotals: Record<string, number> = {};
        const statusPerDay: Record<string, number[]> = {};
        allPeriod.forEach((s:any)=>{
          const d = toDate(s?.date); if (!d) return;
          const idx = Math.floor((d.getTime() - startMs)/oneDay);
          if (idx < 0 || idx >= nbDays) return;
          const st = String(s?.basketStatus || '—').toUpperCase();
          statusTotals[st] = (statusTotals[st]||0)+1;
          if (!statusPerDay[st]) statusPerDay[st] = Array(nbDays).fill(0);
          statusPerDay[st][idx] += 1;
        });
        const sortedStatuses = Object.entries(statusTotals).sort((a,b)=>b[1]-a[1]);
        const mainStatuses = sortedStatuses.slice(0,5).map(([k])=>k);
        const STATUS_COLORS = ['#60a5fa','#f59e0b','#f43f5e','#10b981','#a78bfa','#22d3ee','#64748b'];
        const datasetsStack = mainStatuses.map((st, i)=>({
          label: st,
          data: (statusPerDay[st] || Array(nbDays).fill(0)),
          backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length],
          borderWidth: 0,
          stack: 'statuses'
        }));
        // Agréger les autres statuts dans "AUTRES"
        const others = sortedStatuses.slice(5).map(([k])=>k);
        if (others.length > 0) {
          const otherData = Array(nbDays).fill(0);
          others.forEach((st)=>{
            const arr = statusPerDay[st] || Array(nbDays).fill(0);
            for (let i=0;i<nbDays;i++) otherData[i] += arr[i];
          });
          datasetsStack.push({ label: 'AUTRES', data: otherData, backgroundColor: '#64748b', borderWidth: 0, stack:'statuses' });
        }
        const chartStatusData = { labels, datasets: datasetsStack };
        const chartStatusOptions = {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position:'bottom', labels: { color:'#cbd5e1' } }, tooltip: { mode:'index', intersect:false } },
          scales: {
            x: { stacked: true, ticks: { color:'#93c5fd' }, grid:{ color:'rgba(255,255,255,0.08)' } },
            y: { stacked: true, beginAtZero:true, ticks: { color:'#93c5fd' }, grid:{ color:'rgba(255,255,255,0.08)' } }
          },
          animation: { duration: 600, easing: 'easeOutQuart' },
        };

        // Progression par agent (top 5 agents sur la période validée)
        const perAgentTotal: Record<string, number> = {};
        const perAgentDayAgg: Record<string, Record<string, number>> = {};
        validatedPeriod.forEach((s:any)=>{
          const d = toDate(s?.date)!; const ds = d.toISOString().slice(0,10);
          const agent = String(s?.name || s?.userName || s?.agent || 'Inconnu');
          perAgentTotal[agent] = (perAgentTotal[agent]||0)+1;
          if (!perAgentDayAgg[agent]) perAgentDayAgg[agent] = {};
          perAgentDayAgg[agent][ds] = (perAgentDayAgg[agent][ds]||0)+1;
        });
        const topAgents = Object.entries(perAgentTotal).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name])=>name);
        const AGENT_COLORS = ['#60a5fa','#f472b6','#34d399','#f59e0b','#a78bfa','#22d3ee'];
        const agentDatasets = topAgents.map((name, idx)=>{
          const data = labels.map((_, i)=>{
            const day = new Date(startDate + 'T00:00:00');
            day.setDate(day.getDate() + i);
            const ds = day.toISOString().slice(0,10);
            return perAgentDayAgg[name]?.[ds] || 0;
          });
          const color = AGENT_COLORS[idx % AGENT_COLORS.length];
          return { label: name, data, borderColor: color, backgroundColor: color + '22', pointBackgroundColor: color, fill: false, tension: 0.3 };
        });
        const chartAgentsData = { labels, datasets: agentDatasets };
        const chartAgentsOptions = {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position:'bottom', labels: { color:'#cbd5e1' } } },
          scales: { x: { ticks: { color:'#93c5fd' }, grid:{ color:'rgba(255,255,255,0.08)' } }, y: { ticks: { color:'#93c5fd' }, grid:{ color:'rgba(255,255,255,0.08)' }, beginAtZero:true, precision:0 } },
          animation: { duration: 600, easing: 'easeOutQuart' },
        };
        // Prépare aussi un dataset pour les ventes Canal+ seules (hors Ciné, Sport, 100%)
  // const canalOnlyData = salesByDay.canal.slice();
        // (chartDataCanalOnly et chartOptionsCanalOnly supprimés car non utilisés)
        // Calcul ventes du jour par agent Canal+
        const agentsMap: Record<string, { canal: number; cine: number; sport: number; cent: number; total: number }> = {};
        for (const s of validatedPeriod) {
          const d = toDate((s as any).date);
          if (!d) continue;
          if (d.toISOString().slice(0,10) !== endDate) continue; // tableau du jour = date de fin
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

        // Répartition des offres (jour) basée sur l'ensemble des ventes du jour (tous statuts)
        const offerCounters = { canal: 0, cine: 0, sport: 0, cent: 0 };
        for (const s of allPeriod) {
          const d = toDate((s as any).date);
          if (!d) continue;
          if (d.toISOString().slice(0,10) !== endDate) continue; // stats du jour = date de fin
          const offer = ((s as any).offer || (s as any).offre || '').toLowerCase();
          if (offer.includes('ciné') || offer.includes('cine')) offerCounters.cine++;
          else if (offer.includes('sport')) offerCounters.sport++;
          else if (offer.includes('100')) offerCounters.cent++;
          else offerCounters.canal++;
        }

        // Record de ventes sur une journée (sur la période)
        const dayMap: Record<string, { total: number; agentMap: Record<string, number> }> = {};
        for (const s of validatedPeriod) {
          const d = toDate((s as any).date);
          if (!d) continue;
          const dayStr = d.toISOString().slice(0,10);
          if (!dayMap[dayStr]) dayMap[dayStr] = { total: 0, agentMap: {} };
          dayMap[dayStr].total++;
          const agent = String((s as any).name || (s as any).userName || (s as any).agent || 'Inconnu');
          dayMap[dayStr].agentMap[agent] = (dayMap[dayStr].agentMap[agent] || 0) + 1;
        }
        let bestDay: { date: string; total: number; topAgent: string; topAgentCount: number } | null = null;
        const allDays: Array<{ date: string; total: number }> = [];
        Object.entries(dayMap).forEach(([date, { total, agentMap }]) => {
          allDays.push({ date, total });
          if (!bestDay || total > bestDay.total) {
            const topAgent = Object.entries(agentMap).sort((a,b)=>b[1]-a[1])[0] || ["—",0];
            bestDay = { date, total, topAgent: topAgent[0], topAgentCount: topAgent[1] };
          }
        });
        const topAgentsList = Object.entries(perSeller).map(([name, total]) => ({ name, total })).sort((a,b)=>b.total-a.total);
        // Smart alerts
        const latestDay = endDate;
        const todayCount = (dayMap[latestDay]?.total || 0);
        const values = allDays.map(d=>d.total);
        const avg = values.length ? (values.reduce((a,b)=>a+b,0) / values.length) : 0;
        const spike = values.length >= 4 && todayCount > Math.max(5, Math.round(avg * 1.5));
        // Pending/IBAN alerts (based on allPeriod statuses)
        const statusCount: Record<string, number> = {};
        allPeriod.forEach((s:any)=>{
          const st = String((s as any).basketStatus || '—').toUpperCase();
          statusCount[st] = (statusCount[st]||0)+1;
        });
        const totalAll = allPeriod.length || 1;
        const pendingLike = Object.entries(statusCount).filter(([k])=>/(PENDING|ATTENTE|WAIT|PANIER|EN COURS)/i.test(k));
        const ibanLike = Object.entries(statusCount).filter(([k])=>/(IBAN|RIB|PAIEMENT|PAYMENT|PAY|ECHEC|ÉCHEC|KO|ERROR|ERREUR|DECLIN)/i.test(k));
        const tooPending = pendingLike.reduce((a,[_k,v])=>a+v,0) / totalAll > 0.2 && pendingLike.length>0; // >20%
        const tooIban = ibanLike.reduce((a,[_k,v])=>a+v,0) > 5; // absolute threshold
        // Agent beating record (compare today's per-agent vs their previous max day)
        const perAgentDay: Record<string, Record<string, number>> = {};
        validatedPeriod.forEach((s:any)=>{
          const d = toDate((s as any).date)!; const ds = d.toISOString().slice(0,10);
          const agent = String((s as any).name || (s as any).userName || (s as any).agent || 'Inconnu');
          if (!perAgentDay[agent]) perAgentDay[agent] = {};
          perAgentDay[agent][ds] = (perAgentDay[agent][ds]||0)+1;
        });
        const recordAlerts: SmartAlert[] = [];
        Object.entries(perAgentDay).forEach(([agent, perDay])=>{
          const today = perDay[latestDay] || 0;
          const prevMax = Object.entries(perDay).filter(([d])=>d!==latestDay).reduce((m,[,_v])=>Math.max(m,_v),0);
          if (today>0 && today>prevMax && prevMax>0) {
            recordAlerts.push({ id: `rec-${agent}` , type:'record', title: 'Record battu', message: `${agent} bat son record journalier (${today} vs ${prevMax})`, severity:'success' });
          }
        });
        const nextAlerts: SmartAlert[] = [];
        if (spike) nextAlerts.push({ id:'spike', type:'spike', title:'Pic de ventes', message:`${todayCount} ventes aujourd'hui (> +50% moyenne ${avg.toFixed(1)})`, severity:'info' });
        if (tooPending) nextAlerts.push({ id:'pending', type:'pending', title:'Beaucoup de ventes en attente', message:`${pendingLike.reduce((a,[_k,v])=>a+v,0)} en attente`, severity:'warning' });
        if (tooIban) nextAlerts.push({ id:'iban', type:'iban', title:'Erreurs IBAN/paiement', message:`${ibanLike.reduce((a,[_k,v])=>a+v,0)} erreurs détectées`, severity:'danger' });
        if (!cancelled) {
          setKpi({ daySales: dayCount, weekSales: weekCount, conversion, topSeller: top[0]?.[0] || '—', monthSales: validatedPeriod.length });
          setTopSellers(top.slice(0, 5));
          setChartMonth({ data: chartData, options: chartOptions });
          setChartStatus({ data: chartStatusData, options: chartStatusOptions });
          setChartAgents({ data: chartAgentsData, options: chartAgentsOptions });
          // setChartCanalOnly({ data: chartDataCanalOnly, options: chartOptionsCanalOnly });
          setCanalDayByAgent(canalDayRows);
          setDayOffers(offerCounters);
          setRecordDay(bestDay);
          setRecordDays(allDays.sort((a,b)=>b.total-a.total));
          setRecordAgents(topAgentsList);
          setAlerts([...nextAlerts, ...recordAlerts]);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'Erreur chargement KPIs'); setLoading(false); }
      }
    };
    const cleanupOrPromise = run();
    return () => { cancelled = true; try { (cleanupOrPromise as any)?.(); } catch {} };
  }, [effectiveArea, startDate, endDate, regionOverride, selectedOffers, selectedStatuses, selectedAgents]);

  // Historique des meilleurs mois (sur l'ensemble des ventes validées)
  React.useEffect(() => {
    let active = true;
    const run = async () => {
      if (effectiveArea === 'LEADS') return;
      try {
        const region = (regionOverride || (effectiveArea as 'FR'|'CIV')) as 'FR'|'CIV';
        const { getAllValidatedSales } = await import('../services/salesService');
        const all = await getAllValidatedSales(region);
        const toDate = (v:any)=> (v?.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v)));
        const byMonth: Record<string, number> = {};
        for (const s of all) {
          const d = toDate((s as any).date); if (!d || isNaN(d.getTime())) continue;
          const key = d.toLocaleDateString('fr-FR', { month:'2-digit', year:'numeric' });
          byMonth[key] = (byMonth[key]||0)+1;
        }
        const topMonths = Object.entries(byMonth).map(([month,total])=>({ month, total })).sort((a,b)=>b.total-a.total).slice(0,5);
        if (active) setRecordMonths(topMonths);
      } catch {
        /* noop */
      }
    };
    run();
    return () => { active = false; };
  }, [effectiveArea, regionOverride]);

  // Helpers UI
  const applyDates = () => {
    setDateError(null);
    if (!draftStart || !draftEnd) { setDateError('Dates invalides'); return; }
    if (draftStart > draftEnd) { setDateError('La date de début doit être ≤ date de fin'); return; }
    if (draftEnd > todayStr) { setDateError("La date de fin ne peut pas être dans le futur"); return; }
    setStartDate(draftStart);
    setEndDate(draftEnd);
  };
  const startObj = new Date(startDate + 'T00:00:00');
  const endObj = new Date(endDate + 'T00:00:00');
  const periodDays = Math.max(1, Math.round((+endObj - +startObj) / (1000*60*60*24)) + 1);
  const periodLabel = periodDays === 7 ? 'Ventes 7j' : 'Ventes (période)';

  return (
    <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6">
      {/* Filtres avancés */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1f3f]/70 via-[#0c2752]/60 to-[#0a2752]/60 p-4 sm:p-5 flex flex-col gap-4 shadow-[0_12px_32px_-8px_rgba(8,28,60,0.55)]">
        <div className="flex items-center gap-3 flex-wrap leading-relaxed">
          <label className="text-blue-200">Période :</label>
          <input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)} className="rounded px-2 py-1 bg-[#0a1430] text-white border border-white/10" max={draftEnd} />
          <span className="text-blue-200">au</span>
          <input type="date" value={draftEnd} onChange={e => setDraftEnd(e.target.value)} className="rounded px-2 py-1 bg-[#0a1430] text-white border border-white/10" min={draftStart} max={todayStr} />
          <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-blue-100">{periodDays} j</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap leading-relaxed">
          <label className="text-blue-200">Région :</label>
          <select value={regionOverride} onChange={(e)=>{ const v = e.target.value as any; setRegionOverride(v); try { if (v) localStorage.setItem('activeRegion', v); } catch {} }} className="rounded px-2 py-1 bg-[#0a1430] text-white border border-white/10">
            <option value="">Auto ({(effectiveArea==='LEADS'?'LEADS':effectiveArea)})</option>
            <option value="FR">FR</option>
            <option value="CIV">CIV</option>
          </select>
          <span className="h-5 w-px bg-white/10 mx-2" />
          <label className="text-blue-200">Offres :</label>
          {(['canal','cine','sport','cent'] as const).map(k => (
            <label key={k} className="inline-flex items-center gap-1 text-blue-100/90 text-sm">
              <input type="checkbox" checked={selectedOffers.has(k)} onChange={()=>setSelectedOffers(prev=>{ const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n; })} />
              <span className="capitalize">{k}</span>
            </label>
          ))}
          <span className="h-5 w-px bg-white/10 mx-2" />
          <label className="text-blue-200">Statuts :</label>
          <div className="flex gap-2 flex-wrap">
            {availableStatuses.slice(0,8).map(st => (
              <button key={st} onClick={()=>setSelectedStatuses(prev=>{ const n=new Set(prev); n.has(st)?n.delete(st):n.add(st); return n; })} className={`rounded-full px-2 py-0.5 text-xs border ${selectedStatuses.has(st)?'bg-white/20 border-white/40':'bg-white/5 border-white/10'} hover:bg-white/15`}>{st}</button>
            ))}
          </div>
          <span className="h-5 w-px bg-white/10 mx-2" />
          <label className="text-blue-200">Agents :</label>
          <div className="flex gap-2 overflow-x-auto max-w-full">
            {availableAgents.slice(0,10).map(ag => (
              <button key={ag} onClick={()=>setSelectedAgents(prev=>{ const n=new Set(prev); n.has(ag)?n.delete(ag):n.add(ag); return n; })} className={`rounded-full px-2 py-0.5 text-xs border whitespace-nowrap ${selectedAgents.has(ag)?'bg-white/20 border-white/40':'bg-white/5 border-white/10'} hover:bg-white/15`}>{ag}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dateError && <span className="text-rose-300 text-xs mr-2">{dateError}</span>}
          <button onClick={applyDates} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500/70 to-blue-500/70 hover:from-cyan-500 hover:to-blue-500 border border-white/10 shadow-[0_8px_24px_rgba(56,189,248,0.35)]">Appliquer</button>
        </div>
      </div>
      {/* Smart alerts */}
      <AlertsPanel alerts={alerts} />
      {/* Record de ventes sur une journée */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a152a] via-[#09172f] to-[#071326] p-5 mb-6 flex flex-col items-start">
        <h3 className="text-lg font-semibold mb-1">🏆 Record de ventes sur une journée</h3>
        <p className="text-blue-100">
          {recordDay
            ? <>Le <b>{new Date(recordDay.date).toLocaleDateString('fr-FR')}</b> avec <b>{recordDay.total}</b> ventes.<br/>
              Top agent : <b>{recordDay.topAgent}</b> ({recordDay.topAgentCount} ventes)</>
            : "Calcul en cours…"}
        </p>
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${effectiveArea === 'CIV' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-5 md:gap-6`}>
        {effectiveArea === 'CIV' && (
          <KpiCard
            label="Ventes (mois)"
            subtitle="CIV"
            gradient="from-[#102338] via-[#0d1c2c] to-[#081221]"
            accent="text-cyan-200"
            value={loading ? <Spinner size={20} /> : <CountUp end={kpi.monthSales} duration={0.6} />}
          />
        )}
        <KpiCard
          label="Ventes jour"
          accent="text-emerald-200"
          gradient="from-[#101b29] via-[#0a1320] to-[#050a13]"
          value={loading ? <Spinner size={20} /> : <CountUp end={kpi.daySales} duration={0.6} />}
        />
        <KpiCard
          label={periodLabel}
          accent="text-blue-200"
          gradient="from-[#0a152a] via-[#09172f] to-[#071326]"
          value={loading ? <Spinner size={20} /> : <CountUp end={kpi.weekSales} duration={0.6} />}
        />
        <KpiCard
          label="Taux conv."
          accent="text-purple-200"
          gradient="from-[#140f2a] via-[#1a1235] to-[#0d0a1f]"
          value={loading ? '…' : kpi.conversion}
        />
      </div>
      {effectiveArea === 'LEADS' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-6">
          <div className="bg-white/10 rounded-xl p-5 border border-white/10">
            <p className="text-blue-200 text-sm">Opportunity (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.opportunity}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-5 border border-white/10">
            <p className="text-blue-200 text-sm">Dolead (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.doleadd}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-5 border border-white/10">
            <p className="text-blue-200 text-sm">MM (jour)</p>
            <p className="text-3xl font-extrabold">{loading ? '…' : leadDayByOrigin.mm}</p>
          </div>
        </div>
      )}
      {/* Historique période - pleine largeur */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a152a] via-[#09172f] to-[#071326] p-6 md:p-7 shadow-[0_18px_46px_-10px_rgba(30,64,175,0.35)]">
        <div className="flex flex-row justify-between items-center mb-2">
          <div>
            <h2 className="text-white text-2xl font-bold leading-tight mb-0">Historique période</h2>
            <p className="text-[#b2becd] text-base font-normal mt-1 mb-0">Évolution des ventes Canal+ (toutes offres) sur la période sélectionnée.</p>
          </div>
          <span className="text-[#b2becd] text-sm font-medium">Période : {new Date(startDate).toLocaleDateString('fr-FR')} — {new Date(endDate).toLocaleDateString('fr-FR')} • {periodDays} j</span>
        </div>
        <div className="h-96 mt-2">
          {chartMonth ? (
            <ChartComponent type="line" data={chartMonth.data} options={chartMonth.options} height={360} />
          ) : (
            <div className="h-full flex items-center justify-center text-blue-300">…</div>
          )}
        </div>
      </div>

      {/* Top vendeurs - sous le graphe */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a152a] via-[#09172f] to-[#071326] p-5 mb-6">
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
      {/* Historique des records (jours/agents/mois) */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a152a] via-[#09172f] to-[#071326] p-4 md:p-5 mb-6">
        <RecordsHistory days={recordDays} agents={recordAgents} months={recordMonths} />
      </div>
      {/* Répartition des offres (jour) */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#071227]/75 via-[#050c1a]/70 to-[#030711]/75 p-6 md:p-7 backdrop-blur-xl shadow-[0_28px_70px_-12px_rgba(8,20,40,0.65)] space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Répartition des offres (jour)</h2>
            <p className="text-sm text-blue-100/70">CANAL+, Ciné Séries, Sport, 100%</p>
          </div>
        </div>
        <div className="mt-5 grid gap-6 md:gap-7 md:grid-cols-2">
          <div className="h-[300px] rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col">
            <div className="flex-1 flex items-center justify-center">
              <ChartComponent
                type="doughnut"
                data={{
                  labels: ['CANAL+','CANAL+ Ciné Séries','CANAL+ Sport','CANAL+ 100%'],
                  datasets: [{
                    data: [dayOffers.canal, dayOffers.cine, dayOffers.sport, dayOffers.cent],
                    backgroundColor: [COLORS.canalSolid, COLORS.cine, COLORS.sport, COLORS.cent],
                    borderWidth: 0,
                  }],
                }}
                options={{
                  plugins: { legend: { display: false } },
                  cutout: '60%'
                }}
              />
            </div>
            {/* Légende custom pour un contrôle total des couleurs */}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-blue-100/80">
              {[{label:'CANAL+', color:COLORS.canalSolid}, {label:'CANAL+ Ciné Séries', color:COLORS.cine}, {label:'CANAL+ Sport', color:COLORS.sport}, {label:'CANAL+ 100%', color:COLORS.cent}].map(i => (
                <div key={i.label} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-6 rounded-sm" style={{ background:i.color }} />
                  <span>{i.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 content-start">
            <div className="relative rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: `linear-gradient(90deg, ${COLORS.canalGradientFrom}, ${COLORS.canalGradientTo})` }} />
              <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">CANAL+</p>
              <p className="text-2xl font-semibold">{dayOffers.canal}</p>
            </div>
            <div className="relative rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: COLORS.cine }} />
              <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">CANAL+ Ciné Séries</p>
              <p className="text-2xl font-semibold">{dayOffers.cine}</p>
            </div>
            <div className="relative rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: COLORS.sport }} />
              <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">CANAL+ Sport</p>
              <p className="text-2xl font-semibold">{dayOffers.sport}</p>
            </div>
            <div className="relative rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="absolute left-0 right-0 top-0 h-1 rounded-t-xl" style={{ background: COLORS.cent }} />
              <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">CANAL+ 100%</p>
              <p className="text-2xl font-semibold">{dayOffers.cent}</p>
            </div>
          </div>
        </div>
      </div>
      {/* Tableau ventes du jour par agent Canal+ (style inspiré du screen fourni) */}
      {/* Analyses supplémentaires: Statuts (période) & Progression par agent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mt-10">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a152a] via-[#09172f] to-[#071326] p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Répartition des statuts par jour (période)</h3>
          </div>
          <div className="h-[300px]">
            {chartStatus ? (
              <ChartComponent type="bar" data={chartStatus.data} options={chartStatus.options} height={260} />
            ) : (
              <div className="h-full flex items-center justify-center text-blue-300">—</div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a152a] via-[#09172f] to-[#071326] p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white text-lg font-semibold">Progression par agent (période)</h3>
          </div>
          <div className="h-[300px]">
            {chartAgents ? (
              <ChartComponent type="line" data={chartAgents.data} options={chartAgents.options} height={260} />
            ) : (
              <div className="h-full flex items-center justify-center text-blue-300">—</div>
            )}
          </div>
        </div>
      </div>

      {/* Tableau ventes du jour par agent Canal+ (style inspiré du screen fourni) */}
      <div className="bg-[#172635] rounded-3xl border border-[#22334a] p-6 md:p-7 mt-10 shadow-[0_22px_54px_-10px_rgba(15,35,55,0.6)]">
        <div className="flex flex-row justify-between items-center mb-2">
          <div>
            <h2 className="text-white text-2xl font-bold leading-tight mb-0">Ventes du jour par agent</h2>
            <p className="text-[#b2becd] text-base font-normal mt-1 mb-0">Canal+, Canal+ Ciné Séries, Canal+ Sport, Canal+ 100% consolidés.</p>
          </div>
          <span className="text-[#b2becd] text-sm font-medium">Actualisation automatique</span>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="min-w-full text-sm md:text-base text-blue-100">
            <thead>
              <tr className="border-b border-[#22334a] bg-[#1e3147] text-xs md:text-sm">
                <th className="py-3 px-4 text-left tracking-wider font-semibold text-blue-200">AGENT</th>
                <th className="py-3 px-4 text-center tracking-wider font-semibold text-blue-200">CANAL+</th>
                <th className="py-3 px-4 text-center tracking-wider font-semibold text-blue-200">CINÉ SÉRIES</th>
                <th className="py-3 px-4 text-center tracking-wider font-semibold text-blue-200">SPORT</th>
                <th className="py-3 px-4 text-center tracking-wider font-semibold text-blue-200">100% CANAL</th>
                <th className="py-3 px-4 text-center tracking-wider font-semibold text-blue-200">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {canalDayByAgent.length === 0
                ? [<tr key="empty"><td colSpan={6} className="py-6 px-4 text-center text-blue-300">Aucun résultat</td></tr>]
                : canalDayByAgent.map((row, idx) => (
                    <tr key={row.agent} className={`border-b border-[#22334a] hover:bg-[#22334a]/40 transition-colors ${idx % 2 === 0 ? 'bg-[#1a2b40]/40' : ''}`}> 
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">{row.agent}</td>
                      <td className="py-3 px-4 text-center">{row.canal}</td>
                      <td className="py-3 px-4 text-center">{row.cine}</td>
                      <td className="py-3 px-4 text-center">{row.sport}</td>
                      <td className="py-3 px-4 text-center">{row.cent}</td>
                      <td className="py-3 px-4 text-center font-bold text-white">{row.total}</td>
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
