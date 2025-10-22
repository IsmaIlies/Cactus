import React from "react";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { Download } from "lucide-react";
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

const pad2 = (value: number) => value.toString().padStart(2, "0");

const formatDateTime = (date: Date | null) => {
  if (!date) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}  ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

const toCsv = (rows: LeadRow[]) => {
  const lines: string[] = [];
  lines.push(HEADERS.join(";"));
  for (const r of rows) {
    const values = [
      r.id,
      formatDateTime(r.startedAt),
      formatDateTime(r.completedAt),
      r.email || "",
      r.displayName || "",
      r.numeroId || "",
      r.typeOffre || "",
      r.intituleOffre || "",
      r.referencePanier || "",
      r.codeAlf || "",
      r.ficheDuJour || "",
      r.origineLead || "",
      r.dateTechnicien || "",
      r.telephone || "",
    ];
    const escaped = values.map((v) => /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}` : v);
    lines.push(escaped.join(";"));
  }
  return "\uFEFF" + lines.join("\r\n");
};

const SupervisorLeadsExportPage: React.FC = () => {
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");

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

  const handleExport = () => {
    if (filteredRows.length === 0) return;
    const csv = toCsv(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, "0");
    link.download = `leads_sales_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredRows = React.useMemo(() => {
    if (rows.length === 0) return [] as LeadRow[];
    const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const endBoundary = endDate ? new Date(`${endDate}T23:59:59`) : null;
    return rows.filter((row) => {
      const ts = row.startedAt?.getTime();
      if (typeof ts !== "number") return false;
      if (startBoundary && ts < startBoundary.getTime()) return false;
      if (endBoundary && ts > endBoundary.getTime()) return false;
      return true;
    });
  }, [rows, startDate, endDate]);

  const disabled = loading || filteredRows.length === 0;

  const formatTime = (date: Date | null) => {
    if (!date) return "—";
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "—";
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  return (
    <div className="min-h-[60vh] px-6 py-10 flex flex-col gap-10">
      <div className="w-full flex items-center justify-end">
        <div className="text-right space-y-3">
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
            <span>Export CSV</span>
          </span>
        </button>
        {loading && <p className="text-sm text-blue-200">Chargement des ventes…</p>}
        {!loading && rows.length === 0 && !error && (
          <p className="text-sm text-blue-200/80">Aucune vente LEADS disponible pour l'instant.</p>
        )}
        {error && <p className="text-sm text-rose-300">{error}</p>}
        </div>
      </div>

      <div className="w-full rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/60 via-slate-900/30 to-slate-900/10 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
              Date de début
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-blue-200/70">
              Date de fin
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </label>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-100 transition-colors duration-200 hover:bg-slate-800/60"
              >
                Réinitialiser
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.4em] text-blue-300/70">Historique</p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold text-white">Ventes LEADS</h2>
              <div className="text-sm text-blue-200/80">
                {filteredRows.length} vente{filteredRows.length > 1 ? 's' : ''} affichée{filteredRows.length > 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
            <div className="grid grid-cols-12 gap-4 border-b border-white/5 bg-slate-900/60 px-4 py-3 text-xs uppercase tracking-[0.35em] text-blue-200/70">
              <span className="col-span-2">Début</span>
              <span className="col-span-2">Fin</span>
              <span className="col-span-3">Agent</span>
              <span className="col-span-2">Origine</span>
              <span className="col-span-2">Offre</span>
              <span className="col-span-1 text-right">ID</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto overflow-x-auto text-sm text-blue-50/90">
              <div className="min-w-[860px]">
                {filteredRows.length === 0 ? (
                  <div className="px-4 py-12 text-center text-blue-200/70">
                    Aucune vente à afficher.
                  </div>
                ) : (
                  filteredRows.map((row) => {
                    const agentLabel = row.displayName || row.email || '—';
                    const origin = (row.origineLead || '—').toUpperCase();
                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-12 gap-4 border-b border-white/5 px-4 py-3 last:border-b-0 hover:bg-slate-900/40 transition-colors duration-200"
                      >
                        <span className="col-span-2 font-medium text-blue-100">
                          <span className="block text-[11px] text-blue-200/70">{formatDate(row.startedAt)}</span>
                          <span className="block text-base tracking-tight text-blue-50">{formatTime(row.startedAt)}</span>
                        </span>
                        <span className="col-span-2 font-medium text-blue-100">
                          <span className="block text-[11px] text-blue-200/70">{formatDate(row.completedAt)}</span>
                          <span className="block text-base tracking-tight text-blue-50">{formatTime(row.completedAt)}</span>
                        </span>
                        <span className="col-span-3 flex flex-col">
                          <span className="font-semibold text-blue-50">{agentLabel}</span>
                          <span className="text-xs text-blue-200/70">{row.numeroId || 'DID —'}</span>
                        </span>
                        <span className="col-span-2 flex items-center">
                          <span className="inline-flex min-w-[72px] justify-center rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.3em] text-blue-200">
                            {origin}
                          </span>
                        </span>
                        <span className="col-span-2 flex flex-col">
                          <span className="font-semibold text-blue-50">{row.typeOffre || '—'}</span>
                          <span className="text-xs text-blue-200/70">{row.intituleOffre || '—'}</span>
                        </span>
                        <span className="col-span-1 text-right text-xs text-blue-200/70">{row.id.slice(0, 6)}…</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorLeadsExportPage;
