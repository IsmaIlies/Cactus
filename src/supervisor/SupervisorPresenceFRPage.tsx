import React from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

type RecapDoc = {
  id: string;
  date: string; // yyyy-MM-dd
  mission?: string;
  subject?: string;
  presence?: { present?: string[]; absent?: string[]; unmarked?: string[] };
};

type Period = 'jour' | 'semaine' | 'mois';

const toDate = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const startOfISOWeek = (d: Date) => {
  const day = d.getDay() || 7; // 1..7, Mon=1
  const res = new Date(d);
  res.setDate(d.getDate() - (day - 1));
  res.setHours(0, 0, 0, 0);
  return res;
};
const endOfISOWeek = (d: Date) => {
  const start = startOfISOWeek(d);
  const res = new Date(start);
  res.setDate(start.getDate() + 7);
  return res; // exclusive
};

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);

const formatFR = (d: Date, opts?: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('fr-FR', opts || { weekday: 'long', day: '2-digit', month: 'long' });

const SupervisorPresenceFRPage: React.FC = () => {
  const [period, setPeriod] = React.useState<Period>('jour');
  const [refDate, setRefDate] = React.useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [recaps, setRecaps] = React.useState<RecapDoc[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('');
  // no loading state needed; UI lists render when data arrives

  React.useEffect(() => {
    const qRef = query(collection(db, 'presenceRecaps'), orderBy('date', 'desc'));
    const unsub = onSnapshot(qRef, (snap) => {
      const list: RecapDoc[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setRecaps(list);
    }, () => {});
    return () => { try { unsub(); } catch {} };
  }, []);

  // Filtre mission Canal+ FR (tolérant)
  const recapsFR = React.useMemo(() => {
    return recaps.filter(r => /canal\+/i.test(String(r.mission || '')) || /canal/i.test(String(r.subject || '')));
  }, [recaps]);

  const ref = React.useMemo(() => toDate(refDate) || new Date(), [refDate]);
  const range = React.useMemo(() => {
    if (period === 'jour') {
      const s = new Date(ref); s.setHours(0,0,0,0);
      const e = new Date(s); e.setDate(s.getDate() + 1);
      return { start: s, end: e };
    }
    if (period === 'semaine') return { start: startOfISOWeek(ref), end: endOfISOWeek(ref) };
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }, [period, ref]);

  const inRange = (dStr: string) => {
    const d = toDate(dStr);
    if (!d) return false;
    return d >= range.start && d < range.end;
  };

  const selected = React.useMemo(() => recapsFR.filter(r => inRange(r.date)), [recapsFR, range.start.getTime(), range.end.getTime()]);

  // Liste d'agents (présents dans la période sélectionnée)
  const agentsInRange = React.useMemo(() => {
    const s = new Set<string>();
    selected.forEach(r => (r.presence?.present || []).forEach(n => s.add(n)));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [selected]);

  const getFirstName = (full: string) => {
    const t = (full || '').trim();
    if (!t) return '';
    const first = t.split(/\s+/)[0];
    return first;
  };

  const selectedAgentFirstName = React.useMemo(() => getFirstName(selectedAgent), [selectedAgent]);

  // Calculs
  const byDay = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    selected.forEach(r => {
      const key = r.date;
      const set = map.get(key) || new Set<string>();
      const pres = r.presence?.present || [];
      pres.forEach(n => set.add(n));
      map.set(key, set);
    });
    return map;
  }, [selected]);

  const distinctInRange = React.useMemo(() => {
    const set = new Set<string>();
    selected.forEach(r => (r.presence?.present || []).forEach(n => set.add(n)));
    return set;
  }, [selected]);

  // Pour l’affichage semaine/mois: jours du range
  const calendarDays = React.useMemo(() => {
    const days: Date[] = [];
    const d = new Date(range.start);
    while (d < range.end) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
  }, [range]);

  const totalForPeriod = distinctInRange.size;

  // Somme des présences journalières sur la période (utile pour le total du mois)
  const sumDailyCounts = React.useMemo(() => {
    let sum = 0;
    byDay.forEach((set, dateStr) => {
      const d = toDate(dateStr);
      if (d && d >= range.start && d < range.end) sum += set.size;
    });
    return sum;
  }, [byDay, range.start.getTime(), range.end.getTime()]);

  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto pr-2 relative scroll-beauty scroll-fade space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-white text-xl font-semibold">Suivi de présence — Canal+ FR</h1>
          <p className="text-blue-200/80 text-sm">Agents présents par période (jour / semaine / mois) et total distinct.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-blue-100/80">Période</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white">
            <option value="jour" className="text-blue-900">Jour</option>
            <option value="semaine" className="text-blue-900">Semaine</option>
            <option value="mois" className="text-blue-900">Mois</option>
          </select>
          <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white" />
          <div className="w-px h-6 bg-white/10 mx-1" />
          <label className="text-sm text-blue-100/80">Agent</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="min-w-[220px] rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white"
          >
            <option value="" className="text-blue-900">— Sélectionner —</option>
            {agentsInRange.map((a) => (
              <option key={a} value={a} className="text-blue-900">{a}</option>
            ))}
          </select>
          {selectedAgent && (
            <span className="ml-1 px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-sm text-blue-100">Prénom: <b className="text-white ml-1">{selectedAgentFirstName}</b></span>
          )}
        </div>
      </div>

      {/* Résumé */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-blue-100">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">Total agents présents distincts: <b className="ml-1">{totalForPeriod}</b></span>
          <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/15">{period === 'jour' ? formatFR(range.start) : period === 'semaine' ? `${formatFR(range.start)} → ${formatFR(new Date(range.end.getTime()-86400000))}` : range.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
          {period === 'mois' && (
            <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-indigo-200">Total présences (somme des jours): <b className="ml-1">{sumDailyCounts}</b></span>
          )}
        </div>
      </div>

      {/* Détail par jour quand semaine/mois */}
      {(period === 'semaine' || period === 'mois') && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {calendarDays.map((d) => {
            const key = d.toISOString().slice(0,10);
            const set = byDay.get(key) || new Set<string>();
            return (
              <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-blue-100 text-sm mb-2 font-semibold">{formatFR(d)}</div>
                <div className="text-xs text-blue-200 mb-2">Présents: <b className="text-emerald-200">{set.size}</b></div>
                {set.size > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {Array.from(set).sort().map((n) => (
                      <span key={n} className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 border border-white/15 text-blue-100">{n}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-blue-300/70 text-xs">— Aucun récap ou aucun présent —</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Détail jour */}
      {period === 'jour' && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          {(() => {
            const key = range.start.toISOString().slice(0,10);
            const set = byDay.get(key) || new Set<string>();
            return (
              <div>
                <div className="text-blue-100 text-sm mb-2 font-semibold">{formatFR(range.start)}</div>
                <div className="text-xs text-blue-200 mb-2">Présents: <b className="text-emerald-200">{set.size}</b></div>
                {set.size > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {Array.from(set).sort().map((n) => (
                      <span key={n} className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 border border-white/15 text-blue-100">{n}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-blue-300/70 text-xs">— Aucun récap ou aucun présent —</div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Récap mensuel: liste distincte complète */}
      {period === 'mois' && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-blue-100 mb-2">Agents distincts présents sur le mois</div>
          {distinctInRange.size > 0 ? (
            <div className="flex flex-wrap gap-1">
              {Array.from(distinctInRange).sort().map((n) => (
                <span key={n} className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 border border-white/15 text-blue-100">{n}</span>
              ))}
            </div>
          ) : (
            <div className="text-blue-300/70 text-xs">— Aucun agent présent enregistré sur ce mois —</div>
          )}
        </div>
      )}
    </div>
  );
};

export default SupervisorPresenceFRPage;
