import React from "react";
import { collection, doc, onSnapshot, orderBy, query, Timestamp, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

type EcouteRow = {
  id: string;
  startedAt: Date | null;
  telephone: string | null;
  agentLabel: string;
  ecouteStatus: "validated" | null;
};

const formatDate = (date: Date | null) => {
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
};

const formatDisplayDate = (date: Date | null) => {
  if (!date) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

const formatDisplayTime = (date: Date | null) => {
  if (!date) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const SupervisorLeadsEcoutesPage: React.FC = () => {
  const [rows, setRows] = React.useState<EcouteRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string>("");
  const [agentFilter, setAgentFilter] = React.useState<string>("all");
  const [statuses, setStatuses] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState<boolean>(false);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    const region = (() => { try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase()==='CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; } })();

    const q = region === 'CIV'
      ? query(
          collection(db, "leads_sales"),
          where("mission", "==", "ORANGE_LEADS"),
          where("region", "==", 'CIV'),
          orderBy("createdAt", "desc")
        )
      : query(
          collection(db, "leads_sales"),
          where("mission", "==", "ORANGE_LEADS"),
          orderBy("createdAt", "desc")
        );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs
          .map((doc) => {
            const data = doc.data() as any;
            const startedAtTs: Timestamp | null = data?.startedAt ?? data?.createdAt ?? null;
            const startedAt = startedAtTs ? startedAtTs.toDate() : null;
            const telephone = data?.telephone ?? null;
            if (!telephone) return null;
            const agentLabel = data?.createdBy?.displayName || data?.createdBy?.email || "—";
            return {
              id: doc.id,
              startedAt,
              telephone,
              agentLabel,
              ecouteStatus: data?.ecouteStatus === "validated" ? "validated" : null,
            } satisfies EcouteRow;
          })
          .filter((row): row is EcouteRow => row !== null);
        setRows(next);
        const seed: Record<string, boolean> = {};
        next.forEach((row) => {
          if (row.ecouteStatus === "validated") seed[row.id] = true;
        });
        setStatuses(seed);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Lecture impossible");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const agentOptions = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (row.agentLabel) set.add(row.agentLabel);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (selectedDate) {
        if (formatDate(row.startedAt) !== selectedDate) return false;
      }
      if (agentFilter !== "all" && row.agentLabel !== agentFilter) {
        return false;
      }
      return true;
    });
  }, [rows, selectedDate, agentFilter]);

  const updateStatus = React.useCallback((id: string, value: boolean) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (value) {
        next[id] = true;
      } else {
        delete next[id];
      }
      return next;
    });
  }, []);

  const statusLabel = (status: boolean | undefined) => {
    return status ? "Validé" : "—";
  };

  const persistStatuses = React.useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const batch = writeBatch(db);
      rows.forEach((row) => {
        const isValidated = !!statuses[row.id];
        batch.update(doc(db, "leads_sales", row.id), {
          ecouteStatus: isValidated ? "validated" : null,
        });
      });
      await batch.commit();
      setSaveMessage("Statuts sauvegardés.");
    } catch (err) {
      setSaveMessage("Impossible de sauvegarder les statuts.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [rows, statuses]);

  const validatedCount = React.useMemo(() => Object.keys(statuses).length, [statuses]);

  return (
    <div className="flex flex-1 flex-col gap-8 px-10 py-10 text-white">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-blue-300/70">Suivi</p>
            <h1 className="text-3xl font-semibold">N° Écoutes</h1>
            <p className="text-sm text-blue-200/80">
              Retrouvez les numéros de téléphone saisis au step C avec filtres par jour et par agent.
            </p>
          </div>
          <button
            type="button"
            onClick={persistStatuses}
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200 transition ${
              saving ? "cursor-wait opacity-60" : "hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white"
            }`}
          >
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
        <p className="text-sm text-blue-200/80">
          {validatedCount === 0
            ? "Aucune vente validée pour l’instant."
            : `${validatedCount} vente${validatedCount > 1 ? "s" : ""} validée${validatedCount > 1 ? "s" : ""}.`}
        </p>
        {saveMessage && <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">{saveMessage}</p>}
      </header>

      <section className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.35em] text-blue-200/70">
            Jour
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </label>

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

          {(selectedDate || agentFilter !== "all") && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedDate("");
                  setAgentFilter("all");
                }}
                className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-blue-100 transition-colors hover:bg-slate-800/60"
              >
                Réinitialiser
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[160px_1fr_200px_220px] gap-4 bg-slate-900/40 px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-blue-200/70">
            <span>Date</span>
            <span>Agent</span>
            <span className="text-right">Téléphone</span>
            <span className="text-right">Statut</span>
          </div>
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-blue-200">Chargement…</div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-sm text-rose-400">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-blue-200/70">Aucun numéro trouvé pour ces filtres.</div>
          ) : (
            filteredRows.map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-[160px_1fr_200px_220px] gap-4 border-t border-white/10 px-4 py-4 text-sm text-blue-50 transition-colors duration-200 ${
                  statuses[row.id] ? "bg-emerald-500/15" : ""
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-blue-100">{formatDisplayDate(row.startedAt)}</span>
                  <span className="text-xs text-blue-200/70">{formatDisplayTime(row.startedAt)}</span>
                </span>
                <span className="font-semibold text-blue-100">{row.agentLabel}</span>
                <span className="text-right text-lg font-semibold tracking-wide text-blue-300">{row.telephone}</span>
                <span className="flex flex-col items-end gap-2 text-xs text-blue-200/70">
                  <span className="text-sm font-semibold text-blue-100">{statusLabel(statuses[row.id])}</span>
                  <button
                    type="button"
                    onClick={() => updateStatus(row.id, !statuses[row.id])}
                    className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                      statuses[row.id]
                        ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100 hover:border-emerald-300'
                        : 'border-emerald-400/60 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300 hover:bg-emerald-500/20 hover:text-white'
                    }`}
                  >
                    {statuses[row.id] ? 'Validé' : 'Valider'}
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default SupervisorLeadsEcoutesPage;
