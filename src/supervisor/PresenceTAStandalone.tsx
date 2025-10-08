import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, XCircle, Clock, Search, Plus, Trash2, Users, Send, Settings, Download, Calendar } from "lucide-react";
import { collection, onSnapshot, orderBy, query as fsQuery, Unsubscribe } from "firebase/firestore";
import { db } from "../firebase";
import { handleOpenOutlookWeb, getRecipientsConfig, setRecipientsConfig } from "./PresenceTAModule";
import { getRoster, saveRoster } from "../services/presenceRosterService";

type DelayUnit = "minutes" | "heures";

type DelayInfo = { value: number; unit: DelayUnit };

type ReportingNotes = { technique: string; electricite: string; production: string };
type ReportingState = {
  encadrants: string[];
  ventesConfirmees: number;
  mailsCommandes: number;
  conges: number;
  sanction: number;
  demission: number;
  notes: ReportingNotes;
};

type Props = {
  title?: string;
  initialAgents?: string[];
  persistKey?: string;
};

const DEFAULT_AGENTS = [
  "Dylan",
  "Eunice",
  "Benjamin",
  "Vinny",
  "Fatim",
  "Ismael",
  "Guy la roche",
  "Auguste",
  "Marie Cecile",
  "Judith",
];

const DEFAULT_REPORTING: ReportingState = {
  encadrants: ["Arthur"],
  ventesConfirmees: 0,
  mailsCommandes: 0,
  conges: 0,
  sanction: 0,
  demission: 0,
  notes: { technique: "RAS", electricite: "RAS", production: "" },
};

