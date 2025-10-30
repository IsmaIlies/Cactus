import React from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, Timestamp, where, type FirestoreError } from 'firebase/firestore';
import { db } from '../firebase';
import { categorize } from '../leads/services/leadsSalesService';
import ChartComponent from '../components/ChartComponent';

type LeadOrigin = 'opportunity' | 'dolead' | 'mm';

type LeadSaleHistoryRow = {
  id: string;
  createdAt: Date | null;
  agent: string;
  numeroId: string | null;
  telephone: string | null;
  origineLead: LeadOrigin;
  intituleOffre: string | null;
  typeOffre: string | null;
};

type LeadOriginTotals = {
  internet: number;
  internetSosh: number;
  mobile: number;
  mobileSosh: number;
  count: number;
};

type MonthOption = {
  label: string;
  value: string;
};

type LeadSaleDoc = {
  createdAt?: Timestamp | Date | { toDate: () => Date } | null;
  createdBy?: {
    displayName?: string | null;
    email?: string | null;
  } | null;
  numeroId?: string | null;
  telephone?: string | null;
  origineLead?: string | null;
  intituleOffre?: string | null;
  typeOffre?: string | null;
};

const ORIGINS: LeadOrigin[] = ['opportunity', 'dolead', 'mm'];

const normalizeDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybe = (value as { toDate?: () => Date }).toDate;
    if (typeof maybe === 'function') {
      try {
        const date = maybe();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
      } catch {
        return null;
      }
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const createEmptyTotals = (): LeadOriginTotals => ({ internet: 0, internetSosh: 0, mobile: 0, mobileSosh: 0, count: 0 });

const aggregateRows = (sourceRows: LeadSaleHistoryRow[]): Record<LeadOrigin | 'global', LeadOriginTotals> => {
  const totals: Record<LeadOrigin | 'global', LeadOriginTotals> = {
    opportunity: createEmptyTotals(),
    dolead: createEmptyTotals(),
    mm: createEmptyTotals(),
    global: createEmptyTotals(),
  };

  sourceRows.forEach((row) => {
    if (!ORIGINS.includes(row.origineLead)) return;
    const cat = categorize(row.typeOffre || '');
    const originBucket = totals[row.origineLead];
    originBucket.internet += cat.internet;
    originBucket.internetSosh += cat.internetSosh;
    originBucket.mobile += cat.mobile;
    originBucket.mobileSosh += cat.mobileSosh;
    originBucket.count += cat.internet + cat.internetSosh;

    const globalBucket = totals.global;
    globalBucket.internet += cat.internet;
    globalBucket.internetSosh += cat.internetSosh;
    globalBucket.mobile += cat.mobile;
    globalBucket.mobileSosh += cat.mobileSosh;
    globalBucket.count += cat.internet + cat.internetSosh;
  });

  return totals;
};

const getMonthOptions = (count = 6): MonthOption[] => {
  const options: MonthOption[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = target.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    options.push({ label, value: target.toISOString() });
  }
  return options;
};

const formatDateTime = (date: Date | null) => {
  if (!date) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatNumber = (value: number) => value.toLocaleString('fr-FR');

const SupervisorLeadsSalesHistoryPage: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const normalizedArea = (area || '').toLowerCase();
  const monthOptions = React.useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = React.useState<string>(monthOptions[0]?.value || new Date().toISOString());
  const [rows, setRows] = React.useState<LeadSaleHistoryRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [agents, setAgents] = React.useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('');

  const selectedMonthDate = React.useMemo(() => {
    const fallback = new Date();
    const parsed = new Date(selectedMonth);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }, [selectedMonth]);

  React.useEffect(() => {
    if (normalizedArea !== 'leads') {
      return () => undefined;
    }

    const monthStart = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 1, 0, 0, 0, 0);

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'leads_sales'),
      where('mission', '==', 'ORANGE_LEADS'),
      where('createdAt', '>=', Timestamp.fromDate(monthStart)),
      where('createdAt', '<', Timestamp.fromDate(monthEnd)),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextRows: LeadSaleHistoryRow[] = [];
        const agentSet = new Set<string>();

        snapshot.forEach((document) => {
          const data = document.data() as LeadSaleDoc;
          const origin = String(data?.origineLead || '').toLowerCase();
          if (!ORIGINS.includes(origin as LeadOrigin)) {
            return;
          }
          const createdAt = normalizeDate(data?.createdAt);
          const agentLabel = (data?.createdBy?.displayName || data?.createdBy?.email || 'Agent inconnu') as string;
          agentSet.add(agentLabel);

          nextRows.push({
            id: document.id,
            createdAt,
            agent: agentLabel,
            numeroId: data?.numeroId ?? null,
            telephone: data?.telephone ?? null,
            origineLead: origin as LeadOrigin,
            intituleOffre: data?.intituleOffre ?? null,
            typeOffre: data?.typeOffre ?? null,
          });
        });

        nextRows.sort((a, b) => {
          const timeA = a.createdAt ? a.createdAt.getTime() : 0;
          const timeB = b.createdAt ? b.createdAt.getTime() : 0;
          return timeB - timeA;
        });

        setRows(nextRows);
        setAgents(Array.from(agentSet).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })));
        setSelectedAgent((current) => {
          if (!current) return '';
          return agentSet.has(current) ? current : '';
        });
        setLoading(false);
      },
      (snapshotError: FirestoreError) => {
        console.error('Historique ventes Leads+: erreur snapshot', snapshotError);
        setError(snapshotError.message || 'Impossible de charger les ventes.');
        setRows([]);
        setAgents([]);
        setSelectedAgent('');
        setLoading(false);
      }
    );

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [normalizedArea, selectedMonthDate]);

  if (normalizedArea !== 'leads') {
    return (
      <div className="p-6 text-sm text-rose-200">
        Accès réservé — sélectionne l'espace Leads pour consulter l'historique des ventes.
      </div>
    );
  }

  const filteredRows = React.useMemo(() => {
    if (!selectedAgent) return rows;
    return rows.filter((row) => row.agent === selectedAgent);
  }, [rows, selectedAgent]);

  const summaryTotals = React.useMemo(() => aggregateRows(filteredRows), [filteredRows]);

  const salesDistribution = React.useMemo(() => {
    const totals = summaryTotals.global;
    const dataset = [totals.internet, totals.internetSosh];
    const totalCount = dataset.reduce((acc, value) => acc + value, 0);
    const palette = ['#22d3ee', '#0ea5e9'];
    return {
      totalCount,
      chartData: {
        labels: ['Internet', 'Internet Sosh'],
        datasets: [
          {
            label: 'Ventes',
            data: dataset,
            backgroundColor: palette,
            hoverBackgroundColor: palette,
            borderColor: 'rgba(15,23,42,0.85)',
            borderWidth: 2,
            borderJoinStyle: 'round' as const,
          },
        ],
      },
      chartOptions: {
        cutout: '62%',
        radius: '90%',
        animation: {
          duration: 900,
          easing: 'easeOutQuart',
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: 'rgba(165,243,252,0.9)',
              font: { family: 'Inter, sans-serif', size: 11, weight: '600' },
              padding: 18,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,0.9)',
            borderColor: 'rgba(34,211,238,0.5)',
            borderWidth: 1,
            titleColor: '#f8fafc',
            bodyColor: '#e0f2fe',
            displayColors: false,
          },
        },
      },
    };
  }, [summaryTotals]);

  const summaryCards = [
    {
      key: 'global',
      title: 'Total mois',
      subtitle: 'Toutes origines confondues',
      totals: summaryTotals.global,
      gradient: 'from-[#0f172a] via-[#111c30] to-[#0b1320]',
    },
    {
      key: 'opportunity',
      title: 'Opportunity',
      subtitle: 'Origine leads Opportunity',
      totals: summaryTotals.opportunity,
      gradient: 'from-[#0e213f] via-[#0f2a4f] to-[#0a1a33]',
    },
    {
      key: 'dolead',
      title: 'Dolead',
      subtitle: 'Origine leads Dolead',
      totals: summaryTotals.dolead,
      gradient: 'from-[#0f1f38] via-[#11274a] to-[#0a1a2f]',
    },
    {
      key: 'mm',
      title: 'MM',
      subtitle: 'Origine leads MM',
      totals: summaryTotals.mm,
      gradient: 'from-[#0f1d32] via-[#112443] to-[#0a1729]',
    },
  ];

  const cardMetrics = [
    { key: 'internet', label: 'Internet', value: (totals: LeadOriginTotals) => totals.internet },
    { key: 'internetSosh', label: 'Internet Sosh', value: (totals: LeadOriginTotals) => totals.internetSosh },
  ] as const;

  return (
    <div className="space-y-6 p-6 text-white">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Historique des ventes Leads+</h1>
          <p className="text-blue-200/80 text-sm">
            Visualise les ventes Leads par origine et par agent sur la période sélectionnée.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-blue-100/80">
            <span>Période</span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white focus:border-cyan-300 focus:outline-none"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label.charAt(0).toUpperCase() + option.label.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-blue-100/80">
            <span>Agent</span>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className="min-w-[160px] rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white focus:border-cyan-300 focus:outline-none"
            >
              <option value="">Tous</option>
              {agents.map((agentName) => (
                <option key={agentName} value={agentName}>
                  {agentName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ key, title, subtitle, totals, gradient }) => (
          <article
            key={key}
            className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${gradient} p-5 shadow-[0_18px_45px_rgba(8,20,40,0.45)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-[0_26px_60px_rgba(56,189,248,0.35)]`}
          >
            <div className="relative flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="text-[11px] uppercase tracking-[0.35em] text-blue-200/70">{subtitle}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{loading ? '…' : formatNumber(totals.count)}</span>
                <span className="text-xs text-blue-100/70 uppercase tracking-[0.3em]">Ventes</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-blue-100/80">
                {cardMetrics.map((metric) => (
                  <div key={metric.key} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-blue-200/60">{metric.label}</p>
                    <p className="text-lg font-semibold text-white">{loading ? '…' : formatNumber(metric.value(totals))}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-[#020617] via-[#07162f] to-[#010314] p-6 shadow-[0_25px_60px_rgba(34,211,238,0.18)]">
        <div className="pointer-events-none absolute -top-20 -right-10 h-48 w-48 rounded-full bg-cyan-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />
        <header className="relative flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-cyan-100">Répartition des ventes par offre</h2>
            <p className="text-sm text-cyan-200/70">
              {loading
                ? 'Chargement en cours…'
                : salesDistribution.totalCount > 0
                  ? `Total ventes analysées : ${salesDistribution.totalCount.toLocaleString('fr-FR')}`
                  : 'Aucune donnée à afficher pour la sélection.'}
            </p>
          </div>
        </header>
        <div className="relative mt-6 flex flex-col items-center justify-center">
          {loading ? (
            <div className="py-12 text-center text-sm text-cyan-100/70">Préparation du graphique…</div>
          ) : salesDistribution.totalCount > 0 ? (
            <div className="relative mx-auto h-[320px] w-full max-w-[360px]">
              <ChartComponent
                type="doughnut"
                data={salesDistribution.chartData}
                options={salesDistribution.chartOptions}
                height={320}
              />
              <div className="pointer-events-none absolute inset-0 flex -translate-y-6 flex-col items-center justify-center text-center">
                <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-200/70">Total</span>
                <span className="mt-1 text-4xl font-semibold text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]">
                  {salesDistribution.totalCount.toLocaleString('fr-FR')}
                </span>
                <span className="mt-1 text-xs text-cyan-200/60">ventes</span>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-cyan-100/70">
              Aucun volume de vente pour les critères sélectionnés.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Détails des ventes</h2>
            <p className="text-sm text-blue-200/70">
              {loading
                ? 'Chargement en cours…'
                : `${filteredRows.length.toLocaleString('fr-FR')} ventes enregistrées pour la période.`}
            </p>
          </div>
        </header>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.35em] text-blue-200/70">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Origine</th>
                <th className="px-4 py-3">Intitulé offre</th>
                <th className="px-4 py-3">Type offre</th>
                <th className="px-4 py-3">DID</th>
                <th className="px-4 py-3">Téléphone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-blue-100/70">
                    Chargement des ventes…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-blue-100/70">
                    Aucune vente enregistrée pour la période sélectionnée.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 whitespace-nowrap text-white/90">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/90">{row.agent}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/70">{row.origineLead}</td>
                    <td className="px-4 py-3 text-white">{row.intituleOffre || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/80">{row.typeOffre || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/70">{row.numeroId || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-white/70">{row.telephone || '—'}</td>
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

export default SupervisorLeadsSalesHistoryPage;
