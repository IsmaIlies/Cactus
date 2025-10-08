import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  subscribeToLeadAgentSummary,
  subscribeToLeadAgentSales,
  LeadAgentSummary,
  LeadAgentSaleEntry,
} from "../services/leadsSalesService";

const monthOptions = (count = 6) => {
  const options: Array<{ label: string; value: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const formatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
    options.push({ label: formatter.format(date), value: date.toISOString() });
  }
  return options;
};

const MONTH_OPTIONS = monthOptions();

const MyLeadSalesPage: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = React.useState<LeadAgentSummary | null>(null);
  const [sales, setSales] = React.useState<LeadAgentSaleEntry[]>([]);
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingSales, setLoadingSales] = React.useState(true);
  const [selectedMonthIso, setSelectedMonthIso] = React.useState<string>(MONTH_OPTIONS[0]?.value || new Date().toISOString());

  const selectedMonth = React.useMemo(() => new Date(selectedMonthIso), [selectedMonthIso]);

  React.useEffect(() => {
    if (!user?.id) {
      setSummary(null);
      setSales([]);
      setLoadingSummary(false);
      setLoadingSales(false);
      return;
    }

    setLoadingSummary(true);
    const unsubscribeSummary = subscribeToLeadAgentSummary(user.id, selectedMonth, (value) => {
      setSummary(value);
      setLoadingSummary(false);
    });

    setLoadingSales(true);
    const unsubscribeSales = subscribeToLeadAgentSales(user.id, selectedMonth, (items) => {
      setSales(items);
      setLoadingSales(false);
    });

    return () => {
      unsubscribeSummary();
      unsubscribeSales();
    };
  }, [user?.id, selectedMonth]);

  const totalMobiles = summary?.mobiles ?? 0;
  const totalBox = summary?.box ?? 0;
  const mobileSosh = summary?.mobileSosh ?? 0;
  const internetSosh = summary?.internetSosh ?? 0;
  const mobileNonSosh = Math.max(0, totalMobiles - mobileSosh);
  const internetNonSosh = Math.max(0, totalBox - internetSosh);

  const flattenedSales = React.useMemo(() => {
    return sales.flatMap((sale) => {
      const rows: Array<{ id: string; offer: string; createdAt: Date | null; origin: string }> = [
        { id: `${sale.id}-main`, offer: sale.intituleOffre, createdAt: sale.createdAt, origin: sale.origineLead || "" },
      ];
      sale.additionalOffers.forEach((offer, index) => {
        if (offer) {
          rows.push({ id: `${sale.id}-extra-${index}`, offer, createdAt: sale.createdAt, origin: sale.origineLead || "" });
        }
      });
      return rows;
    });
  }, [sales]);

  return (
    <div className="space-y-6 text-white">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mes ventes Leads</h1>
          <p className="text-sm text-blue-100/80">
            Visualise ici tes performances personnelles sur la mission Leads.
          </p>
        </div>
        <label className="text-sm text-blue-100/80 flex items-center gap-2">
          <span>Mois :</span>
          <select
            value={selectedMonthIso}
            onChange={(e) => setSelectedMonthIso(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            {MONTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <StatTile label="Mobiles" value={loadingSummary ? "--" : mobileNonSosh.toString()} />
        <StatTile label="Internet" value={loadingSummary ? "--" : internetNonSosh.toString()} />
        <StatTile label="Mobile SOSH" value={loadingSummary ? "--" : mobileSosh.toString()} />
        <StatTile label="Internet SOSH" value={loadingSummary ? "--" : internetSosh.toString()} />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Historique des ventes</h2>
        {loadingSales ? (
          <p className="text-sm text-blue-100/70">Chargement des ventes…</p>
        ) : flattenedSales.length === 0 ? (
          <p className="text-sm text-blue-100/70">Aucune vente enregistrée pour ce mois.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-blue-100/80">
              <thead className="text-xs uppercase tracking-[0.2em] text-blue-100/60">
                <tr>
                  <th className="px-4 py-2">Date & heure</th>
                  <th className="px-4 py-2">Offre</th>
                  <th className="px-4 py-2">Lead</th>
                </tr>
              </thead>
              <tbody>
                {flattenedSales.map((row) => {
                  const formatted = row.createdAt
                    ? new Intl.DateTimeFormat("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(row.createdAt)
                    : "-";
                  return (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="px-4 py-2 whitespace-nowrap">{formatted}</td>
                      <td className="px-4 py-2">{row.offer || "—"}</td>
                      <td className="px-4 py-2">
                        {row.origin === "hipto" || row.origin === "dolead" || row.origin === "mm" ? row.origin : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
        <p className="text-sm text-blue-100/70">
          Les ventes ci-dessus correspondent au mois sélectionné. Les totaux "Mobiles" et "Internet" excluent
          les ventes SOSH, listées séparément. Les catégories SOSH sont détectées automatiquement selon
          l'intitulé de chaque offre enregistrée.
        </p>
      </div>
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
    <p className="text-sm uppercase tracking-[0.3em] text-blue-100/60">{label}</p>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
  </div>
);

export default MyLeadSalesPage;
