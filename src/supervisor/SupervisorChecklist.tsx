import React from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { collection, onSnapshot, query, where, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import { approveEntry, updateEntryFields, deleteEntry } from '../services/hoursService';
import { buildChecklistCsv } from './utils/checklistCsv';
import { useParams } from 'react-router-dom';
import { Calendar, Download, RefreshCw, User as UserIcon, CheckCircle2, XCircle, Clock as ClockIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { AgentSelect } from '../components/AgentSelect';
import './styles/supervisor-checklist-ux.css';

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
  supervisor?: string | null;
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
  const [showCustomSupervisor, setShowCustomSupervisor] = React.useState(false);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('__ALL__');
  const [showRejected, setShowRejected] = React.useState<boolean>(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

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

    const unsubs: Unsubscribe[] = [];
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

  // Build a suggestion list of supervisors from existing data (free-text still allowed)
  // Fixed supervisor list per user request
  const supervisorSuggestions = React.useMemo(() => [
    'Sabrina', 'Arthur', 'Ismael', 'Laetitia', 'Maurice', 'Samia'
  ], []);

  // Build stats per agent (period + mission filtered, but before agent self-filter)
  const agentStats = React.useMemo(() => {
    const mission = missionForArea(area);
    const prefix = `${period}-`;
    const stats: Record<string, { total: number; pending: number; approved: number; rejected: number }> = {};
    const source = [...rowsPendingCache, ...rowsHistoryCache];
    source.forEach(r => {
      if (mission && !(((r.mission || '').toUpperCase() === mission) || !r.mission)) return;
      if (!((r as any).period === period || (r.day || '').startsWith(prefix))) return;
      const name = r.userDisplayName || r.userEmail || '__UNKNOWN__';
      if (!stats[name]) stats[name] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      stats[name].total++;
      const st = (r.reviewStatus || '').toLowerCase();
      if (st === 'pending') stats[name].pending++;
      else if (st === 'approved') stats[name].approved++;
      else if (st === 'rejected') stats[name].rejected++;
    });
    // Add ALL synthetic
    let allPending = 0, allApproved = 0, allRejected = 0, allTotal = 0;
    Object.values(stats).forEach(s => { allPending += s.pending; allApproved += s.approved; allRejected += s.rejected; allTotal += s.total; });
    stats['__ALL__'] = { total: allTotal, pending: allPending, approved: allApproved, rejected: allRejected };
    return stats;
  }, [rowsPendingCache, rowsHistoryCache, area, period]);

  const onApprove = async (id: string) => {
    try { await approveEntry(id); } catch (e) { console.error(e); }
  };
  const onDelete = async (id: string) => {
    try {
      const ok = confirm('Supprimer définitivement cette checklist ?');
      if (!ok) return;
      await deleteEntry(id);
    } catch (e) { console.error(e); }
  };

  // batch actions for selection toolbar
  const approveSelected = async () => {
    const ids = Object.entries(selected).filter(([,v]) => v).map(([k]) => k);
    for (const id of ids) {
      try { await approveEntry(id); } catch (e) { console.error(e); }
    }
  };
  const deleteSelected = async () => {
    const ids = Object.entries(selected).filter(([,v]) => v).map(([k]) => k);
    if (ids.length === 0) return;
    const ok = confirm(`Supprimer définitivement ${ids.length} checklist(s) ?`);
    if (!ok) return;
    for (const id of ids) {
      try { await deleteEntry(id); } catch (e) { console.error(e); }
    }
    setSelected({});
  };

  const beginEdit = (r: Row) => {
    setEditingId(r._docId);
    setEditDraft({
      project: r.project || '',
      notes: r.notes || '',
      supervisor: r.supervisor || '',
      includeMorning: !!r.includeMorning,
      includeAfternoon: !!r.includeAfternoon,
      morningStart: r.morningStart || '',
      morningEnd: r.morningEnd || '',
      afternoonStart: r.afternoonStart || '',
      afternoonEnd: r.afternoonEnd || '',
    });
    // If current supervisor is not in suggestions and not empty, show custom input
    const sv = (r.supervisor || '').trim();
    setShowCustomSupervisor(!!sv && !supervisorSuggestions.includes(sv));
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };
  const commitEdit = async (id: string) => {
    const patch: any = {
      project: (editDraft.project ?? '').toString(),
      includeMorning: !!editDraft.includeMorning,
      includeAfternoon: !!editDraft.includeAfternoon,
      morningStart: editDraft.morningStart || '',
      morningEnd: editDraft.morningEnd || '',
      afternoonStart: editDraft.afternoonStart || '',
      afternoonEnd: editDraft.afternoonEnd || '',
      supervisor: (editDraft as any).supervisor ?? '',
    };
    const trimmedNotes = (editDraft.notes ?? '').toString().trim();
    if (trimmedNotes.length > 0) patch.notes = trimmedNotes; // Avoid passing undefined to Firestore
    try {
      await updateEntryFields(id, patch);
      cancelEdit();
    } catch (e) {
      console.error(e);
      alert('Echec de la sauvegarde');
    }
  };

  const exportCsv = () => {
    const data = visibleRows.map((r) => ({
      date: r.day,
      agentName: r.userDisplayName || r.userEmail || '',
      agentEmail: r.userEmail || undefined,
      supervisor: r.supervisor || '',
      morningStart: r.includeMorning ? r.morningStart : '',
      morningEnd: r.includeMorning ? r.morningEnd : '',
      afternoonStart: r.includeAfternoon ? r.afternoonStart : '',
      afternoonEnd: r.includeAfternoon ? r.afternoonEnd : '',
      includeMorning: !!r.includeMorning,
      includeAfternoon: !!r.includeAfternoon,
      project: r.project || '',
      notes: r.notes || '',
      mission: r.mission || '',
      region: r.region || '',
      status: r.reviewStatus || (view === 'pending' ? 'pending' : 'approved'),
    }));

    const HEADERS = [
      'Adresse de messagerie','Nom','JOURNEE','Superviseur',
      'Prise de poste MATIN :','Fin de poste MATIN :','Prise de poste APRES MIDI :','Fin de poste APRES MIDI :',
      'PROD','BRIEF','TOTAL HEURES JOURNEE','OPERATION','CHECK','SEMAINE','MOIS'
    ];

    const { csv, filename } = buildChecklistCsv(data, period, {
      filenameBase: `checklists_${area || 'ALL'}_${period}_${view}_detail`,
      includeTotalMinutesColumn: false,
      customSchema: {
        headers: HEADERS,
        secondHeader: [
          'NOM PRENOM', 'Identifiant HERMES', '01/09/2025', 'Julien',
          '09:00', '13:00', '14:00', '17:00',
          '6', '1', '7', 'ORANGE CANAL 210', '', '36', '9'
        ],
        mapRow: (norm) => {
          // Compute week and month from date dd/mm/yyyy
          const [dd, mm, yyyy] = norm.date.split('/').map((x) => parseInt(x, 10));
          const jsDate = new Date(yyyy, mm - 1, dd);
          const week = (() => {
            const d = new Date(Date.UTC(jsDate.getFullYear(), jsDate.getMonth(), jsDate.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
            return String(weekNo);
          })();
          const month = String(jsDate.getMonth() + 1);

          // Split morning/afternoon ranges back to start/end
          const [mStart, mEnd] = norm.morning ? norm.morning.split('->').map(s => s.trim()) : ['', ''];
          const [aStart, aEnd] = norm.afternoon ? norm.afternoon.split('->').map(s => s.trim()) : ['', ''];

          // PROD: decimal hours FR; TOTAL HEURES JOURNEE: same total for now
          const prod = norm.durationDecFR;
          const total = norm.durationDecFR;

          return {
            'Adresse de messagerie': norm.agent,
            'Nom': norm.agentEmail || norm.agent,
            'JOURNEE': norm.date,
            'Superviseur': norm.supervisor || '',
            'Prise de poste MATIN :': mStart || '',
            'Fin de poste MATIN :': mEnd || '',
            'Prise de poste APRES MIDI :': aStart || '',
            'Fin de poste APRES MIDI :': aEnd || '',
            'PROD': prod,
            'BRIEF': norm.brief,
            'TOTAL HEURES JOURNEE': total,
            'OPERATION': norm.project === 'CANAL 210' ? 'ORANGE CANAL 210' : norm.project,
            'CHECK': 'OK',
            'SEMAINE': week,
            'MOIS': month,
          };
        }
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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


  // Removed scroll controls (Monter/Descendre) on request

  const monthLabel = React.useMemo(() => {
    try {
      const [y, m] = period.split('-').map(Number);
      const dt = new Date(y, m - 1, 1);
      return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } catch { return period; }
  }, [period]);

  // Timeline segment component for expanded detail view
  const BarSeg: React.FC<{ start?: string; end?: string; color: string }> = ({ start, end, color }) => {
    const toMin = (h?: string) => {
      if (!h || !/^\d{2}:\d{2}$/.test(h)) return null;
      const [H, M] = h.split(':').map(Number);
      return H * 60 + M;
    };
    const s = toMin(start); const e = toMin(end);
    if (s == null || e == null || e <= s) return null;
    // schedule window 08:00 (480) to 20:00 (1200) for relative scaling
    const minWindow = 8 * 60; const maxWindow = 20 * 60; const span = maxWindow - minWindow;
    const pctStart = Math.max(0, Math.min(100, ((s - minWindow) / span) * 100));
    const pctEnd = Math.max(0, Math.min(100, ((e - minWindow) / span) * 100));
    const pctWidth = pctEnd - pctStart;
    return <div style={{ left: pctStart + '%', width: Math.max(2, pctWidth) + '%', backgroundColor: color }} className="absolute inset-y-0 rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,.15),0_4px_12px_-2px_rgba(0,0,0,.4)] transition-all" />;
  };

  // Framer Motion scroll-based transforms (parallax + dynamic gradient shift)
  const { scrollYProgress } = useScroll();
  const headerY = useTransform(scrollYProgress, [0, 0.4], [0, -40]);
  const headerBgOpacity = useTransform(scrollYProgress, [0, 0.4], [0.85, 0.65]);
  const headerGlow = useTransform(scrollYProgress, [0, 1], [0.35, 0]);
  const dynamicGradient = useTransform(scrollYProgress, [0, 0.6], [
    'linear-gradient(135deg,rgba(12,22,40,1),rgba(16,185,129,0.15))',
    'linear-gradient(135deg,rgba(12,22,40,0.9),rgba(16,185,129,0.35))'
  ]);

  // Animation variants for rows
  const rowVariants = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 70, damping: 14 } }
  } as const;

  return (
    <div className="space-y-5">
      {/* Header banner polished with parallax & animated gradient */}
      <motion.div
        style={{ y: headerY, backgroundImage: dynamicGradient, boxShadow: headerGlow.get() ? `0 0 0 0 rgba(16,185,129,${headerGlow.get()}), 0 10px 30px -10px rgba(16,185,129,0.25)` : undefined, opacity: headerBgOpacity }}
        className={`rounded-2xl relative overflow-hidden ${theme.border} border p-5 anim-fade`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            aria-hidden
            style={{ opacity: headerGlow, scale: headerBgOpacity }}
            className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-emerald-400/10 blur-3xl"
          />
          <motion.div
            aria-hidden
            style={{ opacity: headerGlow }}
            className="absolute bottom-0 right-0 w-72 h-72 bg-gradient-to-tr from-emerald-500/10 via-transparent to-transparent blur-2xl"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-2xl font-semibold flex items-center gap-2">
            <Calendar className={`w-6 h-6 ${theme.accentIcon}`} /> Supervision des heures
          </div>
          <span className={`px-3 py-1 rounded-full text-xs ${theme.badge} badge-pulse`}>PERIODE {monthLabel.toUpperCase()}</span>
          <div className="flex-1" />
          <button onClick={exportCsv} className={`btn-primary-gradient inline-flex items-center gap-2`} title="Exporter la vue filtrée en CSV">
            <Download className="w-4 h-4" /> Exporter en CSV
          </button>
        </div>
        {/* Barre de statistiques et filtres améliorée */}
        <div className="mt-4 grid gap-3 w-full text-xs sm:text-sm md:grid-cols-[auto_auto_1fr_auto] items-start">
          {/* Stats */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-white/10 text-white" title="Entrées visibles après filtres">
              <ClockIcon className="w-4 h-4" /> {visibleRows.length} entrée(s)
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-100" title="Entrées à valider">
              <CheckCircle2 className="w-4 h-4" /> {countFiltered.pending} en cours
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-100" title="Entrées validées">
              <Calendar className="w-4 h-4" /> {countFiltered.history - rejectedCount} validées
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-200" title="Entrées refusées du mois">
              <XCircle className="w-4 h-4" /> {rejectedCount} refusées
            </span>
            <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded bg-gradient-to-r from-white/5 to-white/10 border border-white/10 text-white" title="Somme (heures) des entrées visibles">
              <ClockIcon className="w-4 h-4" /> {totalHours}
            </span>
          </div>
          {/* Filtres */}
          <div className="flex items-center gap-2 flex-wrap col-span-2 md:col-span-1">
            <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 text-white">
              <Calendar className="w-4 h-4" />
              <input aria-label="Période" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-transparent outline-none text-white" />
            </span>
            <span className="inline-flex items-center gap-2 px-2 py-[3px] rounded bg-white/5 border border-white/10 text-white">
              <UserIcon className="w-4 h-4" />
              <AgentSelect
                agents={uniqueAgents}
                value={selectedAgent}
                onChange={setSelectedAgent}
                stats={agentStats}
                className=""
              />
            </span>
            <button onClick={() => setRefreshNonce(v => v + 1)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/15" title="Recharger les données Firestore">
              <RefreshCw className="w-4 h-4" /> Rafraîchir
            </button>
          </div>
          {/* Onglets */}
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <button onClick={() => setView('pending')} className={`px-3 py-1.5 rounded-full border text-xs md:text-sm transition ${view==='pending' ? `${theme.primaryBtn} text-white border-white/20 shadow` : 'bg-white/10 border-white/20 hover:bg-white/15'}`}>En cours ({countFiltered.pending})</button>
            <button onClick={() => setView('history')} className={`px-3 py-1.5 rounded-full border text-xs md:text-sm transition ${view==='history' ? 'bg-white/20 border-white/40 shadow-inner' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}>Historique validé ({countFiltered.history - rejectedCount})</button>
            {view === 'history' && (
              <button
                onClick={() => setShowRejected(v => !v)}
                className={`px-2 py-1 text-xs rounded-full border ${showRejected ? 'bg-red-500/25 border-red-400/40 text-red-100' : 'bg-white/10 border-white/20 hover:bg-white/15'} whitespace-nowrap transition`}
                title={showRejected ? 'Masquer les entrées refusées' : 'Afficher les entrées refusées'}
              >
                {showRejected ? 'Cacher refusées' : `Afficher refusées (${rejectedCount})`}
              </button>
            )}
            <a
              href={`/dashboard/superviseur/${area || ''}/archives`}
              className="px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-700/30 text-emerald-100 hover:brightness-110 text-xs md:text-sm"
              title="Voir les archives des mois précédents"
            >
              ARCHIVES
            </a>
          </div>
        </div>
  </motion.div>

      <div ref={listRef} className="bg-white/5 rounded-2xl border border-white/10 max-h-[70vh] overflow-x-auto relative scroll-beauty scroll-fade pr-2 anim-fade">
        <table className={`text-sm min-w-full`}> 
          <thead className="sticky top-0 z-10 backdrop-blur bg-black/20">
            <tr className="text-blue-200">
              <th className={`p-3 sticky left-0 z-20 bg-black/30 backdrop-blur` }><input type="checkbox" onChange={(e) => toggleAll((e.target as HTMLInputElement).checked)} checked={visibleRows.length>0 && visibleRows.every(r => selected[r._docId])} /></th>
              <th className={`text-left p-3`}>Jour</th>
              <th className={`text-left p-3`}>Agent</th>
              <th className={`text-left p-3`}>Matin</th>
              <th className={`text-left p-3`}>Après-midi</th>
              <th className={`text-left p-3`}>Opération</th>
              <th className={`text-left p-3`}>Superviseur</th>
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
                <tr key={i} className="border-t border-white/10">
                  <td className={`p-3`} colSpan={12}>
                    <div className="shimmer-line" />
                  </td>
                </tr>
              ))
            )}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6">
                  <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.03] p-8 text-center text-blue-100 anim-pop">
                    <div className="mx-auto w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
                      <XCircle className="w-6 h-6" />
                    </div>
                    <div className="font-semibold mb-1">Aucune {view==='pending' ? 'demande en cours' : 'entrée dans l’historique'} pour {monthLabel.toUpperCase()}</div>
                    <div className="text-xs opacity-80">Ajustez les filtres (période ou agent) ou revenez plus tard.</div>
                  </div>
                </td>
              </tr>
            )}
            {!loading && visibleRows.map((r, idx) => {
              const isApproved = r.reviewStatus==='Approved' || r.reviewStatus==='approved';
              const isRejected = r.reviewStatus==='Rejected' || r.reviewStatus==='rejected';
              const statusBar = isApproved ? 'bg-emerald-500/70' : isRejected ? 'bg-red-500/70' : 'bg-yellow-500/70';
              return (
              <React.Fragment key={r._docId}>
              <motion.tr
                  variants={rowVariants}
                  initial="hidden"
                  animate="show"
                  layout
                  className="group border-t border-white/10 hover:bg-white/[0.05] transition-colors odd:bg-white/[0.02]"
                  style={{ animationDelay: `${Math.min(idx*30, 240)}ms` }}
              >
                <td className={`p-3 text-center sticky left-0 z-10 bg-black/10 backdrop-blur` }>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-1.5 h-5 rounded-full ${statusBar}`} />
                    <input type="checkbox" checked={!!selected[r._docId]} onChange={(e) => toggleOne(r._docId, (e.target as HTMLInputElement).checked)} />
                  </div>
                </td>
                <td className={`p-3 whitespace-nowrap`}>
                  <button onClick={() => setExpandedId(expandedId===r._docId?null:r._docId)} className="inline-flex items-center gap-1 hover:underline">
                    {expandedId===r._docId ? <ChevronDown className="w-4 h-4 opacity-75"/> : <ChevronRight className="w-4 h-4 opacity-75"/>}
                    <span>{r.day || '—'}</span>
                  </button>
                </td>
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
                    (() => {
                      const OPTIONS = ['Canal 214','Canal 210','Canal 211'];
                      // If current value isn't in the list, include it as first option
                      const current = (editDraft.project || '').toString();
                      const list = OPTIONS.includes(current) ? OPTIONS : [current, ...OPTIONS];
                      return (
                        <select
                          value={current}
                          onChange={(e) => setEditDraft(d => ({ ...d, project: (e.target as HTMLSelectElement).value }))}
                          className="bg-slate-900 text-blue-100 border border-white/20 rounded-md px-2 py-1 w-52 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 shadow-sm"
                          style={{backgroundColor:'#101828'}} // fallback for dark
                        >
                          {list.filter(Boolean).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      );
                    })()
                  ) : (r.project || '—')}
                </td>
                <td className={`p-3`}>
                  {editingId === r._docId ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={(!showCustomSupervisor && (editDraft as any).supervisor) || ''}
                        onChange={(e) => {
                          const v = (e.target as HTMLSelectElement).value;
                          if (v === '__OTHER__') { setShowCustomSupervisor(true); setEditDraft(d => ({ ...d, supervisor: '' })); }
                          else { setShowCustomSupervisor(false); setEditDraft(d => ({ ...d, supervisor: v })); }
                        }}
                        className="bg-slate-900 text-blue-100 border border-white/20 rounded-md px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 shadow-sm"
                        style={{backgroundColor:'#101828'}} // fallback for dark
                      >
                        <option value="">— Choisir un superviseur —</option>
                        {supervisorSuggestions.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="__OTHER__">Autre…</option>
                      </select>
                      {showCustomSupervisor && (
                        <input
                          value={(editDraft as any).supervisor || ''}
                          onChange={(e) => setEditDraft(d => ({ ...d, supervisor: (e.target as HTMLInputElement).value }))}
                          placeholder="Nom superviseur"
                          className="bg-slate-900 text-blue-100 border border-white/20 rounded-md px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 shadow-sm"
                          style={{backgroundColor:'#101828'}} // fallback for dark
                        />
                      )}
                    </div>
                  ) : (r.supervisor || '—')}
                </td>
                <td className={`p-3 max-w-[320px]`}>
                  {editingId === r._docId ? (
                    <textarea
                      value={editDraft.notes || ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, notes: (e.target as HTMLTextAreaElement).value }))}
                      className="bg-white/5 border border-white/20 rounded-md px-2 py-2 w-full h-24 min-h-[6rem] resize-vertical focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                    />
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
                        <button onClick={() => commitEdit(r._docId)} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:brightness-105 glow-focus">Enregistrer</button>
                        <button onClick={cancelEdit} className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs font-semibold">Annuler</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => beginEdit(r)} className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs font-semibold">Modifier</button>
                        <button onClick={() => onApprove(r._docId)} className="px-3 py-1.5 rounded bg-emerald-500 text-white text-xs font-semibold hover:brightness-105 glow-focus">Valider</button>
                        <button onClick={() => onDelete(r._docId)} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:brightness-110">Supprimer</button>
                      </>
                    )}
                  </div>
                </td>
              </motion.tr>
              <AnimatePresence>
              {expandedId===r._docId && (
                <motion.tr
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="detail-row"
                >
                  <td colSpan={12} className="p-0">
                    <div className="px-6 py-4 bg-white/[0.05] border-t border-white/10 anim-collapse">
                      <div className="flex flex-wrap items-start gap-6">
                        <div className="min-w-[240px]">
                          <div className="text-xs text-blue-200/70 mb-1">Note</div>
                          <div className="text-sm text-blue-100 whitespace-pre-wrap">{r.notes || '—'}</div>
                        </div>
                        <div className="flex-1 min-w-[260px]">
                          <div className="text-xs text-blue-200/70 mb-1">Timeline</div>
                          <div className="h-8 rounded-md bg-black/20 border border-white/10 overflow-hidden relative">
                            {r.includeMorning && (
                              <BarSeg start={r.morningStart} end={r.morningEnd} color="rgba(59,130,246,.7)" />
                            )}
                            {r.includeAfternoon && (
                              <BarSeg start={r.afternoonStart} end={r.afternoonEnd} color="rgba(16,185,129,.7)" />
                            )}
                            <div className="absolute inset-0 pointer-events-none grid grid-cols-8 opacity-20">
                              {Array.from({length:8}).map((_,i)=> <div key={i} className="border-l border-white/10" />)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-auto text-xs">
                          <button onClick={() => setExpandedId(null)} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 hover:bg-white/15 transition-colors">Fermer</button>
                        </div>
                      </div>
                    </div>
                  </td>
                </motion.tr>
              )}
              </AnimatePresence>
              </React.Fragment>
            );})}
          </tbody>
        </table>
        {/* selection toolbar */}
        {Object.values(selected).some(Boolean) && (
          <div className="selection-toolbar anim-slide-up">
            <div className="flex items-center gap-3">
              <span className="text-xs opacity-80">{Object.values(selected).filter(Boolean).length} sélectionné(s)</span>
              <button onClick={approveSelected} className="px-3 py-1.5 rounded bg-emerald-500 text-white text-xs font-semibold hover:brightness-105 glow-focus">Valider</button>
              <button onClick={deleteSelected} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:brightness-110">Supprimer</button>
              <button onClick={() => setSelected({})} className="px-3 py-1.5 rounded bg-white/10 border border-white/20 text-xs">Effacer</button>
            </div>
          </div>
        )}

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
