import React from 'react';
import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { categorize } from '../leads/services/leadsSalesService';
import { db } from '../firebase';

const CANONICAL_AGENT_ALIASES: Array<{ label: string; patterns: Array<(value: string) => boolean> }> = [
  {
    label: 'TOM HALADJIAN MARIOTTI',
    patterns: [
      (value) => /tom/.test(value) && /mariotti/.test(value),
      (value) => /tom/.test(value) && /haladjian/.test(value),
    ],
  },
];

const resolveAgentLabel = (displayName?: string | null, email?: string | null) => {
  const candidates = [displayName, email]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim());

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    for (const alias of CANONICAL_AGENT_ALIASES) {
      if (alias.patterns.some((matcher) => matcher(lower))) {
        return alias.label;
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  return 'Agent inconnu';
};

const monthOptions = (() => {
  const options: Array<{ label: string; value: string }> = [];
  const current = new Date();
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    options.push({ label, value });
  }
  return options;
})();

type AgentAggregates = {
  label: string;
  leadCount: number;
  internetSales: number;
  mobileSales: number;
};

const formatNumber = (value: number) => value.toLocaleString('fr-FR');

const SupervisorLeadsAgentStatsPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    monthOptions[0]?.value || new Date().toISOString().slice(0, 10)
  );
  const [rows, setRows] = React.useState<AgentAggregates[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string>('');

  const selectedMonthDate = React.useMemo(() => {
    const parsed = new Date(selectedMonth);
    if (Number.isNaN(parsed.getTime())) {
      const fallback = new Date();
      fallback.setDate(1);
      return fallback;
    }
    return parsed;
  }, [selectedMonth]);

  React.useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError('');
      try {
        const monthStart = new Date(
          selectedMonthDate.getFullYear(),
          selectedMonthDate.getMonth(),
          1,
          0,
          0,
          0,
          0
        );
        const monthEndExclusive = new Date(
          selectedMonthDate.getFullYear(),
          selectedMonthDate.getMonth() + 1,
          1,
          0,
          0,
          0,
          0
        );

        const q = query(
          collection(db, 'leads_sales'),
          where('mission', '==', 'ORANGE_LEADS'),
          where('createdAt', '>=', Timestamp.fromDate(monthStart)),
          where('createdAt', '<', Timestamp.fromDate(monthEndExclusive)),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

        const aggregates = new Map<string, AgentAggregates>();

        snapshot.forEach((document) => {
          const data = document.data() as Record<string, unknown>;
          const createdBy = (data?.createdBy ?? {}) as Record<string, unknown>;
          const label = resolveAgentLabel(
            createdBy?.displayName as string | undefined,
            createdBy?.email as string | undefined
          );
          const current = aggregates.get(label) || {
            label,
            leadCount: 0,
            internetSales: 0,
            mobileSales: 0,
          };

          const categorized = categorize(data?.typeOffre as string | undefined | null);
          current.leadCount += 1;
          current.internetSales += categorized.internet + categorized.internetSosh;
          current.mobileSales += categorized.mobile + categorized.mobileSosh;
          aggregates.set(label, current);
        });

        const nextRows = Array.from(aggregates.values()).sort((a, b) => b.leadCount - a.leadCount);
        setRows(nextRows);
      } catch (err: any) {
        setRows([]);
        setError(err?.message || 'Impossible de charger les statistiques agents.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedMonthDate, selectedMonth]);

  const totalLeads = rows.reduce((acc, row) => acc + row.leadCount, 0);
  const totalInternet = rows.reduce((acc, row) => acc + row.internetSales, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Stat Agent</h1>
          <p className="text-sm text-blue-200/80">
            Répartition des ventes par téléacteur sur la période sélectionnée.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-blue-100/80">
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
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-white/5 p-4 shadow-[0_20px_60px_rgba(34,211,238,0.18)]">
        <div className="pointer-events-none absolute -top-24 -left-12 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-60 w-60 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="uppercase tracking-[0.35em] text-xs text-blue-200/70">
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-right">Ventes</th>
                <th className="px-4 py-3 text-right">Internet</th>
                <th className="px-4 py-3 text-right">Mobile</th>
                <th className="px-4 py-3 text-right">Taux Internet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/90">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-blue-100/70">
                    Chargement des statistiques agents…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-blue-100/70">
                    Aucune vente enregistrée pour la période.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const internetRate = row.leadCount > 0 ? (row.internetSales / row.leadCount) * 100 : 0;
                  return (
                    <tr key={row.label} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-left font-semibold text-white">{row.label}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.leadCount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-200">{formatNumber(row.internetSales)}</td>
                      <td className="px-4 py-3 text-right text-sky-200">{formatNumber(row.mobileSales)}</td>
                      <td className="px-4 py-3 text-right text-emerald-100">
                        {row.leadCount > 0
                          ? `${internetRate.toLocaleString('fr-FR', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })} %`
                          : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="divide-y divide-white/10 text-white">
                <tr className="bg-white/5">
                  <td className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatNumber(totalLeads)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-200">{formatNumber(totalInternet)}</td>
                  <td className="px-4 py-3 text-right" />
                  <td className="px-4 py-3 text-right text-emerald-100">
                    {totalLeads > 0
                      ? `${((totalInternet / totalLeads) * 100).toLocaleString('fr-FR', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })} %`
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
};

export default SupervisorLeadsAgentStatsPage;
