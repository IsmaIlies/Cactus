import React from 'react';
import { collection, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import { approveEntry, rejectEntry, updateEntryFields } from '../services/hoursService';
import { useParams } from 'react-router-dom';
import { Calendar, Download, RefreshCw, User as UserIcon, ArrowDown, ArrowUp, CheckCircle2, XCircle, Clock as ClockIcon } from 'lucide-react';

type Row = {
  _docId: string;
  day: string;
  userDisplayName?: string | null;
  userEmail?: string | null;
  project?: string;
  notes?: string;
  reviewStatus?: string;
  mission?: string | null;
  region?: string | null;
  createdAt?: any;
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

// region filter handled client-side within visibleRows

type ViewMode = 'pending' | 'history';

const SupervisorChecklist: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const [rows, setRows] = React.useState<Row[]>([]); // rows displayed according to view
  const [rowsPendingCache, setRowsPendingCache] = React.useState<Row[]>([]);
  const [rowsHistoryCache, setRowsHistoryCache] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ViewMode>('pending');
  const [period, setPeriod] = React.useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${y}-${m}`;
  });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<Partial<Row>>({});
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('__ALL__');
  const [showRejected, setShowRejected] = React.useState<boolean>(false);

  const theme = React.useMemo(() => {
    const mission = missionForArea(area);
    if (mission === 'ORANGE_LEADS') {
      return {
        header: 'from-indigo-900/40 to-indigo-700/10',
        border: 'border-indigo-400/20',
        badge: 'bg-indigo-600/15 border-indigo-500/40 text-indigo-200',
        primaryBtn: 'bg-indigo-600',
        accentIcon: 'text-indigo-300',
      } as const;
    }
    return {
      header: 'from-emerald-900/30 to-emerald-700/10',
      border: 'border-emerald-500/20',
      badge: 'bg-emerald-700/30 border-emerald-500/40 text-emerald-200',
      primaryBtn: 'bg-emerald-600',
      accentIcon: 'text-emerald-300',
    } as const;
  }, [area]);

  React.useEffect(() => {
    setLoading(true); setError(null);

    const buildBase = (status: string) => query(collection(db, 'hoursEntries'), where('reviewStatus', '==', status));

    let unsubs: Unsubscribe[] = [];
    try {
      // Pending + legacy
      let cacheP: Row[] = []; let cachePL: Row[] = [];
      const mergePending = () => {
        const merged = [...cacheP, ...cachePL]
          .filter((v, i, a) => a.findIndex(x => x._docId === v._docId) === i)
          .sort((a, b) => (b.day || '').localeCompare(a.day || ''));
        setRowsPendingCache(merged);
        if (view === 'pending') setRows(merged);
      };
      const unsubP = onSnapshot(buildBase('Pending'), (snap: any) => {
        cacheP = []; (snap as any).forEach((d: any) => cacheP.push({ _docId: d.id as string, ...(d.data() as any) }));
        mergePending(); setLoading(false);
      }, (e: any) => { setError(e?.message || 'Erreur chargement'); setLoading(false); });
      const unsubPL = onSnapshot(buildBase('pending'), (snap: any) => {
        cachePL = []; (snap as any).forEach((d: any) => cachePL.push({ _docId: d.id as string, ...(d.data() as any) }));
        mergePending();
      }, () => {});
      unsubs.push(unsubP, unsubPL);

      // History (Approved/Rejected) + legacy
      let cacheA: Row[] = []; let cacheR: Row[] = []; let cacheAL: Row[] = []; let cacheRL: Row[] = [];
      const mergeHistory = () => {
        const merged = [...cacheA, ...cacheR, ...cacheAL, ...cacheRL]
          .filter((v, i, a) => a.findIndex(x => x._docId === v._docId) === i)
          .sort((a, b) => (b.day || '').localeCompare(a.day || ''));
        setRowsHistoryCache(merged);
        if (view === 'history') setRows(merged);
      };
      const unsubA = onSnapshot(buildBase('Approved'), (snap: any) => {
        cacheA = []; (snap as any).forEach((d: any) => cacheA.push({ _docId: d.id as string, ...(d.data() as any) }));
        mergeHistory(); setLoading(false);
      }, (e: any) => { setError(e?.message || 'Erreur chargement'); setLoading(false); });
      const unsubR = onSnapshot(buildBase('Rejected'), (snap: any) => {
        cacheR = []; (snap as any).forEach((d: any) => cacheR.push({ _docId: d.id as string, ...(d.data() as any) }));
        mergeHistory(); setLoading(false);
      }, (e: any) => { setError(e?.message || 'Erreur chargement'); setLoading(false); });
      const unsubAL = onSnapshot(buildBase('approved'), (snap: any) => {
        cacheAL = []; (snap as any).forEach((d: any) => cacheAL.push({ _docId: d.id as string, ...(d.data() as any) }));
        mergeHistory();
      }, () => {});
      const unsubRL = onSnapshot(buildBase('rejected'), (snap: any) => {
        cacheRL = []; (snap as any).forEach((d: any) => cacheRL.push({ _docId: d.id as string, ...(d.data() as any) }));
        mergeHistory();
      }, () => {});
      unsubs.push(unsubA, unsubR, unsubAL, unsubRL);
    } catch (e: any) {
      setError(e?.message || 'Erreur'); setLoading(false);
    }
    return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
  }, [area, view, refreshNonce]);

  const visibleRows = React.useMemo(() => {
    // 1) Filter by mission/area; include legacy docs with missing mission/region
  const mission = missionForArea(area);
    let base = rows;
    if (mission) {
      base = base.filter(r => ((r.mission || '').toUpperCase() === mission) || !r.mission);
    }
    // Region filter: be permissive for both views to avoid hiding items due to wrong/default region
    // Archives page can remain strict if needed; Supervisor list stays inclusive
    // (no extra region filter here; mission+period already constrain results)
    // 2) Filter by period (prefer period field, fallback to day prefix)
    const prefix = `${period}-`;
    base = base.filter(r => (r as any).period === period || (r.day || '').startsWith(prefix));
    // 3) Filter by agent dropdown
    if (selectedAgent !== '__ALL__') {
      base = base.filter(r => (r.userDisplayName === selectedAgent) || (r.userEmail === selectedAgent));
    }
    // 3.5) In history view, optionally hide rejected
    if (view === 'history' && !showRejected) {
      base = base.filter(r => {
        const st = (r.reviewStatus || '').toLowerCase();
        return st !== 'rejected';
      });
    }
    // 4) Sort by day desc as final safeguard
    base.sort((a, b) => (b.day || '').localeCompare(a.day || ''));
    return base;
  }, [rows, selectedAgent, area, period, view, showRejected]);

  const uniqueAgents = React.useMemo(() => {
    const set = new Set<string>();
    const source = [...rowsPendingCache, ...rowsHistoryCache];
    source.forEach(r => {
      const v = r.userDisplayName || r.userEmail; if (v) set.add(v);
    });
    return ['__ALL__', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rowsPendingCache, rowsHistoryCache]);

  const onApprove = async (id: string) => {
    try { await approveEntry(id); } catch (e) { console.error(e); }
  };
  const onReject = async (id: string) => {
    try { await rejectEntry(id); } catch (e) { console.error(e); }
  };

  const beginEdit = (r: Row) => {
    setEditingId(r._docId);
    setEditDraft({
      project: r.project || '',
      notes: r.notes || '',
      includeMorning: !!r.includeMorning,
      includeAfternoon: !!r.includeAfternoon,
      morningStart: r.morningStart || '',
      morningEnd: r.morningEnd || '',
      afternoonStart: r.afternoonStart || '',
      afternoonEnd: r.afternoonEnd || '',
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };
  const commitEdit = async (id: string) => {
    const patch: any = {
      project: editDraft.project ?? '',
      notes: (editDraft.notes || '')?.trim() || undefined,
      includeMorning: !!editDraft.includeMorning,
      includeAfternoon: !!editDraft.includeAfternoon,
      morningStart: editDraft.morningStart || '',
      morningEnd: editDraft.morningEnd || '',
      afternoonStart: editDraft.afternoonStart || '',
      afternoonEnd: editDraft.afternoonEnd || '',
    };
    try {
      await updateEntryFields(id, patch);
      cancelEdit();
    } catch (e) {
      console.error(e);
      alert('Echec de la sauvegarde');
    }
  };

  const exportCsv = () => {
    const headers = ['Jour','Agent','Projet','Notes','Espace','Statut','Matin','Après-midi'];
    const esc = (s: any) => {
      const t = (s ?? '').toString().replaceAll('"', '""');
      return `"${t}"`;
    };
    const lines = [headers.join(',')];
    visibleRows.forEach(r => {
      const agent = r.userDisplayName || r.userEmail || '';
      const espace = `${r.mission || ''}/${r.region || ''}`;
      const matin = `${r.includeMorning ? (r.morningStart || '') + '-' + (r.morningEnd || '') : ''}`;
      const am = `${r.includeAfternoon ? (r.afternoonStart || '') + '-' + (r.afternoonEnd || '') : ''}`;
      lines.push([
        esc(r.day), esc(agent), esc(r.project || ''), esc(r.notes || ''), esc(espace), esc(r.reviewStatus || ''), esc(matin), esc(am)
      ].join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checklists_${area || 'ALL'}_${period}_${view}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // helpers
  const totalHours = React.useMemo(() => {
    const toMin = (h: string | undefined) => {
      if (!h || !/^\d{2}:\d{2}$/.test(h)) return 0;
      const [H, M] = h.split(':').map(Number);
      return H * 60 + M;
    };
    let minutes = 0;
    visibleRows.forEach(r => {
      if (r.includeMorning) minutes += Math.max(0, toMin(r.morningEnd) - toMin(r.morningStart));
      if (r.includeAfternoon) minutes += Math.max(0, toMin(r.afternoonEnd) - toMin(r.afternoonStart));
    });
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
  }, [visibleRows]);

  const countFiltered = React.useMemo(() => {
    // compute counts for tabs using caches, applying area/period/agent filters
    const applyFilters = (src: Row[]) => {
  const mission = missionForArea(area);
      const prefix = `${period}-`;
      let base = src;
      if (mission) base = base.filter(r => ((r.mission || '').toUpperCase() === mission) || !r.mission);
      // Keep region permissive in counters as well to match visible list behavior
      base = base.filter(r => (r as any).period === period || (r.day || '').startsWith(prefix));
      if (selectedAgent !== '__ALL__') base = base.filter(r => (r.userDisplayName === selectedAgent) || (r.userEmail === selectedAgent));
      return base.length;
    };
    return {
      pending: applyFilters(rowsPendingCache),
      history: applyFilters(rowsHistoryCache),
    };
  }, [rowsPendingCache, rowsHistoryCache, area, period, selectedAgent]);

  // Count rejected in history after applying standard filters (without status filtering)
  const rejectedCount = React.useMemo(() => {
    const mission = missionForArea(area);
    const prefix = `${period}-`;
    let base = rowsHistoryCache;
    if (mission) base = base.filter(r => ((r.mission || '').toUpperCase() === mission) || !r.mission);
    base = base.filter(r => (r as any).period === period || (r.day || '').startsWith(prefix));
    if (selectedAgent !== '__ALL__') base = base.filter(r => (r.userDisplayName === selectedAgent) || (r.userEmail === selectedAgent));
    return base.filter(r => (r.reviewStatus || '').toLowerCase() === 'rejected').length;
  }, [rowsHistoryCache, area, period, selectedAgent]);

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) visibleRows.forEach(r => { next[r._docId] = true; });
    setSelected(next);
  };
  const toggleOne = (id: string, checked: boolean) => setSelected(s => ({ ...s, [id]: checked }));


  const scrollToBottom = () => {
    const el = listRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const monthLabel = React.useMemo(() => {
    try {
      const [y, m] = period.split('-').map(Number);
      const dt = new Date(y, m - 1, 1);
      return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } catch { return period; }
  }, [period]);

  return (
    <div className="space-y-5">
      {/* Header banner polished */}
      <div className={`rounded-2xl bg-gradient-to-br ${theme.header} ${theme.border} border p-5 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.25)]`}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-2xl font-semibold flex items-center gap-2">
            <Calendar className={`w-6 h-6 ${theme.accentIcon}`} /> Supervision des heures
          </div>
          <span className={`px-3 py-1 rounded-full text-xs ${theme.badge}`}>PERIODE {monthLabel.toUpperCase()}</span>
          <div className="flex-1" />
          <button onClick={exportCsv} className={`px-4 py-2 rounded-full ${theme.primaryBtn} text-white font-semibold inline-flex items-center gap-2 hover:brightness-110`}>
            <Download className="w-4 h-4" /> Exporter en CSV
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap text-sm">
          <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-white">
            <Calendar className="w-4 h-4" />
            <input aria-label="Période" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-transparent outline-none text-white" />
          </span>
          <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-white">
            <UserIcon className="w-4 h-4" />
            <select aria-label="Agent" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} className="outline-none bg-white text-black rounded px-2 py-1">
              {uniqueAgents.map(a => (
                <option key={a} value={a} style={{ color: '#000', backgroundColor: '#fff' }}>
                  {a==='__ALL__' ? 'Tous les agents' : a}
                </option>
              ))}
            </select>
          </span>
          <button onClick={() => setRefreshNonce(v => v + 1)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/15">
            <RefreshCw className="w-4 h-4" /> Rafraichir
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button onClick={() => setView('pending')} className={`px-3 py-1.5 rounded-full border ${view==='pending' ? `${theme.primaryBtn} text-white border-white/20` : 'bg-white/10 border-white/20 hover:bg-white/15'}`}>En cours ({countFiltered.pending})</button>
            <button onClick={() => setView('history')} className={`px-3 py-1.5 rounded-full border ${view==='history' ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}>Historique validé ({countFiltered.history})</button>
            {view === 'history' && (
              <button
                onClick={() => setShowRejected(v => !v)}
                className={`px-2 py-1 text-xs rounded-full border bg-white/10 border-white/20 hover:bg-white/15 whitespace-nowrap`}
              >
                {showRejected ? 'Cacher refusées' : `Afficher refusées (${rejectedCount})`}
              </button>
            )}
            <a
              href={`/dashboard/superviseur/${area || ''}/archives`}
              className="ml-2 px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-700/30 text-emerald-100 hover:brightness-110"
              title="Voir les archives"
            >
              ARCHIVES
            </a>
          </div>
        </div>
      </div>

      <div ref={listRef} className="bg-white/5 rounded-2xl border border-white/10 max-h-[70vh] overflow-x-auto relative scroll-beauty scroll-fade pr-2">
        <table className={`text-sm min-w-full`}> 
          <thead className="sticky top-0 z-10 backdrop-blur bg-black/20">
            <tr className="text-blue-200">
              <th className={`p-3 sticky left-0 z-20 bg-black/30 backdrop-blur` }><input type="checkbox" onChange={(e) => toggleAll((e.target as HTMLInputElement).checked)} checked={visibleRows.length>0 && visibleRows.every(r => selected[r._docId])} /></th>
              <th className={`text-left p-3`}>Jour</th>
              <th className={`text-left p-3`}>Agent</th>
              <th className={`text-left p-3`}>Matin</th>
              <th className={`text-left p-3`}>Après-midi</th>
              <th className={`text-left p-3`}>Opération</th>
              <th className={`text-left p-3`}>Brief</th>
              <th className={`text-left p-3`}>Durée</th>
              <th className={`text-left p-3`}>Statut</th>
              <th className={`text-left p-3`}>Espace</th>
              <th className={`text-left p-3 sticky right-0 z-20 bg-black/30 backdrop-blur`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-white/10 animate-pulse">
                  <td className={`p-3`} colSpan={11}>
                    <div className="h-4 bg-white/10 rounded w-full" />
                  </td>
                </tr>
              ))
            )}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-blue-100">
                    <div className="mx-auto w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-2">
                      <XCircle className="w-5 h-5" />
                    </div>
                    Aucune {view==='pending' ? 'demande en cours' : 'entrée dans l’historique'} pour la période {monthLabel.toUpperCase()}.
                    <div className="text-xs mt-1">Ajustez les filtres (période ou agent) ou revenez plus tard.</div>
                  </div>
                </td>
              </tr>
            )}
            {!loading && visibleRows.map((r) => {
              const isApproved = r.reviewStatus==='Approved' || r.reviewStatus==='approved';
              const isRejected = r.reviewStatus==='Rejected' || r.reviewStatus==='rejected';
              const statusBar = isApproved ? 'bg-emerald-500/70' : isRejected ? 'bg-red-500/70' : 'bg-yellow-500/70';
              return (
              <tr key={r._docId} className="border-t border-white/10 hover:bg-white/[0.04] transition-colors odd:bg-white/[0.02]">
                <td className={`p-3 text-center sticky left-0 z-10 bg-black/10 backdrop-blur` }>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-1.5 h-5 rounded-full ${statusBar}`} />
                    <input type="checkbox" checked={!!selected[r._docId]} onChange={(e) => toggleOne(r._docId, (e.target as HTMLInputElement).checked)} />
                  </div>
                </td>
                <td className={`p-3 whitespace-nowrap`}>{r.day || '—'}</td>
                <td className={`p-3`}>{r.userDisplayName || r.userEmail || '—'}</td>
                <td className={`p-3`}>
                  {editingId === r._docId ? (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={!!editDraft.includeMorning} onChange={(e) => setEditDraft((d) => ({ ...d, includeMorning: (e.target as HTMLInputElement).checked }))} />
                        <span>Oui</span>
                      </label>
                      <input type="time" value={editDraft.morningStart || ''} onChange={(e) => setEditDraft((d) => ({ ...d, morningStart: (e.target as HTMLInputElement).value }))} className="bg-white/5 border border-white/20 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                      <span className="text-blue-200/70">—</span>
                      <input type="time" value={editDraft.morningEnd || ''} onChange={(e) => setEditDraft((d) => ({ ...d, morningEnd: (e.target as HTMLInputElement).value }))} className="bg-white/5 border border-white/20 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                    </div>
                  ) : (
                    <span className="whitespace-nowrap">{r.includeMorning ? `${r.morningStart || ''} - ${r.morningEnd || ''}` : '—'}</span>
                  )}
                </td>
                <td className={`p-3`}>
                  {editingId === r._docId ? (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={!!editDraft.includeAfternoon} onChange={(e) => setEditDraft((d) => ({ ...d, includeAfternoon: (e.target as HTMLInputElement).checked }))} />
                        <span>Oui</span>
                      </label>
                      <input type="time" value={editDraft.afternoonStart || ''} onChange={(e) => setEditDraft((d) => ({ ...d, afternoonStart: (e.target as HTMLInputElement).value }))} className="bg-white/5 border border-white/20 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                      <span className="text-blue-200/70">—</span>
                      <input type="time" value={editDraft.afternoonEnd || ''} onChange={(e) => setEditDraft((d) => ({ ...d, afternoonEnd: (e.target as HTMLInputElement).value }))} className="bg-white/5 border border-white/20 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                    </div>
                  ) : (
                    <span className="whitespace-nowrap">{r.includeAfternoon ? `${r.afternoonStart || ''} - ${r.afternoonEnd || ''}` : '—'}</span>
                  )}
                </td>
                <td className={`p-3`}>
                  {editingId === r._docId ? (
                    <input value={editDraft.project || ''} onChange={(e) => setEditDraft((d) => ({ ...d, project: (e.target as HTMLInputElement).value }))} className="bg-white/5 border border-white/20 rounded-md px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                  ) : (r.project || '—')}
                </td>
                <td className={`p-3 max-w-[200px]`}>
                  {editingId === r._docId ? (
                    <input value={editDraft.notes || ''} onChange={(e) => setEditDraft((d) => ({ ...d, notes: (e.target as HTMLInputElement).value }))} className="bg-white/5 border border-white/20 rounded-md px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                  ) : (<span className="block truncate" title={r.notes || ''}>{r.notes || '—'}</span>)}
                </td>
                <td className={`p-3 whitespace-nowrap`}>
                  {(() => {
                    const toMin = (h: string | undefined) => {
                      if (!h || !/^\d{2}:\d{2}$/.test(h)) return 0;
                      const [H, M] = h.split(':').map(Number);
                      return H * 60 + M;
                    };
                    let minutes = 0;
                    if (r.includeMorning) minutes += Math.max(0, toMin(r.morningEnd) - toMin(r.morningStart));
                    if (r.includeAfternoon) minutes += Math.max(0, toMin(r.afternoonEnd) - toMin(r.afternoonStart));
                    const hh = String(Math.floor(minutes/60)).padStart(2,'0');
                    const mm = String(minutes % 60).padStart(2,'0');
                    return `${hh}h${mm}`;
                  })()}
                </td>
                <td className={`p-3`}>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${r.reviewStatus==='Pending' || r.reviewStatus==='pending' ? 'bg-yellow-500/15 text-yellow-100 border-yellow-500/30' : (r.reviewStatus==='Approved' || r.reviewStatus==='approved') ? 'bg-emerald-500/15 text-emerald-100 border-emerald-500/30' : 'bg-red-500/15 text-red-100 border-red-500/30'}`}>
                    {(r.reviewStatus==='Approved' || r.reviewStatus==='approved') ? <CheckCircle2 className="w-3 h-3" /> : (r.reviewStatus==='Rejected' || r.reviewStatus==='rejected') ? <XCircle className="w-3 h-3" /> : <ClockIcon className="w-3 h-3" />} {r.reviewStatus || '—'}
                  </span>
                </td>
                <td className={`p-3`}>{(r.mission || '—')}/{(r.region || '—')}</td>
                <td className={`p-3 sticky right-0 z-10 bg-black/10 backdrop-blur`}>
                  <div className="flex items-center gap-2">
                    {editingId === r._docId ? (
                      <>
                        <button onClick={() => commitEdit(r._docId)} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:brightness-105">Enregistrer</button>
                        <button onClick={cancelEdit} className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs font-semibold">Annuler</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => beginEdit(r)} className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs font-semibold">Modifier</button>
                        <button onClick={() => onApprove(r._docId)} className="px-3 py-1.5 rounded bg-emerald-500 text-white text-xs font-semibold hover:brightness-105">Valider</button>
                        <button onClick={() => onReject(r._docId)} className="px-3 py-1.5 rounded bg-red-500 text-white text-xs font-semibold hover:brightness-105">Refuser</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
        <div className="sticky bottom-3 right-3 ml-auto w-fit flex flex-col gap-2">
          <button onClick={() => listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-xs hover:bg-white/25"><ArrowUp className="w-4 h-4" /> Monter</button>
          <button onClick={scrollToBottom} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-xs hover:bg-white/25"><ArrowDown className="w-4 h-4" /> Descendre</button>
        </div>
      </div>
      {/* Footer summary */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center justify-between">
        <div className="text-blue-200 text-sm">{selectedAgent==='__ALL__' ? 'Tous les agents' : selectedAgent} · {period}</div>
        <div className="flex items-center gap-3">
          <div className="text-blue-200 text-sm">Total heures</div>
          <div className="text-emerald-300 font-bold">{totalHours}</div>
          {view==='history' && <span className="px-2 py-1 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-100 text-xs">Approuvé</span>}
        </div>
      </div>
      {error && <div className="text-red-300 text-sm">{error}</div>}
    </div>
  );
};

export default SupervisorChecklist;
