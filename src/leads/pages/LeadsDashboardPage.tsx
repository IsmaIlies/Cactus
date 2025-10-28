import React from "react";
import ChartComponent from "../../components/ChartComponent";
import {
  LeadKpiSnapshot,
  LeadDailySeriesEntry,
  subscribeToLeadKpis,
  subscribeToLeadMonthlySeries,
  subscribeToLeadMonthlyTotalsAllSources,
  subscribeToRecentLeadSales,
  RecentLeadSale,
  categorize,
} from "../services/leadsSalesService";

const leadSources: Array<{ key: keyof LeadKpiSnapshot; label: string; accent: string; gradient: string }> = [
  { key: "opportunity", label: "Opportunity", accent: "text-cyan-200", gradient: "from-[#0a152a] via-[#09172f] to-[#071326]" },
  { key: "dolead", label: "Dolead", accent: "text-purple-200", gradient: "from-[#140f2a] via-[#1a1235] to-[#0d0a1f]" },
  { key: "mm", label: "MM", accent: "text-emerald-200", gradient: "from-[#101b29] via-[#0a1320] to-[#050a13]" },
];

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

const addBreakdown = (target: LeadBreakdown, source: LeadBreakdown) => {
  target.internet += source.internet;
  target.internetSosh += source.internetSosh;
  target.mobile += source.mobile;
  target.mobileSosh += source.mobileSosh;
  target.total += source.total;
};

const breakdownFromKpi = (kpi: LeadKpiSnapshot[keyof LeadKpiSnapshot]): LeadBreakdown => ({
  internet: kpi.box,
  internetSosh: kpi.internetSosh,
  mobile: kpi.mobiles,
  mobileSosh: kpi.mobileSosh,
  total: kpi.box + kpi.internetSosh + kpi.mobiles + kpi.mobileSosh,
});

const breakdownFromOffer = (typeOffre: string): LeadBreakdown => {
  const cat = categorize(typeOffre);
  return {
    internet: cat.internet,
    internetSosh: cat.internetSosh,
    mobile: cat.mobile,
    mobileSosh: cat.mobileSosh,
    total: cat.internet + cat.internetSosh + cat.mobile + cat.mobileSosh,
  };
};