const PresenceTAStandalone: React.FC<Props> = ({
  title = "🗓️ Présence TA",
  initialAgents,
  persistKey = "presence_ta_standalone_v1",
}) => {
  // Agents & présence
  const [agents, setAgents] = useState<string[]>(initialAgents?.length ? initialAgents : DEFAULT_AGENTS);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [delaysByAgent, setDelaysByAgent] = useState<Record<string, DelayInfo>>({});
  const [delayEditFor, setDelayEditFor] = useState<string | null>(null);

  // UI controls
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "present" | "absent" | "unmarked">("all");
  const [newAgent, setNewAgent] = useState("");
  const [removeSelection, setRemoveSelection] = useState("");

  // Email settings
  const [showSettings, setShowSettings] = useState(false);
  const [toList, setToList] = useState<string[]>([]);
  const [ccList, setCcList] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear(); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Reporting (persisté)
  const [reporting, setReporting] = useState<ReportingState>(DEFAULT_REPORTING);

  // Recaps history from Firestore
  type RecapDoc = {
    id: string;
    subject: string;
    to?: string;
    cc?: string;
    date: string; // yyyy-MM-dd
    mission?: string;
    encadrants?: string[];
    kpis?: {
      ventesConfirmees?: number;
      mailsCommandes?: number;
      conges?: number;
      sanction?: number;
      demission?: number;
      absence?: number;
      retard?: number;
    };
    notes?: { technique?: string; electricite?: string; production?: string };
    presence?: {
      present?: string[];
      absent?: string[];
      unmarked?: string[];
      delaysByAgent?: Record<string, { value: number; unit: "minutes" | "heures" }>;
    };
    salesBySeller?: Record<string, number>;
    createdAt?: any;
  };
  const [recaps, setRecaps] = useState<RecapDoc[]>([]);
  const [loadingRecaps, setLoadingRecaps] = useState<boolean>(true);

  // Load persisted state + Firestore roster
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.agents)) setAgents(data.agents);
        if (Array.isArray(data.present)) setPresent(new Set<string>(data.present));
        if (Array.isArray(data.absent)) setAbsent(new Set<string>(data.absent));
        if (data.delaysByAgent && typeof data.delaysByAgent === "object") setDelaysByAgent(data.delaysByAgent);
      }
      const rawRep = localStorage.getItem(`${persistKey}:reporting`);
      if (rawRep) {
        const rep = JSON.parse(rawRep);
        setReporting({ ...DEFAULT_REPORTING, ...rep, notes: { ...DEFAULT_REPORTING.notes, ...(rep?.notes || {}) } });
      }
      // load recipients config
      const cfg = getRecipientsConfig();
      setToList(cfg.to);
      setCcList(cfg.cc);
      // Load roster from Firestore (by region) and override local agents if exists
      const region = (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || undefined;
      getRoster(region).then((remote) => {
        if (Array.isArray(remote) && remote.length) {
          setAgents(remote);
        }
      }).catch(() => {});
    } catch {}
  }, [persistKey]);

  // Persist state (localStorage) and save roster to Firestore on agents change
  useEffect(() => {
    try {
      localStorage.setItem(
        persistKey,
        JSON.stringify({ agents, present: Array.from(present), absent: Array.from(absent), delaysByAgent })
      );
      localStorage.setItem(`${persistKey}:reporting`, JSON.stringify(reporting));
    } catch {}
    // Save roster remotely (debounced-like minimal; simple immediate write here)
    (async () => {
      try {
        const region = (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || undefined;
        await saveRoster(agents, region);
      } catch {}
    })();
  }, [agents, present, absent, delaysByAgent, reporting, persistKey]);

  // Subscribe to recap history (latest first)
  useEffect(() => {
    setLoadingRecaps(true);
    const unsubs: Unsubscribe[] = [];
    try {
  const qRec = fsQuery(collection(db, "presenceRecaps"), orderBy("date", "desc"));
      const unsub = onSnapshot(qRec, (snap: any) => {
        const list: RecapDoc[] = [];
        (snap as any).forEach((d: any) => list.push({ id: d.id, ...(d.data() as any) }));
        setRecaps(list);
        setLoadingRecaps(false);
      }, () => setLoadingRecaps(false));
      unsubs.push(unsub);
    } catch {
      setLoadingRecaps(false);
    }
    return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
  }, []);

  // Derived
  const filteredAgents = useMemo(() => {
    let list = agents;
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((n) => n.toLowerCase().includes(q));
    if (filterMode === "present") list = list.filter((n) => present.has(n));
    if (filterMode === "absent") list = list.filter((n) => absent.has(n));
    if (filterMode === "unmarked") list = list.filter((n) => !present.has(n) && !absent.has(n));
    return list;
  }, [agents, searchQuery, filterMode, present, absent]);

  const total = agents.length;
  const presentCount = present.size;
  const absentCount = absent.size;
  const unmarkedCount = total - presentCount - absentCount;
  const progressPct = total === 0 ? 0 : Math.round(((presentCount + absentCount) / total) * 100);
  const retardCount = Object.keys(delaysByAgent).length;

  // Month key from selectedDate
  const monthKey = useMemo(() => selectedDate.slice(0, 7), [selectedDate]);

  // Monthly aggregation from history
  const monthly = useMemo(() => {
    const monthRecaps = recaps.filter(r => (r.date || "").startsWith(monthKey));
    const sum = {
      ventesConfirmees: 0,
      mailsCommandes: 0,
      absents: 0,
      presents: 0,
      retards: 0,
      conges: 0,
      sanction: 0,
      demission: 0,
    };
    const sellerTotals: Record<string, number> = {};
    monthRecaps.forEach(r => {
      const k = r.kpis || {} as any;
      sum.ventesConfirmees += Number(k.ventesConfirmees || 0);
      sum.mailsCommandes += Number(k.mailsCommandes || 0);
      sum.conges += Number(k.conges || 0);
      sum.sanction += Number(k.sanction || 0);
      sum.demission += Number(k.demission || 0);
      const p = r.presence || {};
      sum.presents += (p.present?.length || 0);
      sum.absents += (p.absent?.length || 0);
      sum.retards += Object.keys(p.delaysByAgent || {}).length;
      Object.entries(r.salesBySeller || {}).forEach(([seller, n]) => {
        sellerTotals[seller] = (sellerTotals[seller] || 0) + Number(n || 0);
      });
    });
    const topSellers = Object.entries(sellerTotals).sort((a,b) => (b[1]-a[1]));
    return { monthRecaps, sum, topSellers };
  }, [recaps, monthKey]);

  // CSV: per recap detailed
  const downloadRecapCsv = (r: RecapDoc) => {
    const pres = r.presence || {};
    const present = pres.present || [];
    const absent = pres.absent || [];
    const unmarked = pres.unmarked || [];
    const delays = pres.delaysByAgent || {};
    const sales = r.salesBySeller || {};
    const allAgents = Array.from(new Set<string>([...present, ...absent, ...unmarked]));
    const rows: string[] = [];
  const esc = (s: any) => `"${String(s ?? "").replace(/\"/g,'""')}"`;
    rows.push(["Agent","Statut","Retard","Unité","Ventes"].join(","));
    allAgents.forEach(a => {
      const status = present.includes(a) ? "Présent" : absent.includes(a) ? "Absent" : "Non marqué";
      const d = delays[a];
      const v = d ? d.value : "";
      const u = d ? d.unit : "";
      const s = sales[a] || 0;
      rows.push([esc(a), esc(status), esc(v), esc(u), esc(s)].join(","));
    });
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recap_${r.date || 'jour'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // CSV: monthly summary (one row per day + sellers sheet appended)
  const downloadMonthlyCsv = () => {
    const rows: string[] = [];
  const esc = (s: any) => `"${String(s ?? "").replace(/\"/g,'""')}"`;
    rows.push(["Date","Ventes confirmées","Mails commandes","Présents","Absents","Retards","Congés","Sanction","Démission"].join(","));
    monthly.monthRecaps.forEach(r => {
      const k = r.kpis || {} as any;
      const p = r.presence || {};
      rows.push([
        esc(r.date),
        esc(k.ventesConfirmees || 0),
        esc(k.mailsCommandes || 0),
        esc((p.present || []).length),
        esc((p.absent || []).length),
        esc(Object.keys(p.delaysByAgent || {}).length),
        esc(k.conges || 0),
        esc(k.sanction || 0),
        esc(k.demission || 0),
      ].join(","));
    });
    // blank line and sellers
    rows.push("");
    rows.push(["Vendeur","Ventes"].join(","));
    monthly.topSellers.forEach(([seller, n]) => rows.push([esc(seller), esc(n)].join(",")));
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recap_mensuel_${monthKey}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // Actions présence
  const togglePresent = (name: string) => {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setAbsent((prevA) => {
        if (!prevA.has(name)) return prevA;
        const n = new Set(prevA);
        n.delete(name);
        return n;
      });
      return next;
    });
  };
  const toggleAbsent = (name: string) => {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setPresent((prevP) => {
        if (!prevP.has(name)) return prevP;
        const n = new Set(prevP);
        n.delete(name);
        return n;
      });
      setDelaysByAgent((prevD) => {
        if (!next.has(name)) return prevD;
        const { [name]: _omit, ...rest } = prevD;
        return rest;
      });
      return next;
    });
  };
  const setRetardFor = (name: string, value: number, unit: DelayUnit) => {
    setDelaysByAgent((prev) => {
      const v = Math.max(0, Math.floor(value || 0));
      if (v <= 0) {
        const { [name]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: { value: v, unit } };
    });
    setPresent((prev) => new Set(prev).add(name));
    setAbsent((prev) => {
      if (!prev.has(name)) return prev;
      const n = new Set(prev);
      n.delete(name);
      return n;
    });
  };
  const clearRetardFor = (name: string) => {
    setDelaysByAgent((prev) => {
      const { [name]: _omit, ...rest } = prev;
      return rest;
    });
    if (delayEditFor === name) setDelayEditFor(null);
  };

  // Bulk
  const clearAll = () => { setPresent(new Set()); setAbsent(new Set()); setDelaysByAgent({}); };
  const setAllPresent = () => { setPresent(new Set(agents)); setAbsent(new Set()); };
  const setAllAbsent = () => { setAbsent(new Set(agents)); setPresent(new Set()); setDelaysByAgent({}); };

  // Agents mgmt
  const addAgent = () => {
    const n = newAgent.trim();
    if (!n || agents.includes(n)) return;
    setAgents((prev) => [...prev, n]);
    setNewAgent("");
  };
  const removeAgent = () => {
    const n = removeSelection.trim();
    if (!n) return;
    setAgents((prev) => prev.filter((x) => x !== n));
    setPresent((prev) => { const next = new Set(prev); next.delete(n); return next; });
    setAbsent((prev) => { const next = new Set(prev); next.delete(n); return next; });
    setDelaysByAgent((prev) => { const { [n]: _omit, ...rest } = prev; return rest; });
    setRemoveSelection("");
    // Persist immediately to Firestore to avoid reappearance on refresh
    (async () => {
      try {
        const region = (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || undefined;
        await saveRoster(agents.filter(x => x !== n), region);
      } catch {}
    })();
  };

  // Encadrants toggle
  const toggleEncadrant = (name: string) => {
    setReporting((r) => {
      const exists = r.encadrants.includes(name);
      return { ...r, encadrants: exists ? r.encadrants.filter((x) => x !== name) : [...r.encadrants, name] };
    });
  };


  const handleSend = async () => {
    const today = selectedDate ? new Date(selectedDate) : new Date();
    const region = (localStorage.getItem('activeRegion') as 'FR' | 'CIV') || undefined;
    await handleOpenOutlookWeb({
      missionLabel: title.includes('—') ? title.split('—').pop()!.trim() : 'ORANGE CANAL+',
      date: today,
      encadrants: reporting.encadrants,
      ventesConfirmees: reporting.ventesConfirmees,
      mailsCommandes: reporting.mailsCommandes,
      conges: reporting.conges,
      sanction: reporting.sanction,
      demission: reporting.demission,
      notes: reporting.notes,
      present: agents.filter(a => present.has(a)),
      absent: agents.filter(a => absent.has(a)),
      unmarked: agents.filter(a => !present.has(a) && !absent.has(a)),
      delaysByAgent,
      region,
      toList,
      ccList,
      logos: {
        leftUrl: '/mars-logo.png',
        rightUrl: '/cactus-icon.svg',
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header / Summary */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">{title}</h3>
            <p className="text-blue-200 text-sm">Gestion quotidienne présence</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100/20 text-emerald-300 border border-emerald-400/30">Présents <b className="ml-1">{presentCount}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-rose-100/20 text-rose-300 border border-rose-400/30">Absents <b className="ml-1">{absentCount}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100/20 text-amber-300 border border-amber-400/30">Non marqués <b className="ml-1">{unmarkedCount}</b></span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-100/20 text-indigo-200 border border-indigo-400/30">Total <b className="ml-1">{total}</b></span>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-300" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="text-right text-[11px] text-blue-200 mt-1">{progressPct}% complété</div>
      </div>

      {/* Actions + Filters */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur space-y-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={setAllPresent} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25">
            <CheckCircle className="w-4 h-4" /> Tous présents
          </button>
          <button onClick={setAllAbsent} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-rose-500/20 border border-rose-400/30 text-rose-100 hover:bg-rose-500/25">
            <XCircle className="w-4 h-4" /> Tous absents
          </button>
          <button onClick={clearAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white/10 border border-white/15 text-blue-100 hover:bg-white/15">
            <Trash2 className="w-4 h-4" /> Réinitialiser
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-blue-200 absolute left-2 top-2.5" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher un agent…" className="pl-8 pr-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white placeholder:text-blue-200/70 outline-none focus:ring-2 focus:ring-blue-400/30" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "present", "absent", "unmarked"] as const).map((m) => (
              <button key={m} onClick={() => setFilterMode(m)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                filterMode === m ? "bg-blue-600 text-white border-blue-500" : "bg-white/5 text-blue-100 border-white/15 hover:bg-white/10"
              }`}>
                {m === "all" ? "Tous" : m === "present" ? "Présents" : m === "absent" ? "Absents" : "Non marqués"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reporting bloc */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-semibold text-blue-100">Reporting — ORANGE CANAL+</h4>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-2 py-1.5 rounded-md bg-white/10 border border-white/15 text-xs text-white outline-none focus:ring-2 focus:ring-blue-400/30" />
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-200">
            <Users className="w-4 h-4" /> Encadrant(s):
            {(["Arthur", "Maurice"] as const).map((n) => {
              const active = reporting.encadrants.includes(n);
              return (
                <button key={n} onClick={() => toggleEncadrant(n)} className={`px-2 py-1 rounded-full border ${active ? "bg-indigo-600 text-white border-indigo-400" : "bg-white/5 text-blue-100 border-white/15 hover:bg-white/10"}`}>
                  {n}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowSettings((s) => !s)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-white/10 text-blue-100 border border-white/15 hover:bg-white/15" title="Paramètres d’envoi">
            <Settings className="w-4 h-4" /> Paramètres
          </button>
          <button onClick={handleSend} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white border border-emerald-500 hover:brightness-110" title="Ouvre Outlook avec Sujet/À/CC et copie le HTML">
            <Send className="w-4 h-4" /> Envoyer instantanément
          </button>
        </div>
        {showSettings && (
          <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-blue-100">
            <div className="font-semibold mb-2">Paramètres d’envoi</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-blue-300 mb-1">À (séparé par des virgules)</label>
                <input
                  value={toList.join(', ')}
                  onChange={(e) => setToList(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
              <div>
                <label className="block text-[11px] text-blue-300 mb-1">CC (séparé par des virgules)</label>
                <input
                  value={ccList.join(', ')}
                  onChange={(e) => setCcList(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-blue-400/30"
                />
              </div>
            </div>
            <div className="mt-2 text-right">
              <button
                onClick={() => { setRecipientsConfig({ to: toList, cc: ccList }); setShowSettings(false); }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white border border-blue-500 hover:brightness-110"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Ventes confirmées */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Ventes confirmées</p>
            <input type="number" min={0} value={reporting.ventesConfirmees} onChange={(e) => setReporting((r) => ({ ...r, ventesConfirmees: Math.max(0, Number(e.target.value || 0)) }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" />
          </div>
          {/* Mails */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Mails de commandes envoyés</p>
            <input type="number" min={0} value={reporting.mailsCommandes} onChange={(e) => setReporting((r) => ({ ...r, mailsCommandes: Math.max(0, Number(e.target.value || 0)) }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" />
          </div>
          {/* Absence (auto) */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Absence (auto)</p>
            <div className="text-2xl font-extrabold text-white">{absentCount}</div>
          </div>
          {/* Retard (auto) */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Retard (auto)</p>
            <div className="text-2xl font-extrabold text-white">{retardCount}</div>
          </div>
          {/* Congés */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Congés</p>
            <input type="number" min={0} value={reporting.conges} onChange={(e) => setReporting((r) => ({ ...r, conges: Math.max(0, Number(e.target.value || 0)) }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" />
          </div>
          {/* Sanction */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Mise à pied / Sanction</p>
            <input type="number" min={0} value={reporting.sanction} onChange={(e) => setReporting((r) => ({ ...r, sanction: Math.max(0, Number(e.target.value || 0)) }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" />
          </div>
          {/* Démission */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Démission</p>
            <input type="number" min={0} value={reporting.demission} onChange={(e) => setReporting((r) => ({ ...r, demission: Math.max(0, Number(e.target.value || 0)) }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" />
          </div>
          {/* Notes */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 sm:col-span-2">
            <p className="text-xs text-blue-200 mb-1">Soucis technique</p>
            <textarea value={reporting.notes.technique} onChange={(e) => setReporting((r) => ({ ...r, notes: { ...r.notes, technique: e.target.value } }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" rows={2} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Électricité</p>
            <textarea value={reporting.notes.electricite} onChange={(e) => setReporting((r) => ({ ...r, notes: { ...r.notes, electricite: e.target.value } }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" rows={2} />
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-blue-200 mb-1">Production</p>
            <textarea value={reporting.notes.production} onChange={(e) => setReporting((r) => ({ ...r, notes: { ...r.notes, production: e.target.value } }))} className="w-full px-3 py-2 rounded-md bg-white/10 border border-white/15 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400/30" rows={2} />
          </div>
        </div>
      </div>

      {/* Gestion des agents */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur space-y-3">
        <div className="text-sm font-semibold text-blue-100">Gestion des agents</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newAgent} onChange={(e) => setNewAgent(e.target.value)} placeholder="Nom agent (ex: Jean)" className="px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white placeholder:text-blue-200/70 outline-none focus:ring-2 focus:ring-blue-400/30 w-56" />
          <button onClick={addAgent} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-500">
            <Plus className="w-4 h-4" /> Ajouter
          </button>
          <span className="text-blue-300/50">•</span>
          <select value={removeSelection} onChange={(e) => setRemoveSelection(e.target.value)} className="px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white outline-none focus:ring-2 focus:ring-blue-400/30 w-56">
            <option value="">Sélectionner un agent</option>
            {agents.map((n) => (
              <option key={n} value={n} className="text-blue-900">{n}</option>
            ))}
          </select>
          <button onClick={removeAgent} disabled={!removeSelection} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-rose-600 text-white border border-rose-500 disabled:opacity-50 disabled:cursor-not-allowed">
            <Trash2 className="w-4 h-4" /> Supprimer
          </button>
        </div>
      </div>

      {/* Liste des agents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredAgents.map((name) => {
          const isPresent = present.has(name);
          const isAbsent = absent.has(name);
          const delayInfo = delaysByAgent[name];
          const delayLabel = delayInfo ? `${delayInfo.value} ${delayInfo.unit === "minutes" ? "min" : "h"}` : "";
          return (
            <div key={name} className={`rounded-xl border p-4 transition shadow-sm ${
              isPresent
                ? "border-emerald-400/30 bg-emerald-100/10"
                : isAbsent
                ? "border-rose-400/30 bg-rose-100/10"
                : "border-white/10 bg-white/5"
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`font-semibold ${isPresent ? "text-emerald-200" : isAbsent ? "text-rose-200" : "text-blue-100"}`}>
                  {name}
                  {delayInfo && (
                    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-sky-400/30 bg-sky-100/10 text-[11px] text-sky-100">
                      <Clock className="w-3 h-3" /> {delayLabel}
                    </span>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                  isPresent
                    ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-100"
                    : isAbsent
                    ? "bg-rose-500/20 border-rose-400/30 text-rose-100"
                    : "bg-white/10 border-white/15 text-blue-100"
                }`}>{isPresent ? "PRÉSENT" : isAbsent ? "ABSENT" : "—"}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => togglePresent(name)} className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition ${
                  isPresent
                    ? "bg-emerald-600 text-white border-emerald-500"
                    : "bg-emerald-500/15 text-emerald-100 border-emerald-400/30 hover:bg-emerald-500/20"
                }`}>
                  <CheckCircle className="w-4 h-4" /> Présent
                </button>
                <button onClick={() => toggleAbsent(name)} className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition ${
                  isAbsent
                    ? "bg-rose-600 text-white border-rose-500"
                    : "bg-rose-500/15 text-rose-100 border-rose-400/30 hover:bg-rose-500/20"
                }`}>
                  <XCircle className="w-4 h-4" /> Absent
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => setDelayEditFor((prev) => (prev === name ? null : name))} className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition ${
                  delayEditFor === name ? "bg-sky-600 text-white border-sky-500" : "bg-sky-500/15 text-sky-100 border-sky-400/30 hover:bg-sky-500/20"
                }`}>
                  <Clock className="w-4 h-4" /> Retard
                </button>
                {delayInfo && (
                  <button onClick={() => clearRetardFor(name)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white/10 border border-white/15 text-blue-100 hover:bg-white/15">
                    Effacer
                  </button>
                )}
              </div>

              {delayEditFor === name && (
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <input type="number" min={0} value={delayInfo?.value ?? 0} onChange={(e) => setRetardFor(name, Number(e.target.value || 0), delayInfo?.unit || "minutes")} className="px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white outline-none focus:ring-2 focus:ring-sky-400/30" />
                  <select value={delayInfo?.unit || "minutes"} onChange={(e) => setRetardFor(name, delayInfo?.value || 0, e.target.value as DelayUnit)} className="px-3 py-2 rounded-md bg-white/10 border border-white/15 text-sm text-white outline-none focus:ring-2 focus:ring-sky-400/30">
                    <option value="minutes" className="text-blue-900">minutes</option>
                    <option value="heures" className="text-blue-900">heures</option>
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

          {/* Historique des récap envoyés */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-blue-100">Historique des récaps envoyés</div>
              <span className="px-2 py-1 rounded-full text-[11px] bg-white/10 border border-white/15 text-blue-200">Temps réel</span>
            </div>
            <div className="space-y-2">
              {loadingRecaps && <div className="text-blue-200 text-sm">Chargement…</div>}
              {!loadingRecaps && recaps.length === 0 && (
                <div className="text-blue-200 text-sm">Aucun récap historisé.</div>
              )}
              {!loadingRecaps && recaps.map((r) => {
                const ventes = Number(r.kpis?.ventesConfirmees || 0);
                const presents = Number(r.presence?.present?.length || 0);
                return (
                  <div key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center gap-3 justify-between">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white text-sm whitespace-nowrap">{r.date}</span>
                      <div className="text-blue-100 text-sm truncate max-w-[40vw]">{r.subject || 'Rapport'}</div>
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-indigo-700/20 border border-indigo-500/30 text-indigo-100">Ventes: {ventes}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-700/20 border border-emerald-500/30 text-emerald-100">Présents: {presents}</span>
                    </div>
                    <button onClick={() => downloadRecapCsv(r)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-white/10 text-blue-100 border border-white/15 hover:bg-white/15">
                      <Download className="w-4 h-4" /> Télécharger CSV
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Récap mensuel */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-blue-100">Récap mensuel</div>
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/10 border border-white/15 text-white text-xs">
                  <Calendar className="w-3.5 h-3.5" /> {monthKey}
                </span>
              </div>
              <button onClick={downloadMonthlyCsv} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-violet-600 text-white border border-violet-500 hover:brightness-110">
                Télécharger CSV
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-indigo-100/20 text-indigo-300 border border-indigo-400/30">Ventes conf.: <b className="ml-1">{monthly.sum.ventesConfirmees}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-blue-100/20 text-blue-200 border border-blue-400/30">Mails: <b className="ml-1">{monthly.sum.mailsCommandes}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-rose-100/20 text-rose-300 border border-rose-400/30">Abs.: <b className="ml-1">{monthly.sum.absents}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-amber-100/20 text-amber-300 border border-amber-400/30">Retard: <b className="ml-1">{monthly.sum.retards}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100/20 text-emerald-300 border border-emerald-400/30">Présents: <b className="ml-1">{monthly.sum.presents}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-fuchsia-100/20 text-fuchsia-300 border border-fuchsia-400/30">Congés: <b className="ml-1">{monthly.sum.conges}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-purple-100/20 text-purple-300 border border-purple-400/30">Sanction: <b className="ml-1">{monthly.sum.sanction}</b></span>
              <span className="px-2.5 py-1 rounded-full bg-slate-100/20 text-slate-300 border border-slate-400/30">Démission: <b className="ml-1">{monthly.sum.demission}</b></span>
            </div>
            {monthly.topSellers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {monthly.topSellers.map(([seller, n]) => (
                  <span key={seller} className="px-2 py-1 rounded-full text-[11px] bg-white/10 border border-white/15 text-blue-100">{seller} <b className="ml-1">{n}</b></span>
                ))}
              </div>
            )}
          </div>

      {/* Footer summary */}
      <div className="text-right text-sm text-blue-200">
        Présents: <span className="font-semibold text-emerald-200">{presentCount}</span> • Absents: <span className="font-semibold text-rose-200">{absentCount}</span> • Non marqués: <span className="font-semibold text-amber-200">{unmarkedCount}</span> • Total: <span className="font-semibold text-indigo-200">{total}</span>
      </div>

      {/* Scroll vertical géré par le conteneur parent */}
    </div>
  );
};

export default PresenceTAStandalone;
