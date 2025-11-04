import React from "react";
import { Pencil, Box, Wifi, Smartphone, Star } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import {
  subscribeToLeadAgentSummary,
  subscribeToLeadAgentSales,
  LeadAgentSummary,
  categorize,
} from "../services/leadsSalesService";

// Extend the imported type locally to add missing fields for this page
type LeadAgentSaleEntry = import("../services/leadsSalesService").LeadAgentSaleEntry & {
  telephone?: string;
  numeroId?: string;
};

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

  // Presets for selects
  const TYPE_OFFRE_OPTIONS = React.useMemo(() => [
    { value: "", label: "—" },
    { value: "Mobile", label: "Mobile" },
    { value: "Internet", label: "Internet" },
    { value: "Mobile Sosh", label: "Mobile SOSH" },
    { value: "Internet Sosh", label: "Internet SOSH" },
    { value: "Internet + Mobile", label: "Internet + Mobile" },
    { value: "InternetSosh + MobileSosh", label: "Internet SOSH + Mobile SOSH" },
  ], []);

  const ensureOption = (options: Array<{value:string; label:string}>, current: string | undefined | null) => {
    const v = (current || '').toString();
    if (!v) return options;
    return options.some(o => o.value === v) ? options : [{ value: v, label: `${v} (existant)` }, ...options];
  };

  // Fancy dropdown state for "Intitulé de l'offre"
  const offerMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [offerMenuOpen, setOfferMenuOpen] = React.useState(false);
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!offerMenuRef.current) return;
      if (!offerMenuRef.current.contains(e.target as Node)) setOfferMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Load full offers catalog (read-only) to make all offers choosable
  const [offersCatalog, setOffersCatalog] = React.useState<string[]>([]);
  const [offersLoading, setOffersLoading] = React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setOffersLoading(true);
      try {
        const snap = await getDoc(doc(db, 'leads_config', 'offers'));
        if (!mounted) return;
        if (snap.exists()) {
          const d: any = snap.data();
          const collected = new Set<string>();
          const take = (val: any) => {
            if (Array.isArray(val)) val.forEach(v => { if (typeof v === 'string' && v.trim()) collected.add(v.trim()); });
            else if (typeof val === 'string' && val.trim()) collected.add(val.trim());
          };
          if (Array.isArray(d?.offers)) take(d.offers);
          if (Array.isArray(d?.items)) take(d.items);
          if (d && typeof d === 'object') {
            Object.values(d).forEach(take);
          }
          setOffersCatalog(Array.from(collected).sort((a,b)=> a.localeCompare(b, 'fr')));
        } else {
          setOffersCatalog([]);
        }
      } catch {
        setOffersCatalog([]);
      } finally {
        if (mounted) setOffersLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Counters for the menu (approx from monthly summary)
  const countInternet = (summary?.box || 0) + (summary?.internetSosh || 0);
  const countMobile = (summary?.mobiles || 0) + (summary?.mobileSosh || 0);
  const countTotal = countInternet + countMobile;
  const countBest = Math.max(countInternet, countMobile);
  const countOthers = 0; // non catégorisés (si besoin, on pourra affiner plus tard)

  // Filter state for category selection (TOTAL / INTERNET / MOBILE / AUTRES / LES + VENDUS)
  const [offerCategory, setOfferCategory] = React.useState<null | 'total' | 'internet' | 'mobile' | 'autres' | 'best'>(null);

  // Simple classifier for offer labels to split Internet / Mobile / Autres
  const classifyOfferLabel = React.useCallback((label: string): 'internet' | 'mobile' | 'autres' => {
    const s = (label || '').toLowerCase();
    const isInternet = /(internet|box|fibre|livebox|adsl|vdsl|wifi|open|sfr fibre|fibre\s+optique)/i.test(s);
    const isMobile = /(mobile|forfait|sim|sms|go|5g|4g|smartphone|illimité|illimite)/i.test(s);
    if (isInternet && !isMobile) return 'internet';
    if (isMobile && !isInternet) return 'mobile';
    // If both or none, push to autres by default to avoid surprises
    return 'autres';
  }, []);

  

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

  // Compute "best sellers" list from user's current month sales (top 50 by frequency)
  const topOffers = React.useMemo(() => {
    const freq = new Map<string, number>();
    flattenedSales.forEach((r) => {
      const key = (r.offer || '').trim();
      if (!key) return;
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name]) => name);
  }, [flattenedSales]);

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
                        {row.origin === "opportunity" || row.origin === "dolead" || row.origin === "mm" ? row.origin : "—"}
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
                    <select
                      value={editModal.form.typeOffre}
                      onChange={(event) => handleEditChange("typeOffre", event.target.value)}
                      className="w-full rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    >
                      {ensureOption(TYPE_OFFRE_OPTIONS, editModal.form.typeOffre).map(opt => (
                        <option key={opt.value || 'blank'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
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
                    <div ref={offerMenuRef} className="relative">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.35em] text-sky-700/70">Catalogue d’offres</span>
                        <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-sky-700">
                          Total : {offersCatalog.length}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={editModal.form.intituleOffre}
                          onChange={(e)=> handleEditChange('intituleOffre', e.target.value)}
                          onFocus={()=> setOfferMenuOpen(true)}
                          placeholder="Saisir un intitulé ou choisir dans la liste"
                          className="w-full rounded-xl border border-sky-200/70 bg-white pr-9 pl-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                        />
                        <button
                          type="button"
                          onClick={() => setOfferMenuOpen((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 text-slate-500"
                          aria-label="Afficher les suggestions"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd"/></svg>
                        </button>
                      </div>
                      {offerMenuOpen && (
                        <div className="absolute z-10 mt-2 w-full rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl">
                          <ul className="space-y-2">
                            {([
                              { key:'total', label:'TOTAL', icon: Box, count: countTotal },
                              { key:'internet', label:'INTERNET', icon: Wifi, count: countInternet },
                              { key:'mobile', label:'MOBILE', icon: Smartphone, count: countMobile },
                              { key:'autres', label:'AUTRES', icon: Box, count: countOthers },
                              { key:'best', label:'LES + VENDUS', icon: Star, count: countBest },
                            ] as const).map((opt) => {
                              const active = offerCategory === opt.key;
                              return (
                                <li key={opt.key}>
                                  <button
                                    type="button"
                                    onClick={() => setOfferCategory(active ? null : (opt.key as any))}
                                    className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-slate-800 hover:bg-slate-50 ${
                                      active ? 'border-sky-300 bg-sky-50' : 'border-slate-200/80 bg-white'
                                    }`}
                                  >
                                    <span className="flex items-center gap-3">
                                      <opt.icon className={`h-4 w-4 ${active ? 'text-sky-700' : 'text-sky-600'}`} />
                                      <span className="uppercase tracking-[0.25em] text-slate-700 text-xs">{opt.label}</span>
                                    </span>
                                    <span className="text-slate-500 text-xs font-medium">{opt.count}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                          <div className="my-2 h-px bg-slate-200" />
                          <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                            {offerCategory === 'internet' && 'Offres Internet'}
                            {offerCategory === 'mobile' && 'Offres Mobile'}
                            {offerCategory === 'autres' && 'Autres offres'}
                            {offerCategory === 'best' && 'Les + vendus (mois en cours)'}
                            {(!offerCategory || offerCategory === 'total') && 'Toutes les offres'}
                          </div>
                          <div className="max-h-60 overflow-auto pr-1 custom-scrollbar">
                            {offersCatalog.length === 0 && offerCategory !== 'best' ? (
                              <div className="px-2 py-2 text-xs text-slate-400">{offersLoading ? 'Chargement…' : 'Aucune offre trouvée'}</div>
                            ) : (
                              <ul className="space-y-1">
                                {(() => {
                                  // Select the source list
                                  let source: string[] = [];
                                  if (offerCategory === 'best') source = topOffers;
                                  else source = offersCatalog;
                                  // Apply category filter
                                  if (offerCategory === 'internet') source = source.filter((o) => classifyOfferLabel(o) === 'internet');
                                  else if (offerCategory === 'mobile') source = source.filter((o) => classifyOfferLabel(o) === 'mobile');
                                  else if (offerCategory === 'autres') source = source.filter((o) => classifyOfferLabel(o) === 'autres');
                                  // Apply query filter from current input
                                  const q = (editModal.form?.intituleOffre || '').toLowerCase();
                                  if (q) source = source.filter((o) => o.toLowerCase().includes(q));
                                  // unique + slice for performance
                                  const uniq: string[] = Array.from(new Set(source));
                                  return uniq.slice(0, 100).map((offer) => (
                                    <li key={offer}>
                                      <button
                                        type="button"
                                        onClick={() => { handleEditChange('intituleOffre', offer); setOfferMenuOpen(false); }}
                                        className="w-full flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                                      >
                                        <span className="truncate pr-3">{offer}</span>
                                        <span className="text-slate-300 text-[10px]">Choisir</span>
                                      </button>
                                    </li>
                                  ));
                                })()}
                              </ul>
                            )}
                          </div>
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setOfferMenuOpen(false)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Utiliser « {editModal.form?.intituleOffre || '…'} » tel quel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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
                      <option value="opportunity">Opportunity</option>
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
