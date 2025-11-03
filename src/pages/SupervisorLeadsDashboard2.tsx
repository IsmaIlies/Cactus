import React from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { categorize } from '../leads/services/leadsSalesService';
import ChartComponent from '../components/ChartComponent';

type LeadSourceKey = 'opportunity' | 'dolead' | 'mm';

type LeadBreakdown = {
  internet: number;
  internetSosh: number;
  mobile: number;
  mobileSosh: number;
  total: number;
};

const createEmptyBreakdown = (): LeadBreakdown => ({
  internet: 0,
  internetSosh: 0,
  mobile: 0,
  mobileSosh: 0,
  total: 0,
});

const addToBreakdown = (target: LeadBreakdown, source: LeadBreakdown) => {
  target.internet += source.internet;
  target.internetSosh += source.internetSosh;
  target.mobile += source.mobile;
  target.mobileSosh += source.mobileSosh;
  target.total += source.total;
};

const breakdownFromOffer = (typeOffre: string | undefined | null): LeadBreakdown => {
  const cat = categorize(typeOffre || '');
  return {
    internet: cat.internet,
    internetSosh: cat.internetSosh,
    mobile: cat.mobile,
    mobileSosh: cat.mobileSosh,
    // total = uniquement Internet + Internet Sosh
    total: cat.internet + cat.internetSosh,
  };
};

