import React from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { Download, Pencil, Trash2, X } from "lucide-react";
import { utils as XLSXUtils, writeFile as writeXlsxFile } from "xlsx";
import { db } from "../firebase";

type LeadRow = {
  id: string;
  startedAt: Date | null;
  completedAt: Date | null;
  email: string | null;
  displayName: string | null;
  numeroId: string | null;
  typeOffre: string | null;
  intituleOffre: string | null;
  referencePanier: string | null;
  codeAlf: string | null;
  ficheDuJour: string | null;
  origineLead: string | null;
  dateTechnicien: string | null;
  telephone: string | null;
};

const HEADERS = [
  "ID",
  "Heure de début",
  "Heure de fin",
  "Adresse de messagerie",
  "Nom",
  "DID",
  "Type d'offre",
  "Intitulé de l'offre (jaune)",
  "Référence du panier",
  "CODE ALF",
  "FICHE DU JOUR",
  "ORIGINE LEADS",
  "Date technicien",
  "Numéro de téléphone de la fiche",
] as const;

const TABLE_COLUMNS = "grid grid-cols-[110px_110px_1.4fr_1.1fr_1.1fr_0.8fr_1.4fr_120px_100px]";

const pad2 = (value: number) => value.toString().padStart(2, "0");

const formatDateTime = (date: Date | null) => {
  if (!date) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}  ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

const buildWorksheetData = (rows: LeadRow[]) => {
  const headerRow = Array.from(HEADERS);

  const dataRows = rows.map((row) => [
    row.id,
    formatDateTime(row.startedAt),
    formatDateTime(row.completedAt),
    row.email || "",
    row.displayName || "",
    row.numeroId || "",
    row.typeOffre || "",
    row.intituleOffre || "",
    row.referencePanier || "",
    row.codeAlf || "",
    row.ficheDuJour || "",
    (row.origineLead || "").toUpperCase(),
    row.dateTechnicien || "",
    row.telephone || "",
  ]);

  return [headerRow, ...dataRows];
};

