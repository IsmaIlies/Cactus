import React from "react";
import { CheckSquare, PlusSquare, Users } from "lucide-react";
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

  const handleToggle = async (name: string, part: "am" | "pm", checked: boolean) => {
    const id = slug(name);
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
                  <td className="p-3 text-white">{r.name}</td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2 text-blue-100">
                      <input
                        type="checkbox"
                        checked={!!e.am}
                        onChange={(ev) => handleToggle(r.name, "am", ev.target.checked)}
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
                        onChange={(ev) => handleToggle(r.name, "pm", ev.target.checked)}
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
                <td className="p-3 text-blue-200" colSpan={3}>Aucun TA dans le roster. Ajoutez un nom ci‑dessus.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ancienne section détaillée remplacée par les listes au-dessus */}
    </div>
  );
};

export default SupervisorPresenceFR;
