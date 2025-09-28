import React from "react";
import ChartComponent from "../../components/ChartComponent";
import {
  LeadKpiSnapshot,
  LeadDailySeriesEntry,
  subscribeToLeadKpis,
  subscribeToLeadMonthlySeries,
} from "../services/leadsSalesService";

const leadSources: Array<{ key: keyof LeadKpiSnapshot; label: string }> = [
  { key: "hipto", label: "Leads Hipto" },
  { key: "dolead", label: "Leads Dolead" },
  { key: "mm", label: "Leads MM" },
];

const initialSnapshot: LeadKpiSnapshot = {
  hipto: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
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
  const [selectedOrigin, setSelectedOrigin] = React.useState<"hipto" | "dolead" | "mm">("hipto");
  const [series, setSeries] = React.useState<LeadDailySeriesEntry[]>([]);

  React.useEffect(() => {
    const unsubscribe = subscribeToLeadKpis((snapshot) => {
      setData(snapshot);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    setSeries([]);
    const unsubscribe = subscribeToLeadMonthlySeries(selectedOrigin, (entries) => {
      setSeries(entries);
    });
    return () => unsubscribe();
  }, [selectedOrigin]);

  const totals = React.useMemo(() => {
    return leadSources.reduce(
      (acc, source) => {
        const metrics = data[source.key];
        return {
          mobiles: acc.mobiles + metrics.mobiles,
          box: acc.box + metrics.box,
        };
      },
      { mobiles: 0, box: 0 }
    );
  }, [data]);

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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Ventes du jour</h2>
      </div>

      <section className="grid gap-6 md:grid-cols-3">
        {leadSources.map((source) => {
          const metrics = data[source.key];
          return (
            <article
              key={source.key}
              className="rounded-3xl border border-white/10 bg-white/10 backdrop-blur-md p-6 shadow-xl shadow-black/20 transition-colors hover:bg-white/15"
            >
              <header className="flex items-center justify-between">
                <h2
                  className={`text-lg font-semibold ${
                    source.key === "hipto"
                      ? "text-[#7dd3fc]"
                      : source.key === "dolead"
                      ? "text-[#c4b5fd]"
                      : "text-[#93c5fd]"
                  }`}
                >
                  {source.label}
                </h2>
              </header>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-[#002FA7]/80 p-4 shadow-inner">
                  <p className="text-white/70 text-sm">Mobiles vendus</p>
                  <p className="mt-1 text-3xl font-semibold text-white">
                    {loading ? "--" : metrics.mobiles}
                  </p>
                </div>
                <div className="rounded-2xl bg-blue-900/70 p-4 shadow-inner">
                  <p className="text-blue-100/80 text-sm">Box vendues</p>
                  <p className="mt-1 text-3xl font-semibold text-blue-50">
                    {loading ? "--" : metrics.box}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Évolution mensuelle</h2>
            <p className="text-sm text-blue-100/80">
              Nombre de ventes mobiles et box réalisées ce mois-ci.
            </p>
          </div>
          <div className="flex rounded-full border border-white/20 p-1 bg-white/5">
            {leadSources.map((source) => (
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
                {source.label.split(" ")[1] || source.label}
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
              <p className="text-2xl font-semibold">{loading ? "--" : totals.mobiles}</p>
            </div>
            <div className="rounded-2xl bg-blue-900/80 px-4 py-3">
              <p className="text-xs text-blue-100/80">Box</p>
              <p className="text-2xl font-semibold">{loading ? "--" : totals.box}</p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-blue-100/60">
          Les indicateurs se mettent à jour automatiquement dès qu'une vente est enregistrée via l'espace Leads.
        </p>
      </section>
    </div>
  );
};

export default LeadsDashboardPage;