const createWorkbook = (rows: LeadRow[]) => {
  const worksheet = XLSXUtils.aoa_to_sheet(buildWorksheetData(rows));
  worksheet["!cols"] = [
    { wch: 36 }, // ID
    { wch: 20 },
    { wch: 20 },
    { wch: 32 },
    { wch: 28 },
    { wch: 14 },
    { wch: 20 },
    { wch: 32 },
    { wch: 24 },
    { wch: 16 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
  ];

  const workbook = XLSXUtils.book_new();
  XLSXUtils.book_append_sheet(workbook, worksheet, "Ventes LEADS");
  return workbook;
};

const OFFER_FILTERS = [
  { value: "internet", label: "Internet" },
  { value: "internet sosh", label: "Internet Sosh" },
  { value: "mobile", label: "Mobile" },
  { value: "mobile sosh", label: "Mobile Sosh" },
] as const;

const EDITABLE_FIELDS = [
  { key: "displayName", label: "Téléacteur" },
  { key: "numeroId", label: "DID" },
  { key: "typeOffre", label: "Type d'offre" },
  { key: "intituleOffre", label: "Intitulé de l'offre" },
  { key: "referencePanier", label: "Référence du panier" },
  { key: "codeAlf", label: "Code ALF" },
  { key: "ficheDuJour", label: "Fiche du jour" },
  { key: "origineLead", label: "Origine lead" },
  { key: "dateTechnicien", label: "Date technicien" },
  { key: "telephone", label: "Téléphone" },
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number]["key"];

const CANONICAL_AGENT_ALIASES: Array<{ label: string; patterns: Array<(value: string) => boolean> }> = [
  {
    label: "TOM HALADJIAN MARIOTTI",
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

  return null;
};

const SupervisorLeadsExportPage: React.FC = () => {
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filtres
  const [agentFilter, setAgentFilter] = React.useState("all");
  const [originFilter, setOriginFilter] = React.useState("all");
  const [offerFilter, setOfferFilter] = React.useState("all");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [phoneFilter, setPhoneFilter] = React.useState("");
  const [didFilter, setDidFilter] = React.useState("");

  // Edition
  const [editingRow, setEditingRow] = React.useState<LeadRow | null>(null);
  const [editData, setEditData] = React.useState<Record<EditableField, string>>({} as any);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Chargement Firestore
  React.useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "leads_sales"),
      where("mission", "==", "ORANGE_LEADS"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextRows = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          const startedAtSource = (data?.startedAt as Timestamp | undefined) ?? (data?.createdAt as Timestamp | undefined) ?? null;
          const completedAtSource = (data?.completedAt as Timestamp | undefined) ?? null;
          const startedAt = startedAtSource instanceof Timestamp ? startedAtSource.toDate() : null;
          const completedAt = completedAtSource instanceof Timestamp ? completedAtSource.toDate() : null;
          const createdBy = (data?.createdBy ?? {}) as Record<string, unknown>;
          const resolvedDisplayName = resolveAgentLabel(createdBy?.displayName as string | undefined, createdBy?.email as string | undefined);
          return {
            id: doc.id,
            startedAt,
            completedAt,
            email: (createdBy?.email as string | undefined) ?? null,
            displayName: resolvedDisplayName,
            numeroId: (data?.numeroId as string | undefined) ?? null,
            typeOffre: (data?.typeOffre as string | undefined) ?? null,
            intituleOffre: (data?.intituleOffre as string | undefined) ?? null,
            referencePanier: (data?.referencePanier as string | undefined) ?? null,
            codeAlf: (data?.codeAlf as string | undefined) ?? null,
            ficheDuJour: (data?.ficheDuJour as string | undefined) ?? null,
            origineLead: (data?.origineLead as string | undefined) ?? null,
            dateTechnicien: (data?.dateTechnicien as string | undefined) ?? null,
            telephone: (data?.telephone as string | undefined) ?? null,
          } satisfies LeadRow;
        });
        setRows(nextRows);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Lecture impossible");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Filtres dynamiques
  const agentOptions = React.useMemo(() => {
    const labels = new Set<string>();
    CANONICAL_AGENT_ALIASES.forEach((alias) => labels.add(alias.label));
    rows.forEach((row) => {
      const label = row.displayName || row.email;
      if (label) labels.add(label);
    });
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [rows]);

  const originOptions = React.useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      if (row.origineLead) values.add(row.origineLead.trim().toLowerCase());
    });
    return Array.from(values).map((v) => ({ value: v, label: v.toUpperCase() }));
  }, [rows]);

  const offerOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const label = row.intituleOffre?.trim();
      if (!label) return;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  }, [rows]);

  // Normalisation téléphone
  const normalizedPhoneFilter = phoneFilter.replace(/\s+/g, "");

  // Filtres appliqués
  const filteredRows = React.useMemo(() => {
    const startBoundary = startDate ? new Date(startDate) : null;
    const endBoundary = endDate ? new Date(`${endDate}T23:59:59`) : null;
    return rows.filter((row) => {
      const baseDate = row.startedAt ?? row.completedAt;
      const timestamp = baseDate?.getTime();
      if (startBoundary && (!timestamp || timestamp < startBoundary.getTime())) return false;
      if (endBoundary && (!timestamp || timestamp > endBoundary.getTime())) return false;
      if (agentFilter !== "all") {
        const label = (row.displayName || row.email || "").toLowerCase();
        if (label !== agentFilter.toLowerCase()) return false;
      }
      if (originFilter !== "all") {
        const originValue = (row.origineLead ?? "").trim().toLowerCase();
        if (originValue !== originFilter) return false;
      }
      if (offerFilter !== "all") {
        const offerValue = (row.typeOffre ?? "").trim().toLowerCase();
        if (offerValue !== offerFilter) return false;
      }
      if (normalizedPhoneFilter) {
        const phone = (row.telephone || '').replace(/\s+/g, '');
        if (!phone.includes(normalizedPhoneFilter)) return false;
      }
      if (didFilter.trim()) {
        const did = (row.numeroId || '').toLowerCase();
        if (!did.includes(didFilter.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, startDate, endDate, agentFilter, originFilter, offerFilter, normalizedPhoneFilter, didFilter]);

  // Export XLSX
  const handleExport = () => {
    if (filteredRows.length === 0) return;
    const workbook = createWorkbook(filteredRows);
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, "0");
    const filename = `leads_sales_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
    writeXlsxFile(workbook, filename);
  };

  // Edition
  const openEditModal = (row: LeadRow) => {
    const next = {} as Record<EditableField, string>;
    EDITABLE_FIELDS.forEach(({ key }) => {
      const value = row[key];
      next[key] = value ?? "";
    });
    setEditData(next);
    setEditingRow(row);
    setModalError(null);
  };

  const closeEditModal = () => {
    setEditingRow(null);
    setModalError(null);
    setSaving(false);
    setDeleting(false);
  };

  const handleFieldChange = (field: EditableField, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRow) return;
    setSaving(true);
    setModalError(null);
    try {
      const updates: Record<string, string | null> = {};
      EDITABLE_FIELDS.forEach(({ key }) => {
        if (key !== "displayName") {
          const raw = editData[key].trim();
          updates[key] = raw.length > 0 ? raw : null;
        }
      });
      const updatePayload: Record<string, any> = { ...updates };
      const newDisplayName = (editData.displayName || "").trim();
      if (newDisplayName) {
        updatePayload["createdBy.displayName"] = newDisplayName;
      }
      await updateDoc(doc(db, "leads_sales", editingRow.id), updatePayload);
      closeEditModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enregistrement impossible";
      setModalError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingRow) return;
    setDeleting(true);
    setModalError(null);
    try {
      await deleteDoc(doc(db, "leads_sales", editingRow.id));
      closeEditModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression impossible";
      setModalError(message);
    } finally {
      setDeleting(false);
    }
  };

  // Helpers UI
  const renderDateTimeCell = (date: Date | null) => date ? formatDateTime(date) : "—";
  const formatOfferTitle = (title?: string | null) => title ? title.slice(0, 60) + (title.length > 60 ? "…" : "") : "—";
  const offerListId = "offer-list";
  const originListId = "origin-list";

  const disabled = loading || filteredRows.length === 0;

  // --- UI JSX (filtres, table, export, modale édition) ---
  // (Voir l'extrait précédent pour le JSX complet, ou demande-le si tu veux tout le HTML/JSX détaillé)

  return (
    <div className="flex flex-1 flex-col min-h-screen w-full px-4 lg:px-6 py-8 bg-transparent text-white">
    <div className="grid w-full items-start gap-8 lg:grid-cols-[380px_1fr]">
      {/* Filtres */}
      <aside className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-[0_12px_40px_rgba(30,64,175,0.3)]">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-blue-300/70">Filtres</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Affiner l’historique</h3>
        </div>
        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            Agent
            <select
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="all">Tous les agents</option>
              {agentOptions.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            Origine
            <select
              value={originFilter}
              onChange={(event) => setOriginFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="all">Toutes les origines</option>
              {originOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            Téléphone
            <input
              type="text"
              value={phoneFilter}
              onChange={(event) => setPhoneFilter(event.target.value)}
              placeholder="Rechercher par numéro"
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder:text-blue-200/40 shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            DID
            <input
              type="text"
              value={didFilter}
              onChange={(event) => setDidFilter(event.target.value)}
              placeholder="Rechercher par DID"
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder:text-blue-200/40 shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            Date de début
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              max={endDate || undefined}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            Offre
            <select
              value={offerFilter}
              onChange={(event) => setOfferFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="all">Toutes les offres</option>
              {OFFER_FILTERS.map((offer) => (
                <option key={offer.value} value={offer.value}>
                  {offer.label}
                </option>
              ))}
            </select>
          </label>

          {(startDate || endDate || agentFilter !== "all" || originFilter !== "all" || offerFilter !== "all" || phoneFilter || didFilter) && (
            <button
              type="button"
              onClick={() => {
                setAgentFilter("all");
                setOriginFilter("all");
                setOfferFilter("all");
                setStartDate("");
                setEndDate("");
                setPhoneFilter("");
                setDidFilter("");
              }}
              className="mt-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-100 transition-colors duration-200 hover:bg-slate-800/60"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </aside>

      {/* Tableau + export */}
      <section className="flex flex-col rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.3em] text-blue-300/70">Historique</p>
            <h2 className="text-2xl font-semibold text-white">Ventes LEADS</h2>
            <span className="text-sm text-blue-200/80">
              {filteredRows.length} vente{filteredRows.length > 1 ? "s" : ""} affichée{filteredRows.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <button
              type="button"
              onClick={handleExport}
              disabled={disabled}
              className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 px-8 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow-[0_0_25px_rgba(56,189,248,0.4)] transition-all duration-300 ${
                disabled ? "cursor-not-allowed opacity-60" : "hover:brightness-110"
              }`}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Export XLSX</span>
            </button>
            {loading && <p className="text-sm text-blue-200">Chargement des ventes…</p>}
            {!loading && filteredRows.length === 0 && !error && (
              <p className="text-sm text-blue-200/80">Aucune vente LEADS disponible pour l'instant.</p>
            )}
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
          <div className={`${TABLE_COLUMNS} gap-4 border-b border-white/10 bg-slate-900 px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-blue-200/70`}>
            <span>Début</span>
            <span>Fin</span>
            <span>Agent</span>
            <span>Téléphone</span>
            <span>DID</span>
            <span>Origine</span>
            <span>Offre</span>
            <span className="text-right">ID</span>
            <span className="text-center">Actions</span>
          </div>
          {filteredRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-blue-200/70">
              Aucun résultat pour ces filtres.
            </div>
          ) : (
            filteredRows.map((row) => {
              const agentLabel = row.displayName || row.email || "—";
              const phoneDisplay = row.telephone || '—';
              const didDisplay = row.numeroId || '—';
              const origin = (row.origineLead || "—").toUpperCase();
              const trimmedId = row.id.length > 6 ? `${row.id.slice(0, 6)}…` : row.id;
              return (
                <div
                  key={row.id}
                  className={`${TABLE_COLUMNS} gap-4 border-b border-white/5 px-4 py-4 text-sm text-blue-50 transition-colors duration-200 last:border-b-0 hover:bg-slate-900/30`}
                >
                  <div>{renderDateTimeCell(row.startedAt)}</div>
                  <div>{renderDateTimeCell(row.completedAt)}</div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-blue-50">{agentLabel}</span>
                    {row.email ? (
                      <span className="break-all text-xs text-blue-200/70 leading-snug">{row.email}</span>
                    ) : null}
                  </div>
                  <div className="text-sm text-blue-100/80 break-all">{phoneDisplay}</div>
                  <div className="text-sm text-blue-100/80 break-all">{didDisplay}</div>
                  <div className="inline-flex min-h-[32px] items-center">
                    <span className="inline-flex min-w-[72px] justify-center rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.3em] text-blue-200">
                      {origin}
                    </span>
                  </div>
                  <div className="flex flex-col max-w-[320px]">
                    <span className="inline-flex max-w-max items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-blue-100">
                      {row.typeOffre || "—"}
                    </span>
                    <span
                      title={row.intituleOffre || undefined}
                      className="mt-1 text-xs text-blue-200/80 leading-snug"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {formatOfferTitle(row.intituleOffre)}
                    </span>
                  </div>
                  <span className="text-right text-xs text-blue-200/70 break-all">{trimmedId}</span>
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => openEditModal(row)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 text-blue-100 hover:border-blue-300/60 hover:bg-blue-500/20 hover:text-white transition"
                      aria-label={`Modifier la vente ${row.id}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>

    {/* Modale édition */}
    {editingRow && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-sale-title"
          className="relative w-full max-w-2xl rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-100 via-sky-50 to-white p-8 font-sans shadow-[0_24px_80px_rgba(56,189,248,0.35)]"
        >
          <button
            type="button"
            onClick={closeEditModal}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200/70 bg-white text-sky-600 transition hover:border-sky-300 hover:bg-sky-50"
            aria-label="Fermer la fenêtre d'édition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-sky-600/70">Modifier la vente</p>
              <h3 id="edit-sale-title" className="mt-2 text-xl font-semibold text-slate-900">
                {(editingRow?.displayName || editingRow?.email) ?? "Vente"}
              </h3>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">ID : {editingRow?.id ?? ""}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {EDITABLE_FIELDS.map(({ key, label }) => (
                <label key={key} className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-slate-600">
                  {label}
                  {key === "displayName" ? (
                    <select
                      value={editData.displayName}
                      onChange={(e) => handleFieldChange("displayName", e.target.value)}
                      className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_12px_32px_rgba(14,116,144,0.16)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    >
                      <option value="">Sélectionner un téléacteur</option>
                      {agentOptions.map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  ) : key === "intituleOffre" ? (
                    <div className="space-y-2">
                      <select
                        value={offerOptions.some((option) => option.label === editData[key]) ? editData[key] : ""}
                        onChange={(event) => handleFieldChange(key, event.target.value)}
                        className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_12px_32px_rgba(14,116,144,0.16)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                      >
                        <option value="">Choisir une offre populaire</option>
                        {offerOptions.map(({ label: optionLabel, count }) => (
                          <option key={optionLabel} value={optionLabel}>
                            {count > 1 ? `${optionLabel} (${count})` : optionLabel}
                          </option>
                        ))}
                      </select>
                      <input
                        list={offerListId}
                        value={editData[key]}
                        onChange={(event) => handleFieldChange(key, event.target.value)}
                        className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                        placeholder="Rechercher ou saisir une offre"
                      />
                      <datalist id={offerListId}>
                        {offerOptions.map(({ label: optionLabel, count }) => (
                          <option key={optionLabel} value={optionLabel}>
                            {count > 1 ? `${optionLabel} (${count})` : optionLabel}
                          </option>
                        ))}
                      </datalist>
                    </div>
                  ) : key === "origineLead" ? (
                    <div className="space-y-2">
                      <input
                        list={originListId}
                        value={editData[key]}
                        onChange={(event) => handleFieldChange(key, event.target.value.toUpperCase())}
                        className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                        placeholder="Rechercher l'origine"
                      />
                      <datalist id={originListId}>
                        {originOptions.map((option) => (
                          <option key={option.value} value={option.label} />
                        ))}
                      </datalist>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={editData[key]}
                      onChange={(event) => handleFieldChange(key, event.target.value)}
                      className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_10px_30px_rgba(14,116,144,0.12)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    />
                  )}
                </label>
              ))}
            </div>

            {modalError && <p className="text-sm text-rose-500">{modalError}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className={`inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] transition ${
                  deleting
                    ? "cursor-wait bg-rose-200 text-rose-700"
                    : "bg-white text-rose-500 hover:border-rose-400 hover:bg-rose-50"
                }`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className={`inline-flex items-center gap-2 rounded-xl border border-sky-300 px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] transition ${
                  saving
                    ? "cursor-wait bg-sky-200 text-sky-700"
                    : "bg-sky-500/10 text-sky-700 hover:border-sky-400 hover:bg-sky-400/20"
                }`}
              >
                {saving ? "Enregistrement…" : "Sauvegarder"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
);
  
};

export default SupervisorLeadsExportPage;
