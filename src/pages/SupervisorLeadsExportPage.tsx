import React from "react";
import { collection, deleteDoc, doc, onSnapshot, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { Download, Pencil, Trash2, X } from "lucide-react";
import { utils as XLSXUtils, writeFile as writeXlsxFile } from "xlsx";
import { db } from "../firebase";
import Autocomplete from "../leads/components/common/Autocomplete";
import { getLeadOffersCatalog } from "../leads/services/leadOffersCatalog";
import { OFFER_OPTIONS } from "../leads/types/sales";

type LeadRow = {
  id: string;
  startedAt: Date | null;
  completedAt: Date | null;
  email: string | null;
  displayName: string | null;
  createdByUserId: string | null;
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

type AgentDirectoryEntry = {
  userId: string;
  displayName: string;
  email: string;
  label: string;
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
  { value: "autres", label: "Autres" },
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

  // Catalogue des offres (comme côté agent)
  const [offerSuggestions, setOfferSuggestions] = React.useState<string[]>([]);
  const [offerGroups, setOfferGroups] = React.useState<{ name: string; items: string[] }[] | undefined>(undefined);
  const totalOffers = React.useMemo(() => offerGroups?.find(g => g.name.toLowerCase() === 'total')?.items.length
    ?? offerSuggestions.length
    ?? 0, [offerGroups, offerSuggestions]);
  const agentDirectory: AgentDirectoryEntry[] = React.useMemo(() => {
    const map = new Map<string, AgentDirectoryEntry>();
    rows.forEach((row) => {
      if (!row.createdByUserId) return;
      if (!map.has(row.createdByUserId)) {
        map.set(row.createdByUserId, {
          userId: row.createdByUserId,
          displayName: row.displayName || "",
          email: row.email || "",
          label: (row.displayName || row.email || row.createdByUserId) as string,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  }, [rows]);
  const [agentSelection, setAgentSelection] = React.useState<string>("__custom__");

  React.useEffect(() => {
    (async () => {
      try {
        const cat = await getLeadOffersCatalog();
        if (cat?.groups && Array.isArray(cat.groups)) {
          setOfferGroups(cat.groups);
          const total = cat.groups.find((g) => g.name.toLowerCase() === 'total');
          if (total && Array.isArray(total.items) && total.items.length > 0) {
            setOfferSuggestions(total.items);
          } else if (cat && Array.isArray(cat.items)) {
            setOfferSuggestions(cat.items);
          }
        } else if (cat && Array.isArray(cat.items)) {
          setOfferSuggestions(cat.items);
        }
      } catch {
        // non bloquant: on conserve les suggestions populaires calculées plus bas si besoin
      }
    })();
  }, []);

  // Répertoire agents (users collection) pour réaffecter proprement les ventes
  // plus de chargement de tous les users — on ne liste que les téléacteurs présents dans les ventes LEADS

  // Chargement Firestore
  React.useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, "leads_sales"),
      where("mission", "==", "ORANGE_LEADS")
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
          const createdByUserId = typeof createdBy?.userId === "string" ? createdBy.userId : null;
          return {
            id: doc.id,
            startedAt,
            completedAt,
            email: (createdBy?.email as string | undefined) ?? null,
            displayName: resolvedDisplayName,
            createdByUserId,
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
        // Tri descendant sur startedAt (ou completedAt en repli) côté client
        nextRows.sort((a, b) => {
          const at = (a.startedAt ?? a.completedAt)?.getTime() ?? 0;
          const bt = (b.startedAt ?? b.completedAt)?.getTime() ?? 0;
          return bt - at;
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
    setAgentSelection(row.createdByUserId || "__custom__");
  };

  const closeEditModal = () => {
    setEditingRow(null);
    setModalError(null);
    setSaving(false);
    setDeleting(false);
    setAgentSelection("__custom__");
  };

  const handleFieldChange = (field: EditableField, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAgentSelectChange = (value: string) => {
    setAgentSelection(value);
    if (value && value !== "__custom__") {
      const agent = agentDirectory.find((entry) => entry.userId === value);
      if (agent) {
        const label = agent.displayName || agent.label || agent.email || agent.userId;
        setEditData((prev) => ({ ...prev, displayName: label }));
      }
    }
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
      // Normalisations supplémentaires pour respecter les règles Firestore et la cohérence des données
      // 1) origineLead ne doit être que: 'opportunity' | 'dolead' | 'mm'
      if (typeof updates["origineLead"] === 'string') {
        const v = (updates["origineLead"] as string).trim().toLowerCase();
        let norm: string | null = null;
        if (!v) {
          norm = null;
        } else if (v.includes('dolead')) {
          norm = 'dolead';
        } else if (v === 'mm' || v.includes('mars')) {
          norm = 'mm';
        } else if (v === 'opportunity' || v.includes('opportun')) {
          norm = 'opportunity';
        } else {
          // valeur inconnue: on garde en l'état en minuscule (peut être bloqué par règles)
          norm = v;
        }
        updates["origineLead"] = norm;
      }
      // 2) téléphone: retirer espaces superflus
      if (typeof updates["telephone"] === 'string') {
        const t = (updates["telephone"] as string).replace(/\s+/g, ' ').trim();
        updates["telephone"] = t || null;
      }
      const updatePayload: Record<string, any> = { ...updates };
      const newDisplayName = (editData.displayName || "").trim();
      const trimmedDisplayName = newDisplayName.length > 0 ? newDisplayName : null;
      if (agentSelection && agentSelection !== "__custom__") {
        const agent =
          agentDirectory.find((entry) => entry.userId === agentSelection) ||
          (editingRow.createdByUserId === agentSelection
            ? {
                userId: agentSelection,
                displayName: editingRow.displayName || "",
                email: editingRow.email || "",
                label: editingRow.displayName || editingRow.email || agentSelection,
              }
            : undefined);
        if (!agent) {
          throw new Error("Agent introuvable. Recharge la page et réessaie.");
        }
        updatePayload["createdBy.userId"] = agent.userId;
        updatePayload["createdBy.displayName"] = agent.displayName || trimmedDisplayName || agent.label;
        updatePayload["createdBy.email"] = agent.email || null;
      } else if (trimmedDisplayName !== null) {
        updatePayload["createdBy.displayName"] = trimmedDisplayName;
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
  const originListId = "origin-list";

  const disabled = loading || filteredRows.length === 0;

  // --- UI JSX (filtres, table, export, modale édition) ---
  // (Voir l'extrait précédent pour le JSX complet, ou demande-le si tu veux tout le HTML/JSX détaillé)

  return (
    <div className="flex min-h-screen w-full flex-col bg-transparent px-4 py-4 text-white lg:px-6 lg:py-6">
      {/* Barre de filtres en haut (sticky) */}
      <header className="sticky top-0 z-20 rounded-2xl border border-white/10 bg-slate-900/90 p-5 backdrop-blur-md shadow-[0_12px_40px_rgba(30,64,175,0.25)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-blue-300/70">Filtres</p>
            <h3 className="mt-1.5 text-lg font-semibold text-white">Affiner l’historique des ventes LEADS</h3>
          </div>
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
              className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-100 transition-colors hover:bg-slate-800/70"
            >
              Réinitialiser
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Agent</span>
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

          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Origine</span>
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

          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Offre</span>
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

          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Téléphone</span>
            <input
              type="text"
              value={phoneFilter}
              onChange={(event) => setPhoneFilter(event.target.value)}
              placeholder="Rechercher par numéro"
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder:text-blue-200/40 shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>DID</span>
            <input
              type="text"
              value={didFilter}
              onChange={(event) => setDidFilter(event.target.value)}
              placeholder="Rechercher par DID"
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder:text-blue-200/40 shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Date de début</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              max={endDate || undefined}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Date de fin</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              min={startDate || undefined}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>
        </div>
      </header>

      {/* Contenu: Historique plein écran */}
  <main className="mt-4 flex flex-1 flex-col">
        <section className="flex flex-col rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
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

          {/* Zone scrollable */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900">
            <div className={`${TABLE_COLUMNS} sticky top-0 z-10 gap-4 border-b border-white/10 bg-slate-900/95 px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-blue-200/70 backdrop-blur-md`}>
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
            <div className="max-h-[70vh] overflow-auto">
              {filteredRows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-blue-200/70">
                  Aucun résultat pour ces filtres.
                </div>
              ) : (
                filteredRows.map((row) => {
                  const agentLabel = row.displayName || row.email || "—";
                  const phoneDisplay = row.telephone || "—";
                  const didDisplay = row.numeroId || "—";
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
                          <span className="leading-snug break-all text-xs text-blue-200/70">{row.email}</span>
                        ) : null}
                      </div>
                      <div className="break-all text-sm text-blue-100/80">{phoneDisplay}</div>
                      <div className="break-all text-sm text-blue-100/80">{didDisplay}</div>
                      <div className="inline-flex min-h-[32px] items-center">
                        <span className="inline-flex min-w-[72px] justify-center rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.3em] text-blue-200">
                          {origin}
                        </span>
                      </div>
                      <div className="flex max-w-[320px] flex-col">
                        <span className="inline-flex max-w-max items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-blue-100">
                          {row.typeOffre || "—"}
                        </span>
                        <span
                          title={row.intituleOffre || undefined}
                          className="mt-1 leading-snug text-xs text-blue-200/80"
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
                      <span
                        title={row.id}
                        className="break-all text-right text-xs text-blue-200/70 cursor-help hover:text-blue-100"
                      >
                        {trimmedId}
                      </span>
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 text-blue-100 transition hover:border-blue-300/60 hover:bg-blue-500/20 hover:text-white"
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
          </div>
        </section>
      </main>

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
                    <div className="space-y-2">
                      <select
                        value={agentSelection}
                        onChange={(e) => handleAgentSelectChange(e.target.value)}
                        className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_12px_32px_rgba(14,116,144,0.16)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                      >
                        <option value="__custom__">Sélectionner dans la liste</option>
                        {agentDirectory.map((agent) => (
                          <option key={agent.userId} value={agent.userId}>
                            {agent.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editData.displayName}
                        onChange={(event) => {
                          handleFieldChange("displayName", event.target.value);
                          if (agentSelection !== "__custom__") {
                            setAgentSelection("__custom__");
                          }
                        }}
                        placeholder="Nom affiché (libre)"
                        className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_12px_32px_rgba(14,116,144,0.16)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                      />
                      {agentSelection !== "__custom__" && (
                        <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                          UID sélectionné : {agentSelection}
                        </p>
                      )}
                    </div>
                  ) : key === "typeOffre" ? (
                    <select
                      value={editData.typeOffre}
                      onChange={(e) => handleFieldChange("typeOffre", e.target.value)}
                      className="rounded-xl border border-sky-200/70 bg-white px-4 py-2 text-sm text-slate-800 shadow-[0_12px_32px_rgba(14,116,144,0.16)] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                    >
                      <option value="">Sélectionner un type</option>
                      {Array.from(OFFER_OPTIONS).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : key === "intituleOffre" ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">Catalogue d’offres</span>
                        {totalOffers > 0 && (
                          <span className="inline-flex items-center rounded-full border border-sky-300/60 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Total : {totalOffers}</span>
                        )}
                      </div>
                      <Autocomplete
                        value={editData[key]}
                        onChange={(v) => handleFieldChange(key, v)}
                        suggestions={offerSuggestions.length ? offerSuggestions : offerOptions.map(o => o.label)}
                        groups={offerGroups}
                        placeholder="Saisir ou choisir une offre (Libellé ALF)"
                      />
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
