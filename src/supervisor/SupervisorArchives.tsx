import React from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Download, CheckCircle2 } from 'lucide-react';

type Row = {
  _docId: string;
  day: string;
  period?: string;
  userDisplayName?: string | null;
  userEmail?: string | null;
  project?: string;
  notes?: string;
  reviewStatus?: string;
  mission?: string | null;
  region?: string | null;
  includeMorning?: boolean;
  includeAfternoon?: boolean;
  morningStart?: string;
  morningEnd?: string;
  afternoonStart?: string;
  afternoonEnd?: string;
};

const missionForArea = (area?: string) => {
  const a = (area || '').toUpperCase();
  if (a === 'LEADS') return 'ORANGE_LEADS';
  return 'CANAL_PLUS';
};

const SupervisorArchives: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const [period, setPeriod] = React.useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${y}-${m}`;
  });
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('__ALL__');
  const [onlyAgentsWithEntries, setOnlyAgentsWithEntries] = React.useState<boolean>(true);

  React.useEffect(() => {
    setLoading(true); setError(null);
    const unsubs: Unsubscribe[] = [];
    try {
      const qA = query(collection(db, 'hoursEntries'), where('reviewStatus', '==', 'Approved'));
      const qAL = query(collection(db, 'hoursEntries'), where('reviewStatus', '==', 'approved'));
      let cacheA: Row[] = []; let cacheAL: Row[] = [];
      const merge = () => {
        const merged = [...cacheA, ...cacheAL]
          .filter((v, i, a) => a.findIndex(x => x._docId === v._docId) === i)
          .sort((a, b) => (b.day || '').localeCompare(a.day || ''));
        setRows(merged); setLoading(false);
      };
      unsubs.push(
        onSnapshot(qA, (snap: any) => { cacheA = []; (snap as any).forEach((d: any) => cacheA.push({ _docId: d.id, ...(d.data() as any) })); merge(); }, (e) => { setError(e?.message||'Erreur chargement'); setLoading(false); }),
        onSnapshot(qAL, (snap: any) => { cacheAL = []; (snap as any).forEach((d: any) => cacheAL.push({ _docId: d.id, ...(d.data() as any) })); merge(); })
      );
    } catch (e: any) {
      setError(e?.message || 'Erreur'); setLoading(false);
    }
    return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
  }, []);

  const visibleRows = React.useMemo(() => {
    const mission = missionForArea(area);
    const a = (area || '').toUpperCase();
    const prefix = `${period}-`;
    let base = rows;
    if (mission) base = base.filter(r => ((r.mission || '').toUpperCase() === mission) || !r.mission);
    if (a === 'FR' || a === 'CIV') base = base.filter(r => (r.region || '').toUpperCase() === a || !r.region);
    base = base.filter(r => (r as any).period === period || (r.day || '').startsWith(prefix));
    if (selectedAgent !== '__ALL__') base = base.filter(r => (r.userDisplayName === selectedAgent) || (r.userEmail === selectedAgent));
    base.sort((x, y) => (x.day || '').localeCompare(y.day || ''));
    return base;
  }, [rows, area, period, selectedAgent]);

  const uniqueAgents = React.useMemo(() => {
    const set = new Set<string>();
    const prefix = `${period}-`;
    rows.forEach(r => {
      const agent = r.userDisplayName || r.userEmail; if (!agent) return;
      const mOk = ((r.mission || '').toUpperCase() === missionForArea(area)) || !r.mission;
      const aOk = ['FR','CIV'].includes((area||'').toUpperCase()) ? (((r.region || '').toUpperCase() === (area||'').toUpperCase()) || !r.region) : true;
      const pOk = ((r as any).period === period) || (r.day || '').startsWith(prefix);
      if (mOk && aOk && pOk) set.add(agent);
    });
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ['__ALL__', ...(onlyAgentsWithEntries ? list : list)];
  }, [rows, area, period, onlyAgentsWithEntries]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, Row[]>();
    visibleRows.forEach(r => {
      const key = r.userDisplayName || r.userEmail || '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    return Array.from(groups.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  }, [visibleRows]);

  const minutesBetween = (start?: string, end?: string) => {
    if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
    const [h1,m1] = start.split(':').map(Number); const [h2,m2] = end.split(':').map(Number);
    return Math.max(0, (h2*60+m2)-(h1*60+m1));
  };

  const sumMinutes = (list: Row[]) => {
    let total = 0;
    list.forEach(r => {
      if (r.includeMorning) total += minutesBetween(r.morningStart, r.morningEnd);
      if (r.includeAfternoon) total += minutesBetween(r.afternoonStart, r.afternoonEnd);
    });
    return total;
  };

  const toHoursLabel = (mins: number) => `${String(Math.floor(mins/60)).padStart(2,'0')}h${String(mins%60).padStart(2,'0')}`;

  const exportCsv = () => {
    // Excel (FR) friendly export: semicolon separator, FR date format, UTF-8 BOM, CRLF
    const headers = [
      'Période','Jour','Agent',
      'Matin début','Matin fin','Après-midi début','Après-midi fin',
      'Durée (hhmm)','Total (min)','Opération','Brief','Mission','Espace','Statut'
    ];
    const sep = ';';
    const esc = (s: any) => `"${(s ?? '').toString().replaceAll('"','""')}"`;
    const toFR = (iso?: string) => {
      if (!iso) return '';
      // iso expected YYYY-MM-DD; fallback: try Date parse
      try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          const [y,m,d] = iso.split('-').map(Number); return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
        }
        const dt = new Date(iso);
        const d = String(dt.getDate()).padStart(2,'0');
        const m = String(dt.getMonth()+1).padStart(2,'0');
        const y = dt.getFullYear();
        if (!y || isNaN(y)) return iso;
        return `${d}/${m}/${y}`;
      } catch { return iso; }
    };
    const statusToFR = (s?: string) => {
      const v = (s || '').toLowerCase();
      if (v === 'approved') return 'Validé';
      if (v === 'rejected') return 'Refusé';
      if (v === 'pending' || v === 'submitted') return 'En attente';
      return s || '';
    };
    const lines: string[] = [];
    lines.push(headers.join(sep));
    visibleRows.forEach(r => {
      const agent = r.userDisplayName || r.userEmail || '';
      const matinDeb = r.includeMorning ? (r.morningStart || '') : '';
      const matinFin = r.includeMorning ? (r.morningEnd || '') : '';
      const apmDeb = r.includeAfternoon ? (r.afternoonStart || '') : '';
      const apmFin = r.includeAfternoon ? (r.afternoonEnd || '') : '';
      const mins = (r.includeMorning? minutesBetween(r.morningStart, r.morningEnd):0) + (r.includeAfternoon? minutesBetween(r.afternoonStart, r.afternoonEnd):0);
      const mission = r.mission || '';
      const espace = r.region || '';
  const statut = statusToFR(r.reviewStatus || 'Approved');
      lines.push([
        esc(period), esc(toFR(r.day)), esc(agent),
        esc(matinDeb), esc(matinFin), esc(apmDeb), esc(apmFin),
        esc(toHoursLabel(mins)), esc(mins), esc(r.project||''), esc(r.notes||''), esc(mission), esc(espace), esc(statut)
      ].join(sep));
    });
    const csvBody = lines.join('\r\n');
    const BOM = '\uFEFF';
    const csv = BOM + csvBody;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `archives_${area || 'ALL'}_${period}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const monthLabel = React.useMemo(() => {
    try { const [y,m] = period.split('-').map(Number); const dt = new Date(y, m-1, 1); return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch { return period; }
  }, [period]);

  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto pr-2 relative scroll-beauty scroll-fade">
      <div className="space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-900/30 to-emerald-700/10 border border-emerald-500/20 p-5 sticky top-0 z-20 backdrop-blur shadow-[0_10px_30px_-10px_rgba(16,185,129,0.25)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-2xl font-semibold">Archives des check-lists</div>
            <span className="px-3 py-1 rounded-full text-xs bg-emerald-700/30 border border-emerald-500/40 text-emerald-200">PERIODE {monthLabel.toUpperCase()}</span>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <a
                href={`/dashboard/superviseur/${area || ''}/checklist`}
                className="px-3 py-1.5 rounded-full border bg-white/10 border-white/20 hover:bg-white/15 text-white/90 text-xs font-semibold"
                title="Checklist Admin"
              >
                Checklist Admin
              </a>
              <span className="px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-700/30 text-emerald-100 text-xs font-semibold">ARCHIVES</span>
              <button onClick={exportCsv} className="ml-2 px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold inline-flex items-center gap-2 hover:brightness-110"><Download className="w-4 h-4"/>Exporter en CSV</button>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap text-sm">
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-white">
              <Calendar className="w-4 h-4" />
              <input aria-label="Période" type="month" value={period} onChange={(e) => setPeriod((e.target as HTMLInputElement).value)} className="bg-transparent outline-none text-white" />
            </span>
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-white">
              Agent
              <select aria-label="Agent" value={selectedAgent} onChange={(e) => setSelectedAgent((e.target as HTMLSelectElement).value)} className="outline-none bg-white text-black rounded px-2 py-1">
                {uniqueAgents.map(a => (
                  <option key={a} value={a} style={{ color: '#000', backgroundColor: '#fff' }}>
                    {a==='__ALL__' ? 'Tous les agents' : a}
                  </option>
                ))}
              </select>
            </span>
            <label className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-white cursor-pointer">
              <input type="checkbox" checked={!!onlyAgentsWithEntries} onChange={(e) => setOnlyAgentsWithEntries((e.target as HTMLInputElement).checked)} />
              Uniquement agents ayant envoyé
            </label>
          </div>
        </div>

        {/* Grouped lists */}
        <div className="space-y-6">
          {loading && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-blue-100">Chargement…</div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-blue-100">Aucune entrée validée pour {monthLabel}.</div>
          )}
          {!loading && grouped.map(([agent, list]) => {
            if (selectedAgent !== '__ALL__' && agent !== selectedAgent) return null;
            const sentDays = list.length;
            const totalMins = sumMinutes(list);
            return (
              <div key={agent} className="rounded-2xl bg-white/5 border border-white/10 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-semibold">{agent}</div>
                  <div className="text-xs text-blue-200">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-700/30 border border-emerald-500/40 text-emerald-100 mr-2">Jours envoyés: {sentDays}</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-700/30 border border-indigo-500/40 text-indigo-100">Total heures: {toHoursLabel(totalMins)}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-blue-200 sticky top-0 z-10 backdrop-blur bg-black/20">
                      <tr>
                        <th className="text-left p-3">Jour</th>
                        <th className="text-left p-3">Matin</th>
                        <th className="text-left p-3">Après-midi</th>
                        <th className="text-left p-3">Opération</th>
                        <th className="text-left p-3">Heures</th>
                        <th className="text-left p-3">Brief</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => {
                        const mins = (r.includeMorning? minutesBetween(r.morningStart, r.morningEnd):0) + (r.includeAfternoon? minutesBetween(r.afternoonStart, r.afternoonEnd):0);
                        return (
                          <tr key={r._docId} className="border-t border-white/10">
                            <td className="p-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-block w-1.5 h-6 rounded-full bg-emerald-500/60" />
                                <span className="px-3 py-1 rounded-full bg-emerald-700/30 border border-emerald-500/40 text-emerald-100 font-semibold">{r.day || '—'}</span>
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">{r.includeMorning ? `${r.morningStart || ''} - ${r.morningEnd || ''}` : '—'}</td>
                            <td className="p-3 whitespace-nowrap">{r.includeAfternoon ? `${r.afternoonStart || ''} - ${r.afternoonEnd || ''}` : '—'}</td>
                            <td className="p-3 font-semibold">{r.project || '—'}</td>
                            <td className="p-3 whitespace-nowrap">{toHoursLabel(mins)}</td>
                            <td className="p-3">{r.notes || '---'}</td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border bg-emerald-500/15 text-emerald-100 border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" /> Validé
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {error && <div className="text-red-300 text-sm">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default SupervisorArchives;
