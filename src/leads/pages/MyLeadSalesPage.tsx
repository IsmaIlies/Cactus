import React from "react";
import { Pencil } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import {
  subscribeToLeadAgentSummary,
  subscribeToLeadAgentSales,
  LeadAgentSummary,
  LeadAgentSaleEntry,
  categorize,
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
  const [phoneFilter, setPhoneFilter] = React.useState<string>('');
  const [didFilter, setDidFilter] = React.useState<string>('');
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingSales, setLoadingSales] = React.useState(true);
  const [selectedMonthIso, setSelectedMonthIso] = React.useState<string>(MONTH_OPTIONS[0]?.value || new Date().toISOString());
  const [editModal, setEditModal] = React.useState<{
    saleId: string;
    loading: boolean;
    error: string | null;
    saving: boolean;
    form: EditFormState | null;
  }>({ saleId: "", loading: false, error: null, saving: false, form: null });

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

  // Les totaux renvoyés par subscribeToLeadAgentSummary sont déjà hors SOSH pour mobiles et internet
  const mobiles = summary?.mobiles ?? 0; // hors SOSH
  const internet = summary?.box ?? 0; // hors SOSH
  const mobileSosh = summary?.mobileSosh ?? 0;
  const internetSosh = summary?.internetSosh ?? 0;

  const normalizedPhoneFilter = React.useMemo(() => phoneFilter.replace(/\s+/g, ''), [phoneFilter]);
  const filteredSales = React.useMemo(() => {
    return sales.filter((sale) => {
      const phone = (sale.telephone || '').replace(/\s+/g, '');
      const did = (sale.numeroId || '').toLowerCase();
      const phoneOk = normalizedPhoneFilter === '' || phone.includes(normalizedPhoneFilter);
      const didOk = didFilter.trim() === '' || did.includes(didFilter.trim().toLowerCase());
      return phoneOk && didOk;
    });
  }, [sales, normalizedPhoneFilter, didFilter]);

  const flattenedSales = React.useMemo(() => {
    return filteredSales.flatMap((sale) => {
      const rows: Array<{
        id: string;
        offer: string;
        createdAt: Date | null;
        origin: string;
        saleId: string;
        isMain: boolean;
        telephone?: string;
        numeroId?: string;
      }> = [
        {
          id: `${sale.id}-main`,
          offer: sale.intituleOffre,
          createdAt: sale.createdAt,
          origin: sale.origineLead || "",
          saleId: sale.id,
          isMain: true,
          telephone: sale.telephone,
          numeroId: sale.numeroId,
        },
      ];
      sale.additionalOffers.forEach((offer, index) => {
        if (offer) {
          rows.push({
            id: `${sale.id}-extra-${index}`,
            offer,
            createdAt: sale.createdAt,
            origin: sale.origineLead || "",
            saleId: sale.id,
            isMain: false,
            telephone: sale.telephone,
            numeroId: sale.numeroId,
          });
        }
      });
      return rows;
    });
  }, [filteredSales]);

  const openEditModal = React.useCallback(async (saleId: string) => {
    setEditModal({ saleId, loading: true, error: null, saving: false, form: null });
    try {
      const snap = await getDoc(doc(db, "leads_sales", saleId));
      if (!snap.exists()) {
        setEditModal((prev) => ({ ...prev, loading: false, error: "Vente introuvable.", form: null }));
        return;
      }
      const data = snap.data() as any;
      const form: EditFormState = {
        telephone: data?.telephone ?? "",
        numeroId: data?.numeroId ?? "",
        typeOffre: data?.typeOffre ?? "",
        intituleOffre: data?.intituleOffre ?? "",
        referencePanier: data?.referencePanier ?? "",
        ficheDuJour: data?.ficheDuJour ?? "",
        origineLead: (data?.origineLead || "").toString().toLowerCase(),
        dateTechnicien: data?.dateTechnicien ?? "",
        additionalOffers: Array.isArray(data?.additionalOffers)
          ? data.additionalOffers.map((offer: any) => offer?.intituleOffre || "").filter(Boolean).join("\n")
          : "",
      };
      setEditModal({ saleId, loading: false, error: null, saving: false, form });
    } catch (error: any) {
      console.error("openEditModal", error);
      setEditModal((prev) => ({ ...prev, loading: false, error: "Impossible de charger la vente.", form: null }));
    }
  }, []);

  const closeEditModal = React.useCallback(() => {
    setEditModal({ saleId: "", loading: false, error: null, saving: false, form: null });
  }, []);

  const handleEditChange = React.useCallback(
    (key: keyof EditFormState, value: string) => {
      setEditModal((prev) => {
        if (!prev.form) return prev;
        return { ...prev, form: { ...prev.form, [key]: value } };
      });
    },
    []
  );

  const handleEditSubmit = React.useCallback(async () => {
    setEditModal((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const { saleId, form } = editModal;
      if (!saleId || !form) return;
      const clean = {
        telephone: form.telephone.trim(),
        numeroId: form.numeroId.trim(),
        typeOffre: form.typeOffre.trim(),
        intituleOffre: form.intituleOffre.trim(),
        referencePanier: form.referencePanier.trim(),
        ficheDuJour: form.ficheDuJour.trim(),
        origineLead: form.origineLead || null,
        dateTechnicien: form.dateTechnicien ? form.dateTechnicien.trim() : null,
        additionalOffers: form.additionalOffers
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((label) => ({ intituleOffre: label })),
      };
      const counts = categorize(clean.typeOffre);
      await updateDoc(doc(db, "leads_sales", saleId), {
        ...clean,
        mobileCount: counts.mobile,
        boxCount: counts.internet,
        mobileSoshCount: counts.mobileSosh,
        internetSoshCount: counts.internetSosh,
      });
      setEditModal((prev) => ({ ...prev, saving: false, error: null }));
      closeEditModal();
    } catch (error: any) {
      console.error("handleEditSubmit", error);
      setEditModal((prev) => ({ ...prev, saving: false, error: "Impossible d’enregistrer la vente." }));
    }
  }, [editModal, closeEditModal]);

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
        <StatTile label="Mobiles" value={loadingSummary ? "--" : mobiles.toString()} />
        <StatTile label="Internet" value={loadingSummary ? "--" : internet.toString()} />
        <StatTile label="Mobile SOSH" value={loadingSummary ? "--" : mobileSosh.toString()} />
        <StatTile label="Internet SOSH" value={loadingSummary ? "--" : internetSosh.toString()} />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Historique des ventes</h2>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-blue-100/60">
            Téléphone
            <input
              type="text"
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              placeholder="Rechercher par numéro"
              className="mt-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-blue-100/40 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col text-xs uppercase tracking-[0.3em] text-blue-100/60">
            DID
            <input
              type="text"
              value={didFilter}
              onChange={(e) => setDidFilter(e.target.value)}
              placeholder="Rechercher par DID"
              className="mt-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-blue-100/40 focus:border-white/40 focus:outline-none"
            />
          </label>
        </div>
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
                  <th className="px-4 py-2">Téléphone</th>
                  <th className="px-4 py-2">DID</th>
                  <th className="px-4 py-2">Lead</th>
                  <th className="px-4 py-2 text-right">Actions</th>
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
                      <td className="px-4 py-2 whitespace-nowrap">{row.telephone || '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{row.numeroId || '—'}</td>
                      <td className="px-4 py-2">
                        {row.origin === "hipto" || row.origin === "dolead" || row.origin === "mm" ? row.origin : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {row.isMain ? (
                          <button
                            type="button"
                            onClick={() => openEditModal(row.saleId)}
                            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-blue-100 transition hover:border-white/40 hover:bg-white/20 hover:text-white"
                            aria-label="Modifier la vente"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="text-blue-100/40">—</span>
                        )}
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

      {editModal.saleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-100 via-sky-50 to-white p-8 font-sans shadow-[0_24px_80px_rgba(56,189,248,0.35)]">
            <button
              type="button"
              onClick={closeEditModal}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200/70 bg-white text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
              aria-label="Fermer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {editModal.loading ? (
              <div className="py-10 text-center text-sky-700">Chargement des informations…</div>
            ) : editModal.error ? (
              <div className="space-y-4">
                <p className="text-sm text-rose-500">{editModal.error}</p>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 hover:bg-slate-100"
                >
                  Fermer
                </button>
              </div>
            ) : editModal.form ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleEditSubmit();
                }}
                className="space-y-6"
              >
                <header className="space-y-1.5">
                  <p className="text-xs uppercase tracking-[0.4em] text-sky-600/70">Modifier la vente</p>
                  <h2 className="text-2xl font-semibold text-slate-900">{editModal.form.intituleOffre || "Vente"}</h2>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">ID : {editModal.saleId}</p>
                </header>

                <div className="grid gap-4 sm:grid-cols-2">
                  <EditField label="Téléphone">
                    <input
                      type="tel"
                      value={editModal.form.telephone}
                      onChange={(event) => handleEditChange("telephone", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="DID / Numéro ID">
                    <input
                      type="text"
                      value={editModal.form.numeroId}
                      onChange={(event) => handleEditChange("numeroId", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="Type d'offre">
                    <input
                      type="text"
                      value={editModal.form.typeOffre}
                      onChange={(event) => handleEditChange("typeOffre", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="Date technicien">
                    <input
                      type="text"
                      value={editModal.form.dateTechnicien || ""}
                      onChange={(event) => handleEditChange("dateTechnicien", event.target.value)}
                      placeholder="JJ/MM/AAAA"
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="Intitulé de l'offre">
                    <input
                      type="text"
                      value={editModal.form.intituleOffre}
                      onChange={(event) => handleEditChange("intituleOffre", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="Référence panier">
                    <input
                      type="text"
                      value={editModal.form.referencePanier}
                      onChange={(event) => handleEditChange("referencePanier", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="Fiche du jour">
                    <input
                      type="text"
                      value={editModal.form.ficheDuJour}
                      onChange={(event) => handleEditChange("ficheDuJour", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  </EditField>
                  <EditField label="Origine du lead">
                    <select
                      value={editModal.form.origineLead}
                      onChange={(event) => handleEditChange("origineLead", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    >
                      <option value="">—</option>
                      <option value="hipto">Hipto</option>
                      <option value="dolead">Dolead</option>
                      <option value="mm">Mars Marketing</option>
                    </select>
                  </EditField>
                </div>

                <EditField label="Offres additionnelles (une par ligne)">
                  <textarea
                    value={editModal.form.additionalOffers}
                    onChange={(event) => handleEditChange("additionalOffers", event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                  />
                </EditField>

                {editModal.error && <p className="text-sm text-rose-500">{editModal.error}</p>}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={editModal.saving}
                    className={`inline-flex items-center gap-2 rounded-full border border-sky-300 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-sky-700 transition ${
                      editModal.saving ? "cursor-wait opacity-70" : "hover:border-sky-400 hover:bg-sky-400/10"
                    }`}
                  >
                    {editModal.saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

type EditFormState = {
  telephone: string;
  numeroId: string;
  typeOffre: string;
  intituleOffre: string;
  referencePanier: string;
  ficheDuJour: string;
  origineLead: string;
  dateTechnicien: string | null;
  additionalOffers: string;
};

const EditField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-600">
    {label}
    {children}
  </label>
);

const StatTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
    <p className="text-sm uppercase tracking-[0.3em] text-blue-100/60">{label}</p>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
  </div>
);

export default MyLeadSalesPage;