const LeadSourceCard: React.FC<{
  label: string;
  gradient: string;
  accent: string;
  breakdown: LeadBreakdown;
  loading: boolean;
}> = ({ label, gradient, accent, breakdown, loading }) => {
  const metrics = [
    { key: 'internet', label: 'Internet', value: breakdown.internet },
    { key: 'internetSosh', label: 'Internet Sosh', value: breakdown.internetSosh },
    { key: 'mobile', label: 'Mobile', value: breakdown.mobile },
    { key: 'mobileSosh', label: 'Mobile Sosh', value: breakdown.mobileSosh },
  ];
  const displayValue = (value: number) => (loading ? '--' : value.toLocaleString('fr-FR'));

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br ${gradient} p-5 shadow-[0_22px_55px_rgba(12,32,78,0.55)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/60 hover:shadow-[0_28px_65px_rgba(56,189,248,0.35)]`}
    >
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_60%)] transition duration-300 group-hover:opacity-50 group-hover:scale-105" />
      <div className="relative flex h-full flex-col gap-5">
        <div className="flex items-baseline justify-between">
          <h2 className={`text-lg font-semibold ${accent}`}>{label}</h2>
          <span className="text-[11px] font-semibold uppercase tracking-[0.45em] text-blue-100/70">Jour</span>
        </div>
        <div>
          <p className="text-4xl font-bold text-white">{displayValue(breakdown.total)}</p>
          <p className="text-xs text-blue-100/60">Total ventes</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm text-blue-100/80">
          {metrics.map((metric) => (
            <div
              key={metric.key}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition-all duration-300 group-hover:border-cyan-300/40 group-hover:bg-white/10"
            >
              <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">{metric.label}</p>
              <p className="text-lg font-semibold text-white">{displayValue(metric.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};

const monthlyChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: 'rgba(191,219,254,0.9)',
      },
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(148,163,184,0.15)' },
      ticks: { color: 'rgba(191,219,254,0.7)' },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(148,163,184,0.1)' },
      ticks: { color: 'rgba(191,219,254,0.7)' },
    },
  },
};

const SupervisorLeadsDashboard2: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const normalizedArea = (area || '').toLowerCase();

  const [sourceBreakdown, setSourceBreakdown] = React.useState<Record<LeadSourceKey, LeadBreakdown>>({
    opportunity: createEmptyBreakdown(),
    dolead: createEmptyBreakdown(),
    mm: createEmptyBreakdown(),
  });
  const [agentBreakdown, setAgentBreakdown] = React.useState<Array<{ agent: string; counts: LeadBreakdown }>>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [monthlyChart, setMonthlyChart] = React.useState<{ labels: string[]; datasets: any[] } | null>(null);
  const [monthlyLoading, setMonthlyLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    if (normalizedArea !== 'leads') return;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    setLoading(true);
    setError(null);
    const region = (() => { try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase()==='CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; } })();

    const q = region === 'CIV'
      ? query(
          collection(db, 'leads_sales'),
          where('mission', '==', 'ORANGE_LEADS'),
          where('region', '==', 'CIV'),
          where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
          orderBy('createdAt', 'desc')
        )
      : query(
          collection(db, 'leads_sales'),
          where('mission', '==', 'ORANGE_LEADS'),
          where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
          orderBy('createdAt', 'desc')
        );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const totals: Record<LeadSourceKey, LeadBreakdown> = {
          opportunity: createEmptyBreakdown(),
          dolead: createEmptyBreakdown(),
          mm: createEmptyBreakdown(),
        };
        const agentMap = new Map<string, LeadBreakdown>();

        snapshot.forEach((doc) => {
          const data = doc.data() as Record<string, any>;
          const originRaw = String(data?.origineLead || '').toLowerCase();
          if (originRaw !== 'opportunity' && originRaw !== 'dolead' && originRaw !== 'mm') {
            return;
          }
          const breakdown = breakdownFromOffer(data?.typeOffre);
          addToBreakdown(totals[originRaw as LeadSourceKey], breakdown);

          const agentLabel = (data?.createdBy?.displayName || data?.createdBy?.email || 'Agent inconnu').trim();
          const current = agentMap.get(agentLabel) ?? createEmptyBreakdown();
          addToBreakdown(current, breakdown);
          agentMap.set(agentLabel, current);
        });

  setSourceBreakdown(totals);
        const agents = Array.from(agentMap.entries())
          .map(([agent, counts]) => ({ agent, counts }))
          .sort((a, b) => b.counts.total - a.counts.total);
        setAgentBreakdown(agents);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Impossible de charger les ventes Leads.");
        setLoading(false);
      }
    );

    return () => {
      try { unsubscribe(); } catch { /* ignore */ }
    };
  }, [normalizedArea]);

  React.useEffect(() => {
    if (normalizedArea !== 'leads') return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    setMonthlyLoading(true);
    const region = (() => { try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase()==='CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; } })();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const labels = Array.from({ length: daysInMonth }, (_, idx) =>
      new Date(now.getFullYear(), now.getMonth(), idx + 1).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
      })
    );

    const datasetTemplate = () => Array(daysInMonth).fill(0);
    const internet = datasetTemplate();
    const internetSosh = datasetTemplate();
    const mobile = datasetTemplate();
    const mobileSosh = datasetTemplate();

    const q = region === 'CIV'
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

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        internet.fill(0);
        internetSosh.fill(0);
        mobile.fill(0);
        mobileSosh.fill(0);

        snapshot.forEach((doc) => {
          const data = doc.data() as Record<string, any>;
          const createdAt: Timestamp | null = data?.createdAt ?? null;
          const d = createdAt ? createdAt.toDate() : null;
          if (!d) return;
          const dayIndex = d.getDate() - 1;
          if (dayIndex < 0 || dayIndex >= daysInMonth) return;
          const breakdown = breakdownFromOffer(data?.typeOffre);
          internet[dayIndex] += breakdown.internet;
          internetSosh[dayIndex] += breakdown.internetSosh;
          mobile[dayIndex] += breakdown.mobile;
          mobileSosh[dayIndex] += breakdown.mobileSosh;
        });

        setMonthlyChart({
          labels,
          datasets: [
            {
              label: 'Internet',
              data: [...internet],
              borderColor: '#60a5fa',
              backgroundColor: 'rgba(96,165,250,0.2)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
            },
            {
              label: 'Internet Sosh',
              data: [...internetSosh],
              borderColor: '#a855f7',
              backgroundColor: 'rgba(168,85,247,0.18)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
            },
            {
              label: 'Mobile',
              data: [...mobile],
              borderColor: '#34d399',
              backgroundColor: 'rgba(52,211,153,0.18)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
            },
            {
              label: 'Mobile Sosh',
              data: [...mobileSosh],
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245,158,11,0.18)',
              borderWidth: 2,
              tension: 0.3,
              fill: true,
            },
          ],
        });
        setMonthlyLoading(false);
      },
      (err) => {
        setMonthlyLoading(false);
        setMonthlyChart(null);
        setError((prev) => prev || err?.message || 'Impossible de générer l’historique mensuel.');
      }
    );

    return () => {
      try { unsubscribe(); } catch { /* ignore */ }
    };
  }, [normalizedArea]);

  if (normalizedArea !== 'leads') {
    return (
      <div className="p-6 text-sm text-rose-200">
        Accès réservé — sélectionner l'espace Leads pour consulter ce tableau.
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 text-white">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard Leads — Vue 2</h1>
        <p className="text-blue-200/80 text-sm">
          Vision temps réel des performances ORANGE_LEADS (jour).
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Ventes par origine</h2>
          <p className="text-sm text-blue-100/70">Répartition Internet / Mobile et variantes Sosh pour la journée en cours.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <LeadSourceCard
            label="Opportunity"
            gradient="from-[#081225] via-[#091a31] to-[#0b1530]"
            accent="text-cyan-200"
            breakdown={sourceBreakdown.opportunity}
            loading={loading}
          />
          <LeadSourceCard
            label="Dolead"
            gradient="from-[#0c1a3a] via-[#11284b] to-[#0a1938]"
            accent="text-sky-200"
            breakdown={sourceBreakdown.dolead}
            loading={loading}
          />
          <LeadSourceCard
            label="MM"
            gradient="from-[#123061] via-[#1a3f74] to-[#214a87]"
            accent="text-blue-200"
            breakdown={sourceBreakdown.mm}
            loading={loading}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#071227]/70 via-[#050c1a]/70 to-[#030711]/70 p-6 backdrop-blur-xl text-white shadow-[0_24px_60px_rgba(8,20,40,0.55)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Historique mensuel</h2>
            <p className="text-sm text-blue-100/70">Évolution des ventes Internet & Mobile (Sosh inclus) sur le mois courant.</p>
          </div>
          <span className="text-xs text-blue-200/60">
            Mois : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="mt-4 h-[320px] rounded-2xl border border-white/10 bg-white/5 p-4">
          {monthlyLoading ? (
            <div className="flex h-full items-center justify-center text-blue-200/70 text-sm">
              Chargement de l'historique mensuel…
            </div>
          ) : monthlyChart ? (
            <ChartComponent type="line" data={monthlyChart} options={monthlyChartOptions} />
          ) : (
            <div className="flex h-full items-center justify-center text-blue-200/70 text-sm">
              Aucune donnée disponible pour ce mois.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#08142b]/70 via-[#061024]/70 to-[#030812]/70 p-6 backdrop-blur-xl text-white shadow-[0_26px_65px_rgba(8,20,40,0.55)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ventes du jour par agent</h2>
            <p className="text-sm text-blue-100/70">Internet, Internet Sosh, Mobile et Mobile Sosh consolidés.</p>
          </div>
          <span className="text-xs text-blue-200/60">Actualisation automatique</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-blue-50">
            <thead className="bg-white/10 text-xs uppercase tracking-[0.35em] text-blue-200/80">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Agent</th>
                <th className="px-4 py-3 text-right font-semibold">Internet</th>
                <th className="px-4 py-3 text-right font-semibold">Internet Sosh</th>
                <th className="px-4 py-3 text-right font-semibold">Mobile</th>
                <th className="px-4 py-3 text-right font-semibold">Mobile Sosh</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {agentBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-blue-200/70">
                    {loading ? 'Chargement des ventes...' : "Aucune vente enregistrée aujourd'hui."}
                  </td>
                </tr>
              ) : (
                agentBreakdown.map((entry) => (
                  <tr
                    key={entry.agent}
                    className="border-b border-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-500/10 hover:shadow-[0_8px_32px_rgba(56,189,248,0.35)]"
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-white">{entry.agent}</td>
                    <td className="px-4 py-3 text-right text-blue-100">{entry.counts.internet}</td>
                    <td className="px-4 py-3 text-right text-blue-100">{entry.counts.internetSosh}</td>
                    <td className="px-4 py-3 text-right text-blue-100">{entry.counts.mobile}</td>
                    <td className="px-4 py-3 text-right text-blue-100">{entry.counts.mobileSosh}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">{entry.counts.total}</td>
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

export default SupervisorLeadsDashboard2;
