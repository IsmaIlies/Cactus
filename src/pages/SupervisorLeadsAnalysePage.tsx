import React from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { categorize } from '../leads/services/leadsSalesService';
import ChartComponent from '../components/ChartComponent';

type LeadSourceKey = 'hipto' | 'dolead' | 'mm';

type LeadBreakdown = {
  internet: number;
  internetSosh: number;
  mobile: number;
  mobileSosh: number;
  total: number;
};

type AggregatedStats = {
  ranges: {
    day: LeadBreakdown;
    week: LeadBreakdown;
    month: LeadBreakdown;
  };
};

const GLOBAL_KEY = '__global';

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
    total: cat.internet + cat.internetSosh + cat.mobile + cat.mobileSosh,
  };
};

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: 'rgba(191,219,254,0.9)',
        padding: 16,
      },
    },
  },
};

const SupervisorLeadsAnalysePage: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const normalizedArea = (area || '').toLowerCase();

  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sourceBreakdown, setSourceBreakdown] = React.useState<Record<LeadSourceKey, LeadBreakdown>>({
    hipto: createEmptyBreakdown(),
    dolead: createEmptyBreakdown(),
    mm: createEmptyBreakdown(),
  });
  const [agentBreakdown, setAgentBreakdown] = React.useState<Array<{ agent: string; counts: LeadBreakdown }>>([]);
  const [aggregates, setAggregates] = React.useState<Record<string, AggregatedStats>>({});
  const [selectedAgent, setSelectedAgent] = React.useState<string>('global');
  const [selectedRange, setSelectedRange] = React.useState<'day' | 'week' | 'month'>('day');

  React.useEffect(() => {
    if (normalizedArea !== 'leads') return;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    setLoading(true);
    setError(null);

    const leadsQuery = query(
      collection(db, 'leads_sales'),
      where('mission', '==', 'ORANGE_LEADS'),
      where('createdAt', '>=', Timestamp.fromDate(monthStart)),
      where('createdAt', '<', Timestamp.fromDate(nextMonth)),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      leadsQuery,
      (snapshot) => {
        const originTotals: Record<LeadSourceKey, LeadBreakdown> = {
          hipto: createEmptyBreakdown(),
          dolead: createEmptyBreakdown(),
          mm: createEmptyBreakdown(),
        };
        const aggregator = new Map<string, AggregatedStats>();
        const ensureAggregator = (key: string) => {
          if (!aggregator.has(key)) {
            aggregator.set(key, {
              ranges: {
                day: createEmptyBreakdown(),
                week: createEmptyBreakdown(),
                month: createEmptyBreakdown(),
              },
            });
          }
          return aggregator.get(key)!;
        };

        ensureAggregator(GLOBAL_KEY);

        snapshot.forEach((doc) => {
          const data = doc.data() as Record<string, any>;
          const originRaw = String(data?.origineLead || '').toLowerCase();
          if (originRaw !== 'hipto' && originRaw !== 'dolead' && originRaw !== 'mm') {
            return;
          }
          const breakdown = breakdownFromOffer(data?.typeOffre);
          addToBreakdown(originTotals[originRaw as LeadSourceKey], breakdown);

          const ts: Timestamp | null = data?.createdAt ?? null;
          const createdAt = ts ? ts.toDate() : null;
          if (!createdAt) return;

          const agentLabel = (data?.createdBy?.displayName || data?.createdBy?.email || 'Agent inconnu').trim();
          const keys = [GLOBAL_KEY, agentLabel];

          keys.forEach((key) => {
            const agg = ensureAggregator(key);
            addToBreakdown(agg.ranges.month, breakdown);
            if (createdAt >= startOfWeek) addToBreakdown(agg.ranges.week, breakdown);
            if (createdAt >= startOfDay) addToBreakdown(agg.ranges.day, breakdown);
          });
        });

        const aggregatesResult: Record<string, AggregatedStats> = {};
        aggregator.forEach((value, key) => {
          aggregatesResult[key] = {
            ranges: {
              day: { ...value.ranges.day },
              week: { ...value.ranges.week },
              month: { ...value.ranges.month },
            },
          };
        });

        setAggregates(aggregatesResult);
        setSourceBreakdown({
          hipto: { ...originTotals.hipto },
          dolead: { ...originTotals.dolead },
          mm: { ...originTotals.mm },
        });
        const agentRows = Array.from(aggregator.entries())
          .filter(([key]) => key !== GLOBAL_KEY)
          .map(([agent, stats]) => ({ agent, counts: { ...stats.ranges.day } }))
          .sort((a, b) => b.counts.total - a.counts.total);
        setAgentBreakdown(agentRows);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(err);
        setError(err?.message || "Impossible de charger les données Leads.");
        setLoading(false);
        setAggregates({});
        setAgentBreakdown([]);
        setSourceBreakdown({
          hipto: createEmptyBreakdown(),
          dolead: createEmptyBreakdown(),
          mm: createEmptyBreakdown(),
        });
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [normalizedArea]);

  const agentOptions = React.useMemo(() => {
    const keys = Object.keys(aggregates)
      .filter((key) => key !== GLOBAL_KEY)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    return ['global', ...keys];
  }, [aggregates]);

  React.useEffect(() => {
    if (!agentOptions.includes(selectedAgent)) {
      setSelectedAgent('global');
    }
  }, [agentOptions, selectedAgent]);

  const selectedKey = selectedAgent === 'global' ? GLOBAL_KEY : selectedAgent;
  const selectedStats = aggregates[selectedKey];
  const currentBreakdown = selectedStats?.ranges[selectedRange] ?? createEmptyBreakdown();

  const rangeButtons: Array<{ key: 'day' | 'week' | 'month'; label: string }> = [
    { key: 'day', label: 'Jour' },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];

  const metrics = [
    {
      key: 'internet' as const,
      label: 'Internet',
      value: currentBreakdown.internet,
      gradient: 'from-[#173770]/70 via-[#0e224c]/70 to-[#091839]/70',
    },
    {
      key: 'internetSosh' as const,
      label: 'Internet Sosh',
      value: currentBreakdown.internetSosh,
      gradient: 'from-[#1c3c82]/70 via-[#132958]/70 to-[#0b1b3a]/70',
    },
    {
      key: 'mobile' as const,
      label: 'Mobile',
      value: currentBreakdown.mobile,
      gradient: 'from-[#134b5f]/70 via-[#0c3645]/70 to-[#082733]/70',
    },
    {
      key: 'mobileSosh' as const,
      label: 'Mobile Sosh',
      value: currentBreakdown.mobileSosh,
      gradient: 'from-[#684199]/70 via-[#422b62]/70 to-[#2d1d44]/70',
    },
  ];

  const rangeSummary = (['day', 'week', 'month'] as const).map((rangeKey) => ({
    key: rangeKey,
    label: rangeButtons.find((btn) => btn.key === rangeKey)?.label || '',
    total: selectedStats?.ranges[rangeKey]?.total ?? 0,
  }));

  const selectedAgentLabel = selectedAgent === 'global' ? 'Global (toutes sources)' : selectedAgent;

  const pieDataForSource = (breakdown: LeadBreakdown) => ({
    labels: ['Internet', 'Internet Sosh', 'Mobile', 'Mobile Sosh'],
    datasets: [
      {
        data: [breakdown.internet, breakdown.internetSosh, breakdown.mobile, breakdown.mobileSosh],
        backgroundColor: ['#60a5fa', '#a855f7', '#34d399', '#f59e0b'],
        borderColor: '#0f1b33',
        borderWidth: 1,
      },
    ],
  });

  if (normalizedArea !== 'leads') {
    return (
      <div className="p-6 text-sm text-rose-200">
        Accès réservé — sélectionner l'espace Leads pour consulter la section Analyse.
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 text-white">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Analyse Leads</h1>
        <p className="text-blue-200/80 text-sm">Explore les performances ORANGE_LEADS avec filtres agent et période.</p>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#081632]/70 via-[#06122a]/70 to-[#030915]/70 p-6 backdrop-blur-xl shadow-[0_28px_70px_rgba(8,20,40,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-blue-200/70">Sélection</p>
              <h2 className="text-xl font-semibold text-white">{selectedAgentLabel}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {rangeButtons.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  onClick={() => setSelectedRange(range.key)}
                  className={`group relative overflow-hidden rounded-xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] transition-all ${
                    selectedRange === range.key
                      ? 'border-cyan-400/60 bg-gradient-to-r from-cyan-500/40 via-blue-500/30 to-transparent text-white shadow-[0_12px_30px_rgba(56,189,248,0.35)]'
                      : 'border-white/10 bg-white/5 text-blue-200/80 hover:border-cyan-300/40 hover:text-white hover:shadow-[0_10px_24px_rgba(59,130,246,0.25)]'
                  }`}
                >
                  <span className="relative z-10">{range.label}</span>
                  <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.4),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(37,99,235,0.35),transparent_60%)]" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.35em] text-blue-200/70">Agent</label>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className="w-64 rounded-xl border border-white/15 bg-[#08122a]/70 px-4 py-2 text-sm text-white shadow-[0_14px_32px_rgba(15,23,42,0.45)] focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              {agentOptions.map((option) => (
                <option key={option} value={option} className="bg-[#08122a] text-white">
                  {option === 'global' ? 'Global (toutes sources)' : option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-blue-100/80">
          {rangeSummary.map((item) => (
            <span
              key={item.key}
              className={`inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-3 py-2 transition ${
                selectedRange === item.key ? 'bg-cyan-500/20 text-white' : 'bg-white/5'
              }`}
            >
              <span className="text-[10px] uppercase tracking-[0.4em]">{item.label}</span>
              <span className="text-base font-semibold text-white">{loading ? '--' : item.total}</span>
            </span>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article
              key={metric.key}
              className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${metric.gradient} p-5 shadow-[0_18px_45px_rgba(8,20,60,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_24px_55px_rgba(56,189,248,0.35)]`}
            >
              <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_60%)] transition duration-300 group-hover:opacity-50 group-hover:scale-105" />
              <div className="relative flex h-full flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.35em] text-blue-200/70">{metric.label}</p>
                <p className="text-3xl font-bold text-white">{loading ? '--' : metric.value.toLocaleString('fr-FR')}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Répartition par origine</h2>
          <p className="text-sm text-blue-100/70">Détail des offres vendues aujourd'hui (Internet / Sosh / Mobile).</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#081225]/70 via-[#091a31]/70 to-[#0b1530]/70 p-5 shadow-[0_22px_60px_rgba(8,20,40,0.5)]">
            <h3 className="text-lg font-semibold text-cyan-200 mb-3">Hipto</h3>
            <div className="h-64">
              <ChartComponent type="pie" data={pieDataForSource(sourceBreakdown.hipto)} options={pieOptions} />
            </div>
          </article>
          <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1a3a]/70 via-[#11284b]/70 to-[#0a1938]/70 p-5 shadow-[0_22px_60px_rgba(8,20,40,0.5)]">
            <h3 className="text-lg font-semibold text-sky-200 mb-3">Dolead</h3>
            <div className="h-64">
              <ChartComponent type="pie" data={pieDataForSource(sourceBreakdown.dolead)} options={pieOptions} />
            </div>
          </article>
          <article className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#123061]/70 via-[#1a3f74]/70 to-[#214a87]/70 p-5 shadow-[0_22px_60px_rgba(8,20,40,0.5)]">
            <h3 className="text-lg font-semibold text-blue-200 mb-3">MM</h3>
            <div className="h-64">
              <ChartComponent type="pie" data={pieDataForSource(sourceBreakdown.mm)} options={pieOptions} />
            </div>
          </article>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#08142b]/70 via-[#061024]/70 to-[#030812]/70 p-6 backdrop-blur-xl text-white shadow-[0_26px_65px_rgba(8,20,40,0.55)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ventes du jour par agent</h2>
            <p className="text-sm text-blue-100/70">Internet, Internet Sosh, Mobile et Mobile Sosh consolidés (jour).</p>
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
                <>
                  {agentBreakdown.map((entry) => (
                    <tr
                      key={entry.agent}
                      className="border-b border-white/10 transition-all.duration-200 hover:-translate-y-0.5 hover:bg-blue-500/10 hover:shadow-[0_8px_32px_rgba(56,189,248,0.35)]"
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-white">{entry.agent}</td>
                      <td className="px-4 py-3 text-right text-blue-100">{entry.counts.internet}</td>
                      <td className="px-4 py-3 text-right text-blue-100">{entry.counts.internetSosh}</td>
                      <td className="px-4 py-3 text-right text-blue-100">{entry.counts.mobile}</td>
                      <td className="px-4 py-3 text-right text-blue-100">{entry.counts.mobileSosh}</td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{entry.counts.total}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-cyan-900/30 border-t border-cyan-400/30">
                    <td className="px-4 py-3 font-bold text-cyan-200">Total ventes du jour</td>
                    <td className="px-4 py-3 text-right font-bold text-cyan-100">{loading ? '--' : agentBreakdown.reduce((sum, a) => sum + a.counts.internet, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-cyan-100">{loading ? '--' : agentBreakdown.reduce((sum, a) => sum + a.counts.internetSosh, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-cyan-100">{loading ? '--' : agentBreakdown.reduce((sum, a) => sum + a.counts.mobile, 0)}</td>
                    <td className="px-4 py-3 text-right font-bold text-cyan-100">{loading ? '--' : agentBreakdown.reduce((sum, a) => sum + a.counts.mobileSosh, 0)}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-cyan-100">{loading ? '--' : agentBreakdown.reduce((sum, a) => sum + a.counts.total, 0)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SupervisorLeadsAnalysePage;
