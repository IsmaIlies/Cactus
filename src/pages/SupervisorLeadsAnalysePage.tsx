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

type AggregatedRanges = {
  day: LeadBreakdown;
  week: LeadBreakdown;
  month: LeadBreakdown;
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
  cutout: '45%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: 'rgba(191,219,254,0.9)',
        padding: 18,
        boxWidth: 14,
        boxHeight: 14,
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const label = String(ctx.label || '');
          const value = typeof ctx.parsed === 'number' ? ctx.parsed : 0;
          return `${label}: ${value.toLocaleString('fr-FR')}`;
        },
      },
    },
  },
};

const PIE_SEGMENTS = [
  { key: 'internet' as const, label: 'Internet', color: '#60a5fa' },
  { key: 'internetSosh' as const, label: 'Internet Sosh', color: '#a855f7' },
  { key: 'mobile' as const, label: 'Mobile', color: '#34d399' },
  { key: 'mobileSosh' as const, label: 'Mobile Sosh', color: '#f59e0b' },
];

const formatCount = (value: number) => value.toLocaleString('fr-FR');

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
  const [aggregates, setAggregates] = React.useState<Record<string, AggregatedRanges>>({});
  const [selectedAgent, setSelectedAgent] = React.useState<string>('global');
  const [selectedRange, setSelectedRange] = React.useState<'day' | 'week' | 'month'>('day');
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  React.useEffect(() => {
    if (normalizedArea !== 'leads') return;

    const [yearStr, monthStr] = selectedMonth.split('-');
    const targetYear = Number(yearStr);
    const targetMonthIndex = Number(monthStr) - 1;

    const now = new Date();
    const monthStart = new Date(targetYear, targetMonthIndex, 1, 0, 0, 0, 0);
    const nextMonth = new Date(targetYear, targetMonthIndex + 1, 1, 0, 0, 0, 0);

    const currentDay = targetYear === now.getFullYear() && targetMonthIndex === now.getMonth() ? now.getDate() : new Date(nextMonth.getTime() - 1).getDate();
    const startOfDay = new Date(targetYear, targetMonthIndex, currentDay, 0, 0, 0, 0);
    const startOfWeek = new Date(targetYear, targetMonthIndex, currentDay - 6, 0, 0, 0, 0);

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
        const originDayTotals: Record<LeadSourceKey, LeadBreakdown> = {
          hipto: createEmptyBreakdown(),
          dolead: createEmptyBreakdown(),
          mm: createEmptyBreakdown(),
        };
        const aggregator = new Map<string, AggregatedRanges>();
        const ensureAggregator = (key: string) => {
          if (!aggregator.has(key)) {
            aggregator.set(key, {
              day: createEmptyBreakdown(),
              week: createEmptyBreakdown(),
              month: createEmptyBreakdown(),
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

          const ts: Timestamp | null = data?.createdAt ?? null;
          const createdAt = ts ? ts.toDate() : null;
          if (!createdAt) return;

          if (createdAt >= startOfDay) {
            addToBreakdown(originDayTotals[originRaw as LeadSourceKey], breakdown);
          }

          const keys = [GLOBAL_KEY, (data?.createdBy?.displayName || data?.createdBy?.email || 'Agent inconnu').trim()];
          keys.forEach((key) => {
            const agg = ensureAggregator(key);
            addToBreakdown(agg.month, breakdown);
            if (createdAt >= startOfWeek) addToBreakdown(agg.week, breakdown);
            if (createdAt >= startOfDay) addToBreakdown(agg.day, breakdown);
          });
        });

        const aggregatesResult: Record<string, AggregatedRanges> = {};
        aggregator.forEach((value, key) => {
          aggregatesResult[key] = {
            day: { ...value.day },
            week: { ...value.week },
            month: { ...value.month },
          };
        });

        setAggregates(aggregatesResult);
        setSourceBreakdown(originDayTotals);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(err);
        setError(err?.message || 'Impossible de charger les données Leads.');
        setLoading(false);
        setAggregates({});
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
  }, [normalizedArea, selectedMonth]);

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
  const selectedStats = aggregates[selectedKey] ?? {
    day: createEmptyBreakdown(),
    week: createEmptyBreakdown(),
    month: createEmptyBreakdown(),
  };
  const currentBreakdown = selectedStats[selectedRange] ?? createEmptyBreakdown();

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
    total: selectedStats[rangeKey]?.total ?? 0,
  }));

  const selectedAgentLabel = selectedAgent === 'global' ? 'Global (toutes sources)' : selectedAgent;

  const pieDataForSource = (breakdown: LeadBreakdown) => ({
    labels: PIE_SEGMENTS.map((seg) => seg.label),
    datasets: [
      {
        data: PIE_SEGMENTS.map((seg) => breakdown[seg.key]),
        backgroundColor: PIE_SEGMENTS.map((seg) => seg.color),
        borderColor: 'rgba(15,27,51,0.85)',
        borderWidth: 1,
        hoverBorderWidth: 2,
        hoverOffset: 10,
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
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

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase tracking-[0.35em] text-blue-200/70">Mois</label>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="w-48 rounded-xl border border-white/15 bg-[#08122a]/70 px-4 py-2 text-sm text-white shadow-[0_14px_32px_rgba(15,23,42,0.45)] focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
            >
              {Array.from({ length: 12 }).map((_, idx) => {
                const now = new Date();
                const date = new Date(now.getFullYear(), now.getMonth() - idx, 1);
                const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                return (
                  <option key={value} value={value} className="bg-[#08122a] text-white">
                    {date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </option>
                );
              })}
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
              className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${metric.gradient} p-6 shadow-[0_18px_45px_rgba(8,20,60,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_24px_55px_rgba(56,189,248,0.35)]`}
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
          <p className="text-sm text-blue-100/70">Concentration des ventes du jour par type d'offre.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {([
            { key: 'hipto' as const, label: 'Hipto', gradient: 'from-[#162c4f]/80 via-[#102241]/80 to-[#0a1935]/80', accent: 'text-cyan-200' },
            { key: 'dolead' as const, label: 'Dolead', gradient: 'from-[#1c2f64]/80 via-[#142552]/80 to-[#0d1c43]/80', accent: 'text-sky-200' },
            { key: 'mm' as const, label: 'MM', gradient: 'from-[#123061]/80 via-[#1a3f74]/80 to-[#214a87]/80', accent: 'text-blue-200' },
          ]).map((descriptor) => {
            const breakdown = sourceBreakdown[descriptor.key];
            return (
              <article
                key={descriptor.key}
                className={`group relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br ${descriptor.gradient} p-8 shadow-[0_24px_65px_rgba(8,20,40,0.55)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_30px_75px_rgba(56,189,248,0.32)]`}
              >
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_60%)] transition duration-300 group-hover:opacity-55 group-hover:scale-105" />
                <div className="relative flex h-full flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs uppercase tracking-[0.4em] ${descriptor.accent}`}>Origine</p>
                      <h3 className="text-xl font-semibold text-white">{descriptor.label}</h3>
                    </div>
                    <div className="rounded-full border border-cyan-300/40 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100">
                      Total {loading ? '--' : formatCount(breakdown.total)}
                    </div>
                  </div>
                  <div className="h-72 rounded-2xl border border-white/10 bg-[#0b1a33]/70 p-4 shadow-inner">
                    <ChartComponent type="pie" data={pieDataForSource(breakdown)} options={pieOptions} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-blue-100/80">
                    {PIE_SEGMENTS.map((seg) => (
                      <div
                        key={seg.key}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition group-hover:bg-white/10 group-hover:border-cyan-300/40"
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-xs uppercase tracking-[0.3em] text-blue-200/70">{seg.label}</span>
                        <span className="ml-auto text-sm font-semibold text-white">{loading ? '--' : formatCount(breakdown[seg.key])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default SupervisorLeadsAnalysePage;
