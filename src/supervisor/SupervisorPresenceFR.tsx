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

  React.useEffect(() => {
    let unsub: any;
    (async () => {
      await ensureAttendanceDoc(dateStr);
      unsub = subscribeAttendance(dateStr, setAttendance);
      const list = await getRoster();
      setRoster(list);
    })();
    return () => { if (unsub) unsub(); };
  }, [dateStr]);

  const entries = attendance?.entries || {};
  const presentAM = Object.values(entries).filter((e) => e.am).length;
  const presentPM = Object.values(entries).filter((e) => e.pm).length;

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

      <div className="flex flex-wrap items-center gap-3 text-blue-100 text-sm mb-4">
        <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
          AM: <strong className="text-white ml-1">{presentAM}</strong>
        </span>
        <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
          PM: <strong className="text-white ml-1">{presentPM}</strong>
        </span>
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

      <div className="mt-4 text-xs text-blue-200">
        <div className="mb-1">Présents AM:</div>
        <div className="flex flex-wrap gap-2">
          {Object.values(entries).filter(e => e.am).map((e) => (
            <span key={`am_${e.name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-blue-100">
              <CheckSquare className="h-3 w-3 text-cactus-400" /> {e.name}
            </span>
          ))}
          {presentAM === 0 && <span className="text-blue-300">—</span>}
        </div>
        <div className="mt-3 mb-1">Présents PM:</div>
        <div className="flex flex-wrap gap-2">
          {Object.values(entries).filter(e => e.pm).map((e) => (
            <span key={`pm_${e.name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-blue-100">
              <CheckSquare className="h-3 w-3 text-cactus-400" /> {e.name}
            </span>
          ))}
          {presentPM === 0 && <span className="text-blue-300">—</span>}
        </div>
      </div>
    </div>
  );
};

export default SupervisorPresenceFR;