const LeadSourceCard: React.FC<{ label: string; breakdown: LeadBreakdown; loading: boolean; accent: string; gradient: string }>
  = ({ label, breakdown, loading, accent, gradient }) => {
    const metrics = [
      { key: "internet", label: "Internet", value: breakdown.internet },
      { key: "internetSosh", label: "Internet Sosh", value: breakdown.internetSosh },
      { key: "mobile", label: "Mobile", value: breakdown.mobile },
      { key: "mobileSosh", label: "Mobile Sosh", value: breakdown.mobileSosh },
    ];
    const formatValue = (value: number) => (loading ? "--" : value.toLocaleString("fr-FR"));

    return (
      <article className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-5 shadow-[0_18px_45px_rgba(8,20,60,0.45)]`}>
        <div className="absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.28),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.22),transparent_60%)]" />
        <div className="relative flex h-full flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <h2 className={`text-lg font-semibold ${accent}`}>{label}</h2>
            <span className="text-xs font-semibold uppercase tracking-[0.45em] text-blue-100/70">Jour</span>
          </div>
          <div>
            <p className="text-4xl font-bold text-white">{formatValue(breakdown.total)}</p>
            <p className="text-xs text-blue-100/60">Total ventes</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-blue-100/80">
            {metrics.map((metric) => (
              <div key={metric.key} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">{metric.label}</p>
                <p className="text-lg font-semibold text-white">{formatValue(metric.value)}</p>
              </div>
            ))}
          </div>
        </div>
      </article>
    );
  };

const initialSnapshot: LeadKpiSnapshot = {
    opportunity: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
    dolead: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
    mm: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
};

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
    },
    tooltip: {
      mode: "index" as const,
      intersect: false,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.08)" },
      ticks: { color: "rgba(255,255,255,0.7)" },
    },
    y: {
      beginAtZero: true,
      grid: { color: "rgba(255,255,255,0.08)" },
      ticks: { color: "rgba(255,255,255,0.7)" },
    },
  },
};

const LeadsDashboardPage: React.FC = () => {
  const [data, setData] = React.useState<LeadKpiSnapshot>(initialSnapshot);
  const [loading, setLoading] = React.useState(true);
  const [selectedOrigin, setSelectedOrigin] = React.useState<"opportunity" | "dolead" | "mm">("opportunity");
  const [series, setSeries] = React.useState<LeadDailySeriesEntry[]>([]);
  const [monthlyTotals, setMonthlyTotals] = React.useState({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });
  const [recentSales, setRecentSales] = React.useState<RecentLeadSale[]>([]);

  React.useEffect(() => {
    const unsubscribe = subscribeToLeadKpis((snapshot) => {
      setData(snapshot);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    setSeries([]);
    if (selectedOrigin === 'opportunity') return;
    const unsubscribe = subscribeToLeadMonthlySeries(selectedOrigin, (entries) => {
      setSeries(entries);
    });
    return () => unsubscribe();
  }, [selectedOrigin]);

  React.useEffect(() => {
    const un1 = subscribeToLeadMonthlyTotalsAllSources((tot) => setMonthlyTotals(tot));
    const un2 = subscribeToRecentLeadSales(200, (items) => setRecentSales(items));
    return () => {
      try { (un1 as any)?.(); } catch {}
      try { (un2 as any)?.(); } catch {}
    };
  }, []);

  const chartData = React.useMemo(() => {
    const labels = series.map((entry) => entry.date.slice(5));
    const mobiles = series.map((entry) => entry.mobiles);
    const box = series.map((entry) => entry.box);
    return {
      labels,
      datasets: [
        {
          label: "Mobiles",
          data: mobiles,
          borderColor: "#34d399",
          backgroundColor: "rgba(52, 211, 153, 0.2)",
          borderWidth: 2,
          fill: true,
          tension: 0.2,
        },
        {
          label: "Box",
          data: box,
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96, 165, 250, 0.2)",
          borderWidth: 2,
          fill: true,
          tension: 0.2,
        },
      ],
    };
  }, [series]);

  const sourceBreakdowns = React.useMemo(() => ({
    opportunity: breakdownFromKpi(data.opportunity),
    dolead: breakdownFromKpi(data.dolead),
    mm: breakdownFromKpi(data.mm),
  }), [data]);

  const agentDailyBreakdown = React.useMemo(() => {
    if (recentSales.length === 0) {
      return [] as Array<{ agent: string; counts: LeadBreakdown }>;
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const map = new Map<string, LeadBreakdown>();

    recentSales.forEach((sale) => {
      if (!sale.createdAt || sale.createdAt < startOfDay) return;
      const agentLabel = (sale.agent || "Agent inconnu").trim() || "Agent inconnu";
      const breakdown = breakdownFromOffer(String(sale.typeOffre || ""));
      const current = map.get(agentLabel) ?? createEmptyBreakdown();
      addBreakdown(current, breakdown);
      map.set(agentLabel, current);
    });

    return Array.from(map.entries())
      .map(([agent, counts]) => ({ agent, counts }))
      .sort((a, b) => b.counts.total - a.counts.total);
  }, [recentSales]);

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center gap-3">
        <span className="text-4xl" role="img" aria-label="trophy">🏆</span>
        <div>
          <h1 className="text-3xl font-semibold tracking-wide">TEAM</h1>
          <p className="text-blue-100/80 text-sm">
            Suivi des conversions mobiles et box par origine de leads.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-1 text-white">
          <h2 className="text-lg font-semibold">Ventes du jour</h2>
          <p className="text-sm text-blue-100/80">Répartition temps réel par origine de leads.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {leadSources.map((source) => (
            <LeadSourceCard
              key={source.key}
              label={source.label}
              breakdown={sourceBreakdowns[source.key]}
              loading={loading}
              accent={source.accent}
              gradient={source.gradient}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Évolution mensuelle</h2>
            <p className="text-sm text-blue-100/80">Nombre de ventes mobiles et box réalisées ce mois-ci.</p>
          </div>
          <div className="flex rounded-full border border-white/20 p-1 bg-white/5">
            <button
              type="button"
              onClick={() => setSelectedOrigin('opportunity')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedOrigin === 'opportunity'
                  ? "bg-white text-[#002FA7]"
                  : "text-blue-100 hover:bg-white/10"
              }`}
            >
              Opportunity
            </button>
            {leadSources.filter(s => s.key !== 'opportunity').map((source) => (
              <button
                key={source.key}
                type="button"
                onClick={() => setSelectedOrigin(source.key)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedOrigin === source.key
                    ? "bg-white text-[#002FA7]"
                    : "text-blue-100 hover:bg-white/10"
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 h-[320px]">
          {series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-blue-100/60 text-sm">
              {loading
                ? "Chargement..."
                : "Pas encore de ventes enregistrées pour cette source ce mois-ci."}
            </div>
          ) : (
            <ChartComponent type="line" data={chartData} options={lineChartOptions} />
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md text-sm text-blue-50 shadow-lg">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-blue-100/60">Total cumul mensuel</p>
            <p className="text-lg font-semibold text-white">Performance Leads</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center text-white">
            <div className="rounded-2xl bg-[#002FA7]/80 px-4 py-3">
              <p className="text-xs text-blue-100/80">Mobiles</p>
              <p className="text-2xl font-semibold">{loading ? "--" : monthlyTotals.mobiles}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-[11px] text-blue-100/80">Sosh</p>
                  <p className="text-lg font-semibold">{loading ? "--" : monthlyTotals.mobileSosh}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-[11px] text-blue-100/80">Orange</p>
                  <p className="text-lg font-semibold">{loading ? "--" : Math.max(0, monthlyTotals.mobiles - monthlyTotals.mobileSosh)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-blue-900/80 px-4 py-3">
              <p className="text-xs text-blue-100/80">Box</p>
              <p className="text-2xl font-semibold">{loading ? "--" : monthlyTotals.box}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-[11px] text-blue-100/80">Sosh</p>
                  <p className="text-lg font-semibold">{loading ? "--" : monthlyTotals.internetSosh}</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2">
                  <p className="text-[11px] text-blue-100/80">Orange</p>
                  <p className="text-lg font-semibold">{loading ? "--" : Math.max(0, monthlyTotals.box - monthlyTotals.internetSosh)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-blue-100/60">
          Les indicateurs se mettent à jour automatiquement dès qu'une vente est enregistrée via l'espace Leads.
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md text-white shadow-xl">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ventes du jour par agent</h2>
            <p className="text-sm text-blue-100/70">Synthèse des conversions d'aujourd'hui (Internet & Mobile).</p>
          </div>
          <span className="text-xs text-blue-200/60">Actualisation automatique</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm text-blue-50">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.35em] text-blue-200/70">
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
              {agentDailyBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-blue-200/70">
                    {loading ? "Chargement des ventes..." : "Aucune vente enregistrée aujourd'hui."}
                  </td>
                </tr>
              ) : (
                agentDailyBreakdown.map((entry) => (
                  <tr key={entry.agent} className="hover:bg-white/5">
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

export default LeadsDashboardPage;
