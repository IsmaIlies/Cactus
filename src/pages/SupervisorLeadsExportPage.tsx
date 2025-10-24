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

const pad2 = (value: number) => value.toString().padStart(2, "0");

const formatDateTime = (date: Date | null) => {
  if (!date) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}  ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

const buildWorksheetData = (rows: LeadRow[]) => {
  const headerRow = Array.from(HEADERS);

  const dataRows = rows.map((row) => [
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

const formatTime = (date: Date | null) => {
  if (!date) return "—";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const formatDate = (date: Date | null) => {
  if (!date) return "—";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const OFFER_FILTERS = [
  { value: "internet", label: "Internet" },
  { value: "internet sosh", label: "Internet Sosh" },
  { value: "mobile", label: "Mobile" },
  { value: "mobile sosh", label: "Mobile Sosh" },
] as const;

const EDITABLE_FIELDS = [
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

const SupervisorLeadsExportPage: React.FC = () => {
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [agentFilter, setAgentFilter] = React.useState<string>("all");
  const [originFilter, setOriginFilter] = React.useState<string>("all");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [offerFilter, setOfferFilter] = React.useState<string>("all");
  const [scrollProgress, setScrollProgress] = React.useState<number>(0);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [editingRow, setEditingRow] = React.useState<LeadRow | null>(null);
  const [editData, setEditData] = React.useState<Record<EditableField, string>>(() => {
    const base = {} as Record<EditableField, string>;
    EDITABLE_FIELDS.forEach(({ key }) => {
      base[key] = "";
    });
    return base;
  });
  const [saving, setSaving] = React.useState<boolean>(false);
  const [deleting, setDeleting] = React.useState<boolean>(false);
  const [modalError, setModalError] = React.useState<string | null>(null);

  const historyScrollRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<{ startX: number; scrollLeft: number }>({ startX: 0, scrollLeft: 0 });
  const pointerActiveRef = React.useRef<boolean>(false);

  const renderDateTimeCell = React.useCallback(
    (date: Date | null) => (
      <>
        <span className="block text-[11px] text-blue-200/70">{formatDate(date)}</span>
        <span className="block text-base tracking-tight text-blue-50">{formatTime(date)}</span>
      </>
    ),
    []
  );

  React.useEffect(() => {
    setLoading(true);
    setError(null);

    let unsubscribe: (() => void) | null = null;

    const q = query(
      collection(db, "leads_sales"),
      where("mission", "==", "ORANGE_LEADS"),
      orderBy("createdAt", "desc")
    );

    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextRows = snapshot.docs.map((doc) => {
          const data = doc.data() as any;
          const startedAtTs: Timestamp | null = data?.startedAt ?? data?.createdAt ?? null;
          const completedAtTs: Timestamp | null = data?.completedAt ?? null;
          const startedAt = startedAtTs ? startedAtTs.toDate() : null;
          const completedAt = completedAtTs ? completedAtTs.toDate() : null;
          return {
            id: doc.id,
            startedAt,
            completedAt,
            email: data?.createdBy?.email ?? null,
            displayName: data?.createdBy?.displayName ?? null,
            numeroId: data?.numeroId ?? null,
            typeOffre: data?.typeOffre ?? null,
            intituleOffre: data?.intituleOffre ?? null,
            referencePanier: data?.referencePanier ?? null,
            codeAlf: data?.codeAlf ?? null,
            ficheDuJour: data?.ficheDuJour ?? null,
            origineLead: data?.origineLead ?? null,
            dateTechnicien: data?.dateTechnicien ?? null,
            telephone: data?.telephone ?? null,
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

    return () => {
      try {
        unsubscribe && unsubscribe();
      } catch {
        // ignore cleanup issues
      }
    };
  }, []);

  const agentOptions = React.useMemo(() => {
    const labels = new Set<string>();
    rows.forEach((row) => {
      const label = row.displayName || row.email;
      if (label) {
        labels.add(label);
      }
    });
    return Array.from(labels).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [rows]);

  const originOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      const raw = row.origineLead?.trim();
      if (!raw) return;
      const value = raw.toLowerCase();
      if (!map.has(value)) {
        map.set(value, raw.toUpperCase());
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    if (rows.length === 0) return [] as LeadRow[];
    const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const endBoundary = endDate ? new Date(`${endDate}T23:59:59`) : null;

    return rows.filter((row) => {
      const baseDate = row.startedAt ?? row.completedAt;
      const timestamp = baseDate?.getTime();
      if (startBoundary && (!timestamp || timestamp < startBoundary.getTime())) {
        return false;
      }
      if (endBoundary && (!timestamp || timestamp > endBoundary.getTime())) {
        return false;
      }

      if (agentFilter !== "all") {
        const label = (row.displayName || row.email || "").toLowerCase();
        if (label !== agentFilter.toLowerCase()) {
          return false;
        }
      }

      if (originFilter !== "all") {
        const originValue = (row.origineLead ?? "").trim().toLowerCase();
        if (originValue !== originFilter) {
          return false;
        }
      }

      if (offerFilter !== "all") {
        const offerValue = (row.typeOffre ?? "").trim().toLowerCase();
        if (offerValue !== offerFilter) {
          return false;
        }
      }

      return true;
    });
  }, [rows, startDate, endDate, agentFilter, originFilter, offerFilter]);

  const disabled = loading || filteredRows.length === 0;

  const handleExport = () => {
    if (filteredRows.length === 0) return;
    const workbook = createWorkbook(filteredRows);
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, "0");
    const filename = `leads_sales_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
    writeXlsxFile(workbook, filename);
  };

  const updateScrollProgressFromElement = React.useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      setScrollProgress(0);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = element;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) {
      setScrollProgress(0);
      return;
    }
    const ratio = scrollTop / maxScroll;
    setScrollProgress(Math.min(100, Math.max(0, ratio * 100)));
  }, []);

  const handleHistoryScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      updateScrollProgressFromElement(event.currentTarget);
    },
    [updateScrollProgressFromElement]
  );

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    pointerActiveRef.current = true;
    setIsDragging(true);
    dragStateRef.current = { startX: event.clientX, scrollLeft: element.scrollLeft };
    element.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerActiveRef.current) return;
    event.preventDefault();
    const element = event.currentTarget;
    const deltaX = event.clientX - dragStateRef.current.startX;
    element.scrollLeft = dragStateRef.current.scrollLeft - deltaX;
  }, []);

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointerActiveRef.current) return;
      pointerActiveRef.current = false;
      setIsDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      updateScrollProgressFromElement(event.currentTarget);
    },
    [updateScrollProgressFromElement]
  );

  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const element = historyScrollRef.current;
    if (!element) return;
    const value = Number(event.target.value);
    const maxScroll = element.scrollHeight - element.clientHeight;
    element.scrollTop = (value / 100) * (maxScroll <= 0 ? 0 : maxScroll);
    updateScrollProgressFromElement(element);
  };

  React.useEffect(() => {
    updateScrollProgressFromElement(historyScrollRef.current);
  }, [filteredRows.length, updateScrollProgressFromElement]);

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
        const raw = editData[key].trim();
        updates[key] = raw.length > 0 ? raw : null;
      });
      await updateDoc(doc(db, "leads_sales", editingRow.id), updates);
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

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900/80 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10 xl:px-14">
        <div className="flex w-full items-center justify-end">
          <div className="space-y-3 text-right">
            <button
              type="button"
              onClick={handleExport}
              disabled={disabled}
              className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-[0.35em] transition-all duration-300 ${
                disabled
                  ? "cursor-not-allowed text-slate-300"
                  : "text-white hover:-translate-y-0.5"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full bg-[linear-gradient(120deg,#102a72,#1d4ed8,#2563eb,#0b1f52)] opacity-90 transition-all duration-300 ${
                  disabled ? "brightness-75" : "group-hover:opacity-100 group-hover:brightness-110"
                }`}
              />
              <span
                aria-hidden="true"
                className={`absolute -inset-1 rounded-full blur-2xl bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.9),transparent),radial-gradient(circle_at_80%_80%,rgba(20,80,200,0.85),transparent)] transition-all duration-500 ${
                  disabled ? "opacity-30" : "opacity-80 group-hover:opacity-95 group-hover:blur-3xl"
                }`}
              />
              <span className="relative flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Export XLSX</span>
              </span>
            </button>
            {loading && <p className="text-sm text-blue-200">Chargement des ventes…</p>}
            {!loading && filteredRows.length === 0 && !error && (
              <p className="text-sm text-blue-200/80">Aucune vente LEADS disponible pour l'instant.</p>
            )}
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/60 via-slate-900/30 to-slate-900/10 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.45)] 2xl:p-8">
          <div className="flex flex-1 flex-col gap-6 xl:flex-row xl:items-start">
            <aside className="flex w-full flex-shrink-0 flex-col gap-6 rounded-2xl border border-white/5 bg-slate-950/60 p-6 shadow-[0_12px_40px_rgba(30,64,175,0.3)] xl:w-[420px]">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-blue-300/70">Filtres</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Affiner l’historique</h3>
              </div>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
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

                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
                  Date de début
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    max={endDate || undefined}
                    className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
                  Date de fin
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    min={startDate || undefined}
                    className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
                  Fournisseur
                  <select
                    value={originFilter}
                    onChange={(event) => setOriginFilter(event.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                  >
                    <option value="all">Tous les fournisseurs</option>
                    {originOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
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

                {(startDate || endDate || agentFilter !== "all" || originFilter !== "all" || offerFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setAgentFilter("all");
                      setOriginFilter("all");
                      setOfferFilter("all");
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="mt-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-100 transition-colors duration-200 hover:bg-slate-800/60"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </aside>

            <div className="flex min-h-[640px] min-w-0 flex-1 flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-blue-300/70">Historique</p>
                  <h2 className="text-2xl font-semibold text-white">Ventes LEADS</h2>
                </div>
                <div className="text-sm text-blue-200/80">
                  {filteredRows.length} vente{filteredRows.length > 1 ? "s" : ""} affichée{filteredRows.length > 1 ? "s" : ""}
                </div>
              </div>

              <div className="relative flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45">
                <div className="grid grid-cols-12 gap-4 border-b border-white/5 bg-slate-900/60 px-4 py-3 text-xs uppercase tracking-[0.35em] text-blue-200/70">
                  <span className="col-span-2">Début</span>
                  <span className="col-span-2">Fin</span>
                  <span className="col-span-2">Agent</span>
                  <span className="col-span-2">Origine</span>
                  <span className="col-span-2">Offre</span>
                  <span className="col-span-1 text-right">ID</span>
                  <span className="col-span-1 text-right">Actions</span>
                </div>
                <div
                  ref={historyScrollRef}
                  onScroll={handleHistoryScroll}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`max-h-[560px] overflow-y-auto overflow-x-auto text-sm text-blue-50/90 ${
                    isDragging ? "cursor-grabbing select-none" : "cursor-grab"
                  }`}
                >
                  <div className="min-w-full 2xl:min-w-[1550px]">
                    {filteredRows.length === 0 ? (
                      <div className="px-4 py-12 text-center text-blue-200/70">
                        Aucun résultat pour ces filtres.
                      </div>
                    ) : (
                      filteredRows.map((row) => {
                        const agentLabel = row.displayName || row.email || "—";
                        const origin = (row.origineLead || "—").toUpperCase();
                        return (
                          <div
                            key={row.id}
                            className="grid grid-cols-12 gap-4 border-b border-white/5 px-4 py-3 last:border-b-0 transition-colors duration-200 hover:bg-slate-900/40"
                          >
                            <span className="col-span-2 font-medium text-blue-100">
                              {renderDateTimeCell(row.startedAt)}
                            </span>
                            <span className="col-span-2 font-medium text-blue-100">
                              {renderDateTimeCell(row.completedAt)}
                            </span>
                            <span className="col-span-2 flex flex-col">
                              <span className="font-semibold text-blue-50">{agentLabel}</span>
                              <span className="text-xs text-blue-200/70">{row.numeroId || "DID —"}</span>
                            </span>
                            <span className="col-span-2 flex items-center">
                              <span className="inline-flex min-w-[72px] justify-center rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.3em] text-blue-200">
                                {origin}
                              </span>
                            </span>
                            <span className="col-span-2 flex flex-col">
                              <span className="font-semibold text-blue-50">{row.typeOffre || "—"}</span>
                              <span className="text-xs text-blue-200/70">{row.intituleOffre || "—"}</span>
                            </span>
                            <span className="col-span-1 text-right text-xs text-blue-200/70">{row.id.slice(0, 6)}…</span>
                            <span className="col-span-1 flex min-w-[120px] flex-col items-end gap-2 text-xs text-blue-200/70 sm:flex-row sm:items-center sm:justify-end">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(row)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 text-blue-100 transition hover:border-blue-300/60 hover:bg-blue-500/20 hover:text-white"
                                  aria-label={`Modifier la vente ${row.id}`}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <span className="text-[11px] uppercase tracking-[0.3em] text-blue-200/60">Navigation</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(scrollProgress)}
                  onChange={handleSliderChange}
                  className="h-1 w-full cursor-pointer rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-sale-title"
            className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-slate-900/70 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.65)]"
          >
            <button
              type="button"
              onClick={closeEditModal}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-blue-100 transition hover:border-blue-300/40 hover:bg-slate-800/80 hover:text-white"
              aria-label="Fermer la fenêtre d'édition"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-blue-300/70">Modifier la vente</p>
                <h3 id="edit-sale-title" className="mt-2 text-xl font-semibold text-white">
                  {editingRow.displayName || editingRow.email || "Vente"}
                </h3>
                <p className="text-xs uppercase tracking-[0.3em] text-blue-200/70">ID : {editingRow.id}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {EDITABLE_FIELDS.map(({ key, label }) => (
                  <label key={key} className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-blue-200/70">
                    {label}
                    <input
                      type="text"
                      value={editData[key]}
                      onChange={(event) => handleFieldChange(key, event.target.value)}
                      className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                    />
                  </label>
                ))}
              </div>

              {modalError && <p className="text-sm text-rose-300">{modalError}</p>}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                  className={`inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] transition ${
                    deleting
                      ? "cursor-wait bg-rose-600/30 text-rose-100"
                      : "bg-rose-500/10 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/20 hover:text-white"
                  }`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {deleting ? "Suppression…" : "Supprimer"}
                </button>
                <button
                  type="submit"
                  disabled={saving || deleting}
                  className={`inline-flex items-center gap-2 rounded-xl border border-blue-400/60 px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] transition ${
                    saving
                      ? "cursor-wait bg-blue-500/20 text-blue-100"
                      : "bg-blue-500/10 text-blue-100 hover:border-blue-300/70 hover:bg-blue-500/20 hover:text-white"
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
