import React from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Types for internal aggregation
type OriginKey = 'opportunity' | 'dolead' | 'mm';
interface Counts { sales: number; received: number; }
interface OriginStats extends Counts { origin: OriginKey; }

const ORIGINS: OriginKey[] = ['opportunity', 'dolead', 'mm'];

// Helper to start of day/month boundaries
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
const startOfNextMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth()+1, 1, 0,0,0,0);
const dateKey = (d = new Date()) => d.toISOString().slice(0,10);

interface LeadInflowConversionPanelProps { className?: string; region?: 'FR'|'CIV'; }

/**
 * Panel computing ratio Ventes / Reçus (jour & mois) par origine + global.
 * Expects a Firestore collection 'leads_inflow' with documents shaped like:
 * { date: 'YYYY-MM-DD', month: 'YYYY-MM', origin: 'opportunity'|'dolead'|'mm', received: number, mission: 'ORANGE_LEADS', region: 'FR'|'CIV', createdAt: TS }
 * If collection or docs are absent, received counts default to 0 and ratios show '--'.
 */
const LeadInflowConversionPanel: React.FC<LeadInflowConversionPanelProps> = ({ className = '', region }) => {
  const [mode, setMode] = React.useState<'day'|'month'>('day');
  // Month selector (like Leads+): last 6 months, default current month
  const monthOptions = React.useMemo(() => {
    const options: Array<{ label: string; value: string; date: Date }> = [];
    const current = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
      const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      options.push({ label, value, date: d });
    }
    return options;
  }, []);
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  });
  const selectedMonthDate = React.useMemo(() => {
    const parsed = new Date(selectedMonth);
    if (isNaN(parsed.getTime())) {
      const d = new Date(); d.setDate(1); return d;
    }
    return parsed;
  }, [selectedMonth]);
  // Loading state only for API ("reçus"); sales load via Firestore snapshot independently
  const [loadingApi, setLoadingApi] = React.useState(true);
  const [error, setError] = React.useState<string|null>(null);
  const [stats, setStats] = React.useState<Record<OriginKey, Counts>>({ opportunity:{sales:0,received:0}, dolead:{sales:0,received:0}, mm:{sales:0,received:0} });

  // Helpers from Leads+ to call the same API
  const parseJsonResponse = React.useCallback(async (res: Response) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text) return {} as any;
    try { return JSON.parse(text); } catch { throw new Error('Réponse non JSON'); }
  }, []);

  const parseLeadStats = React.useCallback((json: any): Record<OriginKey, number> => {
    // Returns received counts per origin
    const out: Record<OriginKey, number> = { opportunity: 0, dolead: 0, mm: 0 };
    if (json?.RESPONSE === 'OK' && Array.isArray(json?.DATA)) {
      const find = (type: string) => {
        const m = json.DATA.find((it: any) => it && String(it.type).toLowerCase() === type);
        return m && typeof m.count === 'number' ? Number(m.count) : 0;
      };
      out.dolead = find('dolead');
      out.opportunity = find('opportunity') || find('hipto');
      out.mm = find('mm');
    } else {
      if (typeof json?.dolead === 'number') out.dolead = Number(json.dolead) || 0;
      if (typeof json?.opportunity === 'number') out.opportunity = Number(json.opportunity) || 0;
      if (typeof json?.hipto === 'number') out.opportunity = Number(json.hipto) || out.opportunity;
      if (typeof json?.mm === 'number') out.mm = Number(json.mm) || 0;
    }
    return out;
  }, []);

  const endpoints = React.useMemo(() => [
    '/api/leads-stats-forward',
    '/api/leads-stats',
  ] as const, []);

  const withQueryParams = React.useCallback((base: string, params: Record<string,string>) => {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${new URLSearchParams(params).toString()}`;
  }, []);

  React.useEffect(() => {
    setLoadingApi(true); setError(null);
    const todayStart = startOfDay();
    const mStart = startOfMonth(selectedMonthDate);
    const nextMonth = startOfNextMonth(selectedMonthDate);
    // Sales counts from Firestore (same as avant)
    const salesQ = mode === 'day'
      ? query(collection(db,'leads_sales'), where('mission','==','ORANGE_LEADS'), where('createdAt','>=', Timestamp.fromDate(todayStart)))
      : query(collection(db,'leads_sales'), where('mission','==','ORANGE_LEADS'), where('createdAt','>=', Timestamp.fromDate(mStart)), where('createdAt','<', Timestamp.fromDate(nextMonth)));

    const salesUnsub = onSnapshot(salesQ, snap => {
      const base: Record<OriginKey, Counts> = { opportunity:{sales:0,received:0}, dolead:{sales:0,received:0}, mm:{sales:0,received:0} };
      snap.forEach(doc => {
        const data = doc.data() as any;
        const originRaw = (data?.origineLead||'').toLowerCase();
        if (originRaw === 'opportunity' || originRaw === 'dolead' || originRaw === 'mm') {
          base[originRaw as OriginKey].sales += 1; // each doc is a sale
        }
      });
      setStats(prev => ({ opportunity:{...prev.opportunity, sales: base.opportunity.sales}, dolead:{...prev.dolead, sales: base.dolead.sales}, mm:{...prev.mm, sales: base.mm.sales} }));
    }, err => { setError((err as any)?.message||'Erreur chargement ventes'); setLoadingApi(false); });
    // Inflow via Leads+ API (with fallback: proxy -> normalized)
    let aborted = false;
    const controller = new AbortController();
    let useFallback = false; // if first call to proxy fails, use normalized endpoint for rest

    const fetchStatsForRange = async (startIso: string, endIso: string) => {
      const tryOnce = async (base: string) => {
        const url = withQueryParams(base, { date_start: startIso, date_end: endIso });
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await parseJsonResponse(res);
        return parseLeadStats(json);
      };
      if (!useFallback) {
        try {
          return await tryOnce(endpoints[0]);
        } catch (e) {
          useFallback = true; // switch for subsequent calls
        }
      }
      // fallback
      try {
        return await tryOnce(endpoints[1]);
      } catch (e) {
        // Last-resort: return zeros so UI doesn't hang
        return { opportunity: 0, dolead: 0, mm: 0 } as Record<OriginKey, number>;
      }
    };
    const fetchInflow = async () => {
      try {
        let received: Record<OriginKey, number> = { opportunity:0, dolead:0, mm:0 };
        if (mode === 'day') {
          received = await fetchStatsForRange(dateKey(), dateKey());
        } else {
          // Aggregate current month by summing per-day (API supports day filters)
          const base = selectedMonthDate;
          const daysInMonth = new Date(base.getFullYear(), base.getMonth()+1, 0).getDate();
          const start = new Date(base.getFullYear(), base.getMonth(), 1);
          const acc: Record<OriginKey, number> = { opportunity:0, dolead:0, mm:0 };
          for (let d = 1; d <= daysInMonth; d++) {
            const cur = new Date(start.getFullYear(), start.getMonth(), d);
            const iso = cur.toISOString().slice(0,10);
            const dayCounts = await fetchStatsForRange(iso, iso);
            acc.dolead += dayCounts.dolead;
            acc.opportunity += dayCounts.opportunity;
            acc.mm += dayCounts.mm;
          }
          received = acc;
        }
        if (aborted) return;
        setStats(prev => ({
          opportunity:{ ...prev.opportunity, received: received.opportunity },
          dolead:{ ...prev.dolead, received: received.dolead },
          mm:{ ...prev.mm, received: received.mm },
        }));
      } catch (e: any) {
        if (!aborted) setError(e?.message || 'Erreur API leads+');
      } finally {
        if (!aborted) setLoadingApi(false);
      }
    };
    fetchInflow();

    return () => { aborted = true; try { salesUnsub(); } catch {}; controller.abort(); };
  }, [mode, region, selectedMonthDate]);

  const originCards: OriginStats[] = ORIGINS.map(o => ({ origin: o, ...stats[o] }));
  const totalSales = originCards.reduce((a,s)=>a+s.sales,0);
  const totalReceived = originCards.reduce((a,s)=>a+s.received,0);
  const overallRatio = totalReceived>0 ? (totalSales/totalReceived) : 0;

  const formatRatio = (sales:number, received:number) => {
    if (received === 0) return '--';
    return `${(sales/received*100).toFixed(1)}%`; // percentage conversion
  };

  return (
    <section className={`rounded-3xl border border-white/10 bg-gradient-to-br from-[#071227]/70 via-[#050c1a]/70 to-[#030711]/70 p-6 backdrop-blur-xl text-white shadow-[0_24px_60px_rgba(8,20,40,0.55)] ${className}`}>      
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ventes / Reçus ({mode === 'day' ? 'Jour' : 'Mois'})</h2>
          <p className="text-sm text-blue-100/70">Ratio conversion des ventes sur le volume reçu (imports leads). Affiché par origine + global.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-white/10">
            <button onClick={()=>setMode('day')} className={`px-3 py-1 text-xs font-medium ${mode==='day'?'bg-cyan-500/30 text-white':'bg-white/10 text-blue-100/80 hover:bg-white/15'}`}>Jour</button>
            <button onClick={()=>setMode('month')} className={`px-3 py-1 text-xs font-medium ${mode==='month'?'bg-cyan-500/30 text-white':'bg-white/10 text-blue-100/80 hover:bg-white/15'}`}>Mois</button>
          </div>
          {mode === 'month' && (
            <div className="ml-2 flex items-center gap-2 text-xs">
              <label htmlFor="leads-month" className="text-blue-200/70">Mois</label>
              <select
                id="leads-month"
                value={selectedMonth}
                onChange={(e)=>setSelectedMonth(e.target.value)}
                className="rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1 text-xs text-white focus:border-cyan-300 focus:outline-none"
              >
                {monthOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label.charAt(0).toUpperCase()+opt.label.slice(1)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="text-xs rounded-lg border border-white/10 bg-white/10 px-2 py-1">Global: {totalReceived>0 ? `${(overallRatio*100).toFixed(1)}%` : '--'}</div>
        </div>
      </div>
      {error && <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">{error}</div>}
      <div className="mt-5 grid gap-5 md:grid-cols-3" role="table" aria-label="Conversion par origine">
        {originCards.map(card => {
          const ratioPct = card.received>0 ? (card.sales/card.received)*100 : 0;
          return (
            <article key={card.origin} role="row" className="group relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-[#081225] via-[#0c1831] to-[#0b1530] p-5 shadow-[0_18px_42px_rgba(12,32,78,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/60 hover:shadow-[0_24px_52px_rgba(56,189,248,0.35)]">
              <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_60%)] group-hover:opacity-45 transition duration-300" />
              <div className="relative flex flex-col gap-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold capitalize">{card.origin}</h3>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-blue-100/70">{mode==='day'?'Jour':'Mois'}</span>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{formatRatio(card.sales, card.received)}</p>
                  <p className="text-[11px] text-blue-100/60">Ratio ventes / reçus</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-blue-100/70"><span>Ventes</span><span>{card.sales}</span></div>
                  <div className="flex justify-between text-blue-100/70"><span>Reçus</span><span>{loadingApi?'--':card.received}</span></div>
                </div>
                <div className="mt-2 h-3 w-full rounded-full bg-[#0d223f] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-blue-600 transition-[width] duration-700" style={{ width: `${Math.min(100, ratioPct)}%` }} aria-hidden="true" />
                  <span className="sr-only">{card.origin} conversion {ratioPct.toFixed(1)}%</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {/* Info removed as requested */}
    </section>
  );
};

export default LeadInflowConversionPanel;