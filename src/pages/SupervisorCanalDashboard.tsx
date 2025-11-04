import React from 'react';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import ChartComponent from '../components/ChartComponent';

type CanalStatusKey = 'valide' | 'attente' | 'iban' | 'roac' | 'autre';

type Kpis = Record<CanalStatusKey, number> & { total: number };

type OfferKey = 'CANAL+' | 'CANAL+ Ciné Séries' | 'CANAL+ Sport' | 'CANAL+ 100%';

const emptyKpis = (): Kpis => ({ valide: 0, attente: 0, iban: 0, roac: 0, autre: 0, total: 0 });

const normalizeStatus = (raw: any): CanalStatusKey => {
  const s = String(raw || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (s === 'ok' || s === 'valid finale' || s === 'validsoft' || s === 'valid soft' || s === 'valide') return 'valide';
  if (s.includes('iban')) return 'iban';
  if (s.includes('roac')) return 'roac';
  if (s.includes('attente') || s === 'enattente' || s === 'att') return 'attente';
  return 'autre';
};

const normalizeOffer = (raw: any): OfferKey | null => {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (/(cines|serie)/.test(s)) return 'CANAL+ Ciné Séries';
  if (/sport/.test(s)) return 'CANAL+ Sport';
  if (/100/.test(s)) return 'CANAL+ 100%';
  if (/canal/.test(s)) return 'CANAL+';
  return null;
};

const Card: React.FC<{ title: string; value: number | string; subtitle?: string; accent?: string }>
  = ({ title, value, subtitle, accent = 'from-sky-900/30 via-sky-800/20 to-sky-700/10' }) => (
  <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-5 shadow-[0_20px_60px_rgba(8,24,60,0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(56,189,248,0.25)]`}> 
    <div className="absolute inset-0 opacity-30 bg-[radial-gradient(650px_200px_at_0%_0%,rgba(56,189,248,0.15),transparent),radial-gradient(600px_200px_at_100%_100%,rgba(37,99,235,0.15),transparent)]" />
    <div className="relative">
      <p className="text-[11px] uppercase tracking-[0.3em] text-blue-100/70">{title}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-blue-100/60">{subtitle}</p>}
    </div>
  </div>
);

const SupervisorCanalDashboard: React.FC = () => {
  const [region, setRegion] = React.useState<'FR' | 'CIV'>(() => {
    try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase() === 'CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; }
  });
  const [menuOpen, setMenuOpen] = React.useState(false);

  // KPIs jour
  const [dayKpis, setDayKpis] = React.useState<Kpis>(emptyKpis());
  const [dayOffers, setDayOffers] = React.useState<Record<OfferKey, number>>({
    'CANAL+': 0, 'CANAL+ Ciné Séries': 0, 'CANAL+ Sport': 0, 'CANAL+ 100%': 0,
  });
  const [loadingDay, setLoadingDay] = React.useState(true);

  // KPIs mois + séries
  const [monthKpis, setMonthKpis] = React.useState<Kpis>(emptyKpis());
  const [series, setSeries] = React.useState<{ labels: string[]; data: number[] } | null>(null);
  const [loadingMonth, setLoadingMonth] = React.useState(true);

  // Sub jour
  React.useEffect(() => {
    const start = new Date(); start.setHours(0,0,0,0);
    setLoadingDay(true);
    const qRef = query(
      collection(db, 'sales'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('region', '==', region),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(qRef, (snap) => {
      const k = emptyKpis();
      const offers: Record<OfferKey, number> = { 'CANAL+':0, 'CANAL+ Ciné Séries':0, 'CANAL+ Sport':0, 'CANAL+ 100%':0 };
      snap.forEach(d => {
        const data: any = d.data();
        const st = normalizeStatus(data?.basketStatus || data?.basketStatut || data?.status || data?.statut);
        k[st] += 1; k.total += 1;
        const off = normalizeOffer(data?.offer || data?.offre);
        if (off) offers[off] = (offers[off] || 0) + 1;
      });
      setDayKpis(k);
      setDayOffers(offers);
      setLoadingDay(false);
    }, () => setLoadingDay(false));
    return () => { try { unsub(); } catch {} };
  }, [region]);

  // Sub mois
  React.useEffect(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
    const next = new Date(now.getFullYear(), now.getMonth()+1, 1, 0,0,0,0);
    setLoadingMonth(true);
    const qRef = query(
      collection(db, 'sales'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<', Timestamp.fromDate(next)),
      where('region', '==', region),
      orderBy('date', 'asc')
    );
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const dayBuckets = Array(daysInMonth).fill(0);
    const unsub = onSnapshot(qRef, (snap) => {
      const k = emptyKpis();
      dayBuckets.fill(0);
      snap.forEach(d => {
        const data: any = d.data();
        const st = normalizeStatus(data?.basketStatus || data?.basketStatut || data?.status || data?.statut);
        k[st] += 1; k.total += 1;
        const ts: Timestamp | null = data?.date ?? null;
        if (ts) {
          const dt = (ts as Timestamp).toDate();
          const idx = dt.getDate()-1; if (idx>=0 && idx<daysInMonth) dayBuckets[idx] += 1;
        }
      });
      setMonthKpis(k);
      const labels = Array.from({length: daysInMonth}, (_,i)=> String(i+1).padStart(2,'0'));
      setSeries({ labels, data: [...dayBuckets] });
      setLoadingMonth(false);
    }, () => setLoadingMonth(false));
    return () => { try { unsub(); } catch {} };
  }, [region]);

  const offerPieData = React.useMemo(() => ({
    labels: Object.keys(dayOffers),
    datasets: [{
      data: Object.values(dayOffers),
      backgroundColor: ['#111827', '#1f2937', '#0ea5e9', '#f59e0b'],
      borderWidth: 0,
    }],
  }), [dayOffers]);

  const monthLineData = React.useMemo(() => series ? ({
    labels: series.labels,
    datasets: [{
      label: 'Ventes/jour',
      data: series.data,
      borderColor: '#60a5fa',
      backgroundColor: 'rgba(96,165,250,0.18)',
      borderWidth: 2,
      tension: 0.3,
      fill: true,
    }],
  }) : null, [series]);

  // Classement télévendeurs (mois)
  const [agents, setAgents] = React.useState<Array<{ agent: string; total: number; valide: number }>>([]);
  React.useEffect(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const next = new Date(now.getFullYear(), now.getMonth()+1, 1);
    const qRef = query(
      collection(db, 'sales'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<', Timestamp.fromDate(next)),
      where('region', '==', region)
    );
    const unsub = onSnapshot(qRef, (snap) => {
      const map = new Map<string, { total:number; valide:number }>();
      snap.forEach(d => {
        const data:any = d.data();
        const name = (data?.name || data?.userName || data?.agent || '—').toString();
        const st = normalizeStatus(data?.basketStatus || data?.basketStatut || data?.status || data?.statut);
        const cur = map.get(name) || { total:0, valide:0 };
        cur.total += 1; if (st === 'valide') cur.valide += 1;
        map.set(name, cur);
      });
      const arr = Array.from(map.entries()).map(([agent,v]) => ({ agent, total: v.total, valide: v.valide }))
        .sort((a,b)=> b.valide - a.valide).slice(0, 15);
      setAgents(arr);
    });
    return () => { try { unsub(); } catch {} };
  }, [region]);

  return (
    <div className="space-y-8 p-6 text-white">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard Canal+</h1>
          <p className="text-blue-200/80 text-sm">Suivi temps réel des ventes Canal+ — {region}</p>
        </div>
        <div className="relative">
          <button onClick={()=>setMenuOpen(v=>!v)} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-blue-100 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/50">
            Région — {region}
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#0a1430] shadow-xl">
              <button className={`block w-full px-4 py-2 text-left text-sm hover:bg-white/10 ${region==='FR'?'text-white':'text-blue-100/90'}`} onClick={()=>{setRegion('FR'); try{localStorage.setItem('activeRegion','FR');}catch{}; setMenuOpen(false);}}>FR</button>
              <button className={`block w-full px-4 py-2 text-left text-sm hover:bg-white/10 ${region==='CIV'?'text-white':'text-blue-100/90'}`} onClick={()=>{setRegion('CIV'); try{localStorage.setItem('activeRegion','CIV');}catch{}; setMenuOpen(false);}}>CIV</button>
            </div>
          )}
        </div>
      </header>

      {/* KPIs jour */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card title="Validées (jour)" value={loadingDay?'--':dayKpis.valide} accent="from-emerald-900/25 via-emerald-800/15 to-emerald-700/10" />
        <Card title="En attente (jour)" value={loadingDay?'--':dayKpis.attente} accent="from-yellow-900/25 via-yellow-800/15 to-yellow-700/10" />
        <Card title="IBAN (jour)" value={loadingDay?'--':dayKpis.iban} accent="from-pink-900/25 via-pink-800/15 to-pink-700/10" />
        <Card title="ROAC (jour)" value={loadingDay?'--':dayKpis.roac} accent="from-fuchsia-900/25 via-fuchsia-800/15 to-fuchsia-700/10" />
        <Card title="Total (jour)" value={loadingDay?'--':dayKpis.total} />
      </section>

      {/* Répartition offres jour */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#071227]/70 via-[#050c1a]/70 to-[#030711]/70 p-6 backdrop-blur-xl shadow-[0_24px_60px_rgba(8,20,40,0.55)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Répartition des offres (jour)</h2>
            <p className="text-sm text-blue-100/70">CANAL+, Ciné Séries, Sport, 100%</p>
          </div>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="h-[280px] rounded-2xl border border-white/10 bg-white/5 p-4">
            <ChartComponent type="doughnut" data={offerPieData} />
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            {Object.entries(dayOffers).map(([label, v]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">{label}</p>
                <p className="text-2xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Historique mensuel */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#08142b]/70 via-[#061024]/70 to-[#030812]/70 p-6 backdrop-blur-xl shadow-[0_26px_65px_rgba(8,20,40,0.55)]">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Historique mensuel</h2>
            <p className="text-sm text-blue-100/70">Somme des ventes par jour — {new Date().toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</p>
          </div>
          <div className="grid grid-cols-5 gap-3 w-full md:w-auto mt-3 md:mt-0">
            <Card title="Validées (mois)" value={loadingMonth?'--':monthKpis.valide} />
            <Card title="En attente (mois)" value={loadingMonth?'--':monthKpis.attente} />
            <Card title="IBAN (mois)" value={loadingMonth?'--':monthKpis.iban} />
            <Card title="ROAC (mois)" value={loadingMonth?'--':monthKpis.roac} />
            <Card title="Total (mois)" value={loadingMonth?'--':monthKpis.total} />
          </div>
        </div>
        <div className="mt-4 h-[320px] rounded-2xl border border-white/10 bg-white/5 p-4">
          {loadingMonth ? (
            <div className="flex h-full items-center justify-center text-blue-200/70 text-sm">Chargement…</div>
          ) : monthLineData ? (
            <ChartComponent type="line" data={monthLineData} />
          ) : (
            <div className="flex h-full items-center justify-center text-blue-200/70 text-sm">Aucune donnée</div>
          )}
        </div>
      </section>

      {/* Classement télévendeurs (mois) */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1734]/70 via-[#08122a]/70 to-[#050b18]/70 p-6 backdrop-blur-xl shadow-[0_22px_60px_rgba(8,20,40,0.55)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Classement télévendeurs (mois)</h2>
          <span className="text-xs text-blue-200/60">Top 15</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-blue-50">
            <thead className="bg-white/10 text-xs uppercase tracking-[0.35em] text-blue-200/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Agent</th>
                <th className="px-4 py-3 text-right font-semibold">Validées</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-blue-200/70">Aucune vente ce mois.</td></tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.agent} className="border-b border-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-500/10">
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-white">{a.agent}</td>
                    <td className="px-4 py-3 text-right text-emerald-200">{a.valide}</td>
                    <td className="px-4 py-3 text-right text-blue-100">{a.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SupervisorCanalDashboard;
