import React from "react";
import { CheckSquare, PlusSquare, Users, Download } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  AttendanceDoc,
  RosterItem,
  addToRoster,
  ensureAttendanceDoc,
  getRoster,
  setPresence,
  subscribeAttendance,
  patchEntryName,
  getAttendancesInRange,
  removeFromRoster,
} from "../services/attendanceService";

const pad = (n: number) => n.toString().padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

const SupervisorPresenceFR: React.FC = () => {
  const { user } = useAuth();
  const [dateStr, setDateStr] = React.useState<string>(() => toYMD(new Date()));
  const [attendance, setAttendance] = React.useState<AttendanceDoc | null>(null);
  const [roster, setRoster] = React.useState<RosterItem[]>([]);
  const [newName, setNewName] = React.useState("");
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  // History controls
  // Par défaut: aujourd'hui → aujourd'hui
  const [histStart, setHistStart] = React.useState<string>(() => toYMD(new Date()));
  const [histEnd, setHistEnd] = React.useState<string>(() => toYMD(new Date()));
  const [history, setHistory] = React.useState<Array<{date: string; amCount: number; pmCount: number; amNames: string[]; pmNames: string[]}>>([]);
  const [saving, setSaving] = React.useState(false);

  // Load roster, ensure doc, then subscribe
  React.useEffect(() => {
    let unsub: any;
    (async () => {
      const list = await getRoster();
      setRoster(list);
      await ensureAttendanceDoc(dateStr);
      unsub = subscribeAttendance(dateStr, setAttendance);
    })();
    return () => { if (unsub) unsub(); };
  }, [dateStr]);

  // Backfill missing names in attendance from roster
  React.useEffect(() => {
    if (!attendance || roster.length === 0) return;
    const entries = attendance.entries || {};
    const tasks: Promise<any>[] = [];
    roster.forEach(r => {
      const e = entries[r.id];
      if (e && (!e.name || e.name.trim().length === 0) && r.name && r.name.trim().length > 0) {
        tasks.push(patchEntryName(attendance.date, r.id, r.name.trim()));
      }
    });
    if (tasks.length > 0) {
      Promise.all(tasks).catch(() => {/* ignore */});
    }
  }, [attendance, roster]);

  const entries = attendance?.entries || {};
  // Map roster ids to names for quick lookup
  const rosterMap = React.useMemo(() => Object.fromEntries(roster.map(r => [r.id, r.name])), [roster]);
  // Sanitize names (prefer roster name, avoid undefined duplicate keys warnings)
  const sanitize = (e: any) => {
    const raw = (e.name || '').toString().trim();
    if (raw) return raw;
    if (e.agentId && rosterMap[e.agentId]) return rosterMap[e.agentId].trim();
    return e.agentId ? `(${e.agentId})` : `inconnu_${Math.random().toString(36).slice(2,7)}`;
  };

  // Helper to (re)compute history for current range
  const fetchHistory = React.useCallback(async () => {
    const docs = await getAttendancesInRange(histStart, histEnd);
    const rows = docs.map((doc) => {
      const entries = doc?.entries || {};
      const list = Object.entries(entries).map(([id, e]: any) => ({ id, ...e }));
      const label = (e: any) => {
        const nm = (e.name || '').toString().trim();
        if (nm) return nm;
        const theId = e.agentId || e.id;
        if (theId && rosterMap[theId]) return rosterMap[theId].trim();
        if (theId) return `(${theId})`;
        return `inconnu_${Math.random().toString(36).slice(2,7)}`;
      };
      const am = list.filter(e => !!e.am).map(label).sort((a,b)=>a.localeCompare(b,'fr'));
      const pm = list.filter(e => !!e.pm).map(label).sort((a,b)=>a.localeCompare(b,'fr'));
      return { date: doc.date, amCount: am.length, pmCount: pm.length, amNames: am, pmNames: pm };
    }).sort((a,b)=> a.date.localeCompare(b.date));
    setHistory(rows);
  }, [histStart, histEnd, rosterMap]);

  // Load history for range and compute AM/PM lists
  React.useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const saveAndRefresh = async () => {
    try {
      setSaving(true);
      // Backfill names for the selected day to ensure persistence
      const todayEntries = Object.entries(entries);
      const tasks: Promise<any>[] = [];
      todayEntries.forEach(([id, e]: any) => {
        const nm = (e?.name || '').toString().trim();
        const rosterName = rosterMap[id];
        if ((!nm || nm.length === 0) && rosterName && rosterName.trim()) {
          tasks.push(patchEntryName(dateStr, id, rosterName.trim()));
        }
      });
      if (tasks.length) await Promise.all(tasks);
      await fetchHistory();
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const esc = (s: string) => '"' + (s || '').replace(/"/g, '""') + '"';
    const sep = ';'; // Excel FR s'attend à ';' (A;B;C;D)
    // Long format: one row per (date, name) with AM/PM flags
    let csv = ['date','name','am','pm'].join(sep) + '\n';
    history.forEach(h => {
      const uniqueNames = Array.from(new Set([...(h.amNames || []), ...(h.pmNames || [])]));
      uniqueNames.forEach((name) => {
        const am = (h.amNames || []).includes(name) ? '1' : '0';
        const pm = (h.pmNames || []).includes(name) ? '1' : '0';
        const row = [esc(h.date), esc(name), am, pm];
        csv += row.join(sep) + '\n';
      });
    });
    // Ajout d'un BOM pour un meilleur support Excel
    const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presence_fr_history_${histStart}_to_${histEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const amList = Object.values(entries)
    .filter(e => e.am)
    .map(e => ({ label: sanitize(e), id: e.agentId || sanitize(e) }))
    .sort((a,b)=>a.label.localeCompare(b.label,'fr'));
  const pmList = Object.values(entries)
    .filter(e => e.pm)
    .map(e => ({ label: sanitize(e), id: e.agentId || sanitize(e) }))
    .sort((a,b)=>a.label.localeCompare(b.label,'fr'));
  const presentAM = amList.length;
  const presentPM = pmList.length;
  const phraseCount = (n:number) => `Il y a ${n} personne${n>1?'s':''} présente${n>1?'s':''}`;

  const handleToggle = async (id: string, name: string, part: "am" | "pm", checked: boolean) => {
    // Optimistic UI update so the checkbox and counters reflect immediately
    setAttendance((prev) => {
      const base: AttendanceDoc = prev || { region: "FR", date: dateStr, entries: {} };
      const current = base.entries[id] || { name, am: false, pm: false, agentId: id };
      const nextEntry = { ...current, [part]: checked } as any;
      return { ...base, entries: { ...base.entries, [id]: nextEntry } };
    });
    // Persist to Firestore
    await setPresence(dateStr, id, name, part, checked, (user as any)?.uid);
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const item = { id: slug(name), name, active: true };
    await addToRoster(item);
    setRoster((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item]));
    setNewName("");
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: checked }));
  };

  const allSelected = React.useMemo(() => {
    if (roster.length === 0) return false;
    return roster.every((r) => selected[r.id]);
  }, [roster, selected]);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const next: Record<string, boolean> = {};
      roster.forEach((r) => { next[r.id] = true; });
      setSelected(next);
    } else {
      setSelected({});
    }
  };

  const handleDeleteSelected = async () => {
    const ids = roster.filter((r) => selected[r.id]).map((r) => r.id);
    if (ids.length === 0) return;
    const confirmMsg = ids.length === 1
      ? `Supprimer définitivement ce TA du roster ?`
      : `Supprimer définitivement ${ids.length} TAs du roster ?`;
    if (!window.confirm(confirmMsg)) return;
    await removeFromRoster(ids);
    setRoster((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelected({});
  };

  // Compose full list for the day from roster (sorted)
  const rows = [...roster].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-white">
          <Users className="h-5 w-5 text-blue-200" />
          <h3 className="font-semibold">Présence Canal+ FR</h3>
        </div>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-blue-100 text-sm mb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
            AM: <strong className="text-white ml-1">{presentAM}</strong>
          </div>
          <div className="text-[11px] text-blue-300/80">{phraseCount(presentAM)} pour le matin</div>
          {presentAM > 0 && (
            <div className="flex flex-wrap gap-1">
              {amList.map(n => (
                <span key={`am_badge_${n.id}`} className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[11px]">{n.label}</span>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
            PM: <strong className="text-white ml-1">{presentPM}</strong>
          </div>
          <div className="text-[11px] text-blue-300/80">{phraseCount(presentPM)} pour l'après‑midi</div>
          {presentPM > 0 && (
            <div className="flex flex-wrap gap-1">
              {pmList.map(n => (
                <span key={`pm_badge_${n.id}`} className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-[11px]">{n.label}</span>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {Object.values(selected).some(Boolean) && (
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-red-600/80 hover:bg-red-600 text-white"
              title="Supprimer la sélection du roster FR"
            >
              Supprimer sélection
            </button>
          )}
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ajouter un TA (nom)"
            className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500"
          />
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-white/10 border border-white/10 text-blue-100 hover:bg-white/20"
            title="Ajouter au roster FR"
          >
            <PlusSquare className="h-4 w-4" /> Ajouter
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-900/70 backdrop-blur border-b border-white/10 text-blue-200">
            <tr>
              <th className="text-left p-3 w-10">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="accent-cactus-600" checked={allSelected} onChange={(e)=>toggleSelectAll(e.target.checked)} />
                </label>
              </th>
              <th className="text-left p-3">Nom</th>
              <th className="text-left p-3">AM</th>
              <th className="text-left p-3">PM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = entries[r.id] || { name: r.name, am: false, pm: false };
              return (
                <tr key={r.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!selected[r.id]}
                      onChange={(ev)=>toggleSelect(r.id, ev.target.checked)}
                      className="accent-cactus-600"
                      aria-label={`Sélectionner ${r.name}`}
                    />
                  </td>
                  <td className="p-3 text-white">{r.name}</td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2 text-blue-100">
                      <input
                        type="checkbox"
                        checked={!!e.am}
                        onChange={(ev) => handleToggle(r.id, r.name, "am", ev.target.checked)}
                        className="accent-cactus-600"
                      />
                      <span className="hidden sm:inline">Présent AM</span>
                    </label>
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2 text-blue-100">
                      <input
                        type="checkbox"
                        checked={!!e.pm}
                        onChange={(ev) => handleToggle(r.id, r.name, "pm", ev.target.checked)}
                        className="accent-cactus-600"
                      />
                      <span className="hidden sm:inline">Présent PM</span>
                    </label>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr className="border-t border-white/10">
                <td className="p-3 text-blue-200" colSpan={4}>Aucun TA dans le roster. Ajoutez un nom ci‑dessus.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={saveAndRefresh} disabled={saving} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-cactus-600/90 hover:bg-cactus-600 text-white disabled:opacity-50">
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      {/* Historique AM/PM */}
      <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-white">
            <CheckSquare className="h-5 w-5 text-blue-200" />
            <h3 className="font-semibold">Historique présence (AM / PM)</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={histStart} onChange={(e)=>setHistStart(e.target.value)} className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm" />
            <span className="text-blue-200">→</span>
            <input type="date" value={histEnd} onChange={(e)=>setHistEnd(e.target.value)} className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm" />
            <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 border border-white/10 text-blue-100 hover:bg-white/20" title="Exporter en CSV">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/70 backdrop-blur border-b border-white/10 text-blue-200">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">AM (noms)</th>
                <th className="text-left p-3">PM (noms)</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr className="border-t border-white/10"><td colSpan={3} className="p-3 text-blue-200">Aucun historique sur la période.</td></tr>
              ) : history.map((h) => (
                <tr key={h.date} className="border-t border-white/10 hover:bg-white/5">
                  <td className="p-3 text-white whitespace-nowrap">{h.date}</td>
                  <td className="p-3 text-blue-100">
                    <span className="text-white font-semibold mr-2">{h.amCount}</span>
                    {h.amNames.length > 0 && (
                      <span className="text-[11px] text-blue-200">{h.amNames.join(' · ')}</span>
                    )}
                  </td>
                  <td className="p-3 text-blue-100">
                    <span className="text-white font-semibold mr-2">{h.pmCount}</span>
                    {h.pmNames.length > 0 && (
                      <span className="text-[11px] text-blue-200">{h.pmNames.join(' · ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ancienne section détaillée remplacée par les listes au-dessus */}
    </div>
  );
};

export default SupervisorPresenceFR;
