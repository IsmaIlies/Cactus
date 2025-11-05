import { ChangeEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ReviewBadge } from '../modules/checklist/components/ReviewBadge';

import StatusBadge from '../modules/checklist/components/StatusBadge';

import { EntryReviewStatus, PROJECT_OPTIONS, ProjectOption, Status, STATUS_LABELS } from '../modules/checklist/lib/constants';

import { DayEntry, StoredAgentState, hydrateEntry, loadAgentFromStorage, persistAgentState } from '../modules/checklist/lib/storage';
import Sidebar from '../components/Sidebar';

import { computeWorkedMinutes, formatDayLabel, formatHours, formatMonthLabel, sortIsoDatesAscending } from '../modules/checklist/lib/time';

import '../modules/checklist/styles/base.css';
import '../modules/checklist/styles/select-operation-fix.css';
import '../modules/checklist/styles/modern-theme.css';
import '../modules/checklist/styles/agent-delight.css';
import ChecklistTopHeader from '../modules/checklist/components/ChecklistTopHeader';

import { subscribeEntriesByUser, upsertAgentEntry, submitAgentHours, deleteEntry as deleteRemoteEntry, getEntryDocIdFor } from '../services/hoursService';

import { useAuth } from '../contexts/AuthContext';

function cloneState(state: StoredAgentState): StoredAgentState {

  return { ...state, entries: state.entries.map((e) => ({ ...e })) };

}

type ChecklistProps = {
  themeClass?: string; // e.g. 'checklist-modern' (default) or 'leads-modern'
  tableOnly?: boolean; // when true, hides header, toolbar, footer, and sidebar, keeping only the table
};

export default function ChecklistPage({ themeClass = 'checklist-modern', tableOnly = false }: ChecklistProps) {

  const { user } = useAuth();

  const [agentState, setAgentState] = useState(loadAgentFromStorage);

  const [remoteEntries, setRemoteEntries] = useState<DayEntry[]>([]);
  // Lightweight toast for quick feedback on actions (submit, errors, etc.)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const remoteIds = useMemo(() => new Set(remoteEntries.map((e) => e.id)), [remoteEntries]);

  const todayIsoStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Memorization keys for faster data entry
  const LAST_PROJECT_KEY = 'checklist:lastProject';
  const LAST_SUPERVISOR_KEY = 'checklist:lastSupervisor';

  // Delete confirmation + undo state
  const [pendingDelete, setPendingDelete] = useState<DayEntry | null>(null);
  const [undoInfo, setUndoInfo] = useState<{ entry: DayEntry; timeoutId: number } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const updateState = useCallback((mutator: (draft: StoredAgentState) => StoredAgentState) => {

    setAgentState((current) => {

      const draft = cloneState(current);

      const next = mutator(draft);

      persistAgentState(next);

      return next;

    });

  }, []);

  // Fusionne remote + local pour robustesse hors-ligne, en évitant les doublons
  // Règles:
  // - Les entrées Firestore sont la source de vérité (toujours incluses)
  // - On masque toutes les entrées locales dont l'id existe déjà en remote
  // - On masque également toute entrée locale d'un jour qui existe déjà en remote (peu importe le statut)
  //   -> Cela évite la "réapparition" d'une locale "Soumise" quand une version distante existe (y compris validée)
  const mergedEntries = useMemo(() => {
    // Source de vérité: distantes
    const result: DayEntry[] = [...remoteEntries];
    const daysWithRemote = new Set<string>(remoteEntries.map((e) => e.day));

    for (const e of agentState.entries) {
      // Si un doc distant a le même id, ignorer la locale
      if (remoteIds.has(e.id)) continue;
      // Si un doc distant existe pour ce jour, on masque uniquement les locales non-brouillon (pour éviter la réapparition)
      // mais on laisse les nouveaux brouillons visibles pour permettre plusieurs entrées le même jour.
      if (daysWithRemote.has(e.day) && e.status !== Status.Draft) continue;
      result.push(e);
    }

    return result;
  }, [remoteEntries, remoteIds, agentState.entries]);

  const sortedEntries = useMemo(() => [...mergedEntries].sort((a, b) => sortIsoDatesAscending(a.day, b.day)), [mergedEntries]);

  // N'affiche pas les entrées refusées (reviewStatus: 'rejected' OU status: 'rejected') dans la vue agent
  const visibleEntries = useMemo(
    () => sortedEntries.filter(
      (e) =>
        e.reviewStatus !== EntryReviewStatus.Approved &&
        e.reviewStatus !== EntryReviewStatus.Rejected &&
  (e.status !== Status.Rejected)
    ),
    [sortedEntries]
  );

  const totalMinutesPeriod = useMemo(() => visibleEntries.reduce((acc, e) => acc + computeWorkedMinutes(e), 0), [visibleEntries]);

  const hasSubmittedEntries = useMemo(() => agentState.entries.some((e) => e.status === Status.Submitted), [agentState.entries]);

  const onPeriodChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {

    const p = event.target.value;

    if (!p) return;

    const loaded = loadAgentFromStorage(p);

    loaded.period = p;

    persistAgentState(loaded);

    setAgentState(cloneState(loaded));

  }, []);

  useEffect(() => {

    if (!user?.id) return;

  const unsub = subscribeEntriesByUser(user.id, agentState.period, (list) => {

      // reflect entries into UI, but we still keep localStorage for offline capability

      // 1) Répercute les entrées distantes dans l'UI
      setRemoteEntries(list.map((e) => ({
        id: e.id,
        day: e.day,
        includeMorning: e.includeMorning,
        includeAfternoon: e.includeAfternoon,
        morningStart: e.morningStart,
        morningEnd: e.morningEnd,
        afternoonStart: e.afternoonStart,
        afternoonEnd: e.afternoonEnd,
        project: e.project,
        notes: e.notes,
        status: e.status,
        reviewStatus: (('' + (e as any).reviewStatus).toLowerCase() === 'approved' ? EntryReviewStatus.Approved :
                       (('' + (e as any).reviewStatus).toLowerCase() === 'rejected' ? EntryReviewStatus.Rejected : EntryReviewStatus.Pending)),
        hasDispute: (e as any).hasDispute,
        supervisor: (e as any).supervisor || '',
      })));

      // 2) Nettoyage passif du localStorage: si un jour est validé à distance,
      // on retire les entrées locales de ce même jour pour éviter toute réapparition ultérieure
      try {
        const approvedDays = new Set(
          list
            .filter((e) => ('' + (e as any).reviewStatus).toLowerCase() === 'approved')
            .map((e) => e.day)
        );
        if (approvedDays.size > 0) {
          updateState((draft) => {
            // Ne nettoie pas les brouillons: autorise l'ajout d'une nouvelle entrée sur un jour déjà validé
            const nextEntries = draft.entries.filter((e) => !(approvedDays.has(e.day) && e.status !== Status.Draft));
            if (nextEntries.length === draft.entries.length) return draft; // no-op
            return { ...draft, entries: nextEntries };
          });
        }
      } catch {}

    });

    return () => unsub();

  }, [agentState.period, user?.id]);

  // Background sync: when authenticated, mirror any local entries missing remotely
  useEffect(() => {
    if (!user?.id) return;
    if (!agentState?.entries?.length) return;
    const unsynced = agentState.entries.filter((e) => !remoteIds.has(e.id));
    if (unsynced.length === 0) return;
    (async () => {
      for (const e of unsynced) {
        try {
          await upsertAgentEntry(
            user.id,
            agentState.period,
            e,
            { userDisplayName: (user as any).displayName ?? null, userEmail: (user as any).email ?? null }
          );
        } catch (err) {
          if (localStorage.getItem('hoursDebug') === '1') {
            console.warn('[hours] background upsert failed', { id: e.id, day: e.day }, err);
          }
        }
      }
    })();
  }, [agentState.entries, agentState.period, remoteIds, user?.id]);

  const changeEntryField = useCallback(<K extends keyof DayEntry>(id: string, field: K, value: DayEntry[K]) => {

    updateState((draft) => {

      const entries = draft.entries.map((e) => (e.id === id ? { ...e, [field]: value } : e));

      const nextStatus = draft.status === Status.Approved ? Status.Draft : draft.status;

      return { ...draft, entries, status: nextStatus };

    });

    // Remember last chosen values for future entries
    try {
      if (field === 'project') {
        localStorage.setItem(LAST_PROJECT_KEY, String(value));
      } else if (field === 'supervisor') {
        localStorage.setItem(LAST_SUPERVISOR_KEY, String(value ?? ''));
      }
    } catch {}

  }, [updateState, agentState.period, user?.id]);

  const toggleSession = useCallback((id: string, session: 'includeMorning' | 'includeAfternoon', enabled: boolean) => {

    changeEntryField(id, session as any, enabled as any);

  }, [changeEntryField]);



  // legacy deletion replaced by requestDeleteEntry + confirmDeleteEntry + undoDelete

  const submitEntry = useCallback(async (entry: DayEntry) => {

    // Persist locally

    updateState((draft) => {
      const updated: DayEntry[] = draft.entries.map((it) =>
        it.id === entry.id
          ? { ...it, status: Status.Submitted, reviewStatus: EntryReviewStatus.Pending, supervisor: entry.supervisor }
          : it
      );
      return {
        ...draft,
        status: Status.Submitted,
        rejectionNote: draft.status === Status.Rejected ? draft.rejectionNote : null,
        entries: updated,
      };
    });

    // Mirror to Firestore for admin supervision (let submitAgentHours handle auth check)
    try {
      await submitAgentHours({
        entryId: entry.id,
        day: entry.day,
        includeMorning: entry.includeMorning,
        includeAfternoon: entry.includeAfternoon,
        morningStart: entry.morningStart,
        morningEnd: entry.morningEnd,
        afternoonStart: entry.afternoonStart,
        afternoonEnd: entry.afternoonEnd,
        project: entry.project,
        notes: entry.notes || undefined,
        hasDispute: !!entry.hasDispute,
        supervisor: entry.supervisor || '',
      });
      setToast({ type: 'success', message: 'Checklist envoyée à la supervision.' });
    } catch (_e) {
      if (localStorage.getItem('hoursDebug') === '1') {
        console.warn('[hours] remote submit failed, kept local-only', _e);
      }
      setToast({ type: 'error', message: "Échec de l'envoi. Conservée en local, réessayez plus tard." });
    }

  }, [agentState.period, updateState, user?.id]);

  // Ajoute une nouvelle case (entrée) pour le même jour, vide, pour permettre plusieurs checklists sur le même jour

  // Ajoute une nouvelle case (entrée) pour le même jour, avec un id unique, pour permettre plusieurs checklists distinctes sur le même jour

  // Duplique la checklist complète (sessions, horaires, projet, notes, etc.) pour le même jour, avec un nouvel id unique

  // duplicateEntryOperation removed (button 'Ajouter' disabled in UI)

  const addDay = useCallback(async () => {

    let createdEntry: DayEntry | null = null;

    updateState((draft) => {

      // Toujours ajouter une nouvelle entrée pour la date du jour, même si elle existe déj�

      const today = new Date();

      const periodPrefix = `${draft.period}-`;

      const todayIso = today.toISOString().slice(0, 10);

      const baseDay = todayIso.startsWith(periodPrefix) ? todayIso : `${draft.period}-01`;

      // Générer un id unique même si la date existe déj�

      const uniqueId = baseDay + '_' + Date.now();

      // Try to reuse last chosen project/supervisor if available
      const lastProjectRaw = (() => { try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; } })();
      const lastSupervisor = (() => { try { return localStorage.getItem(LAST_SUPERVISOR_KEY) || ''; } catch { return ''; } })();
      const lastProject = (lastProjectRaw && (PROJECT_OPTIONS as ReadonlyArray<string>).includes(lastProjectRaw))
        ? (lastProjectRaw as ProjectOption)
        : 'CANAL 211';

      const newEntry = hydrateEntry({

        id: uniqueId,

        day: baseDay,

  status: Status.Draft,

        reviewStatus: EntryReviewStatus.Pending,

        includeMorning: true,

        includeAfternoon: true,

        morningStart: '10:00',

        morningEnd: '13:00',

        afternoonStart: '15:00',

        afternoonEnd: '19:00',

        project: lastProject,
        supervisor: lastSupervisor || '',

        notes: '',

      });

      createdEntry = newEntry;

      return { ...draft, entries: [...draft.entries, newEntry], status: Status.Draft };

    });

    // Mirror the new draft to Firestore so it appears when using remoteEntries source

    try {

      if (user?.id && createdEntry) {

        const c = createdEntry as DayEntry;

        await upsertAgentEntry(

          user.id,

          agentState.period,

          { ...c, status: Status.Draft, reviewStatus: EntryReviewStatus.Pending },

          { userDisplayName: (user as any).displayName ?? null, userEmail: (user as any).email ?? null }

        );

      }

    } catch (e) {

      console.warn('Failed to mirror draft to Firestore', e);

    }

  }, [updateState]);

  const resetEntries = useCallback(async () => {
    const confirmed = window.confirm('Etes-vous sur de vouloir reinitialiser toutes les entrees ?');
    if (!confirmed) return;
    const entriesToRemove = agentState.entries;
    updateState((draft) => ({ ...draft, status: Status.Draft, rejectionNote: null, entries: [] }));
    if (user?.id && entriesToRemove.length > 0) {
      try {
        await Promise.all(entriesToRemove
          .filter((entry) => entry.status === 'draft')
          .map(async (entry) => {
            const docId = getEntryDocIdFor(user.id, entry.id);
            try {
              await deleteRemoteEntry(docId);
            } catch (err) {
              console.warn('Failed to delete draft entry during reset', err);
            }
          }));
      } catch (err) {
        console.warn('Bulk deletion during reset failed', err);
      }
    }
  }, [agentState.entries, updateState, user?.id]);

  // New delete flow: modal confirm + 5s undo (optimistic)
  const requestDeleteEntry = useCallback((entry: DayEntry) => {
    if (entry.status !== 'draft') return;
    setPendingDelete(entry);
  }, []);

  const confirmDeleteEntry = useCallback((entry: DayEntry) => {
    setPendingDelete(null);

    // Optimistic: remove locally
    updateState((draft) => ({ ...draft, entries: draft.entries.filter((it) => it.id !== entry.id) }));
    setRemoteEntries((current) => current.filter((it) => it.id !== entry.id));

    // Schedule remote deletion after 5s window for undo
    const timeoutId = window.setTimeout(async () => {
      if (!user?.id) return;
      try {
        const docId = getEntryDocIdFor(user.id, entry.id);
        await deleteRemoteEntry(docId);
      } catch (err) {
        console.warn('Deferred remote delete failed', err);
      } finally {
        setUndoInfo((u) => (u && u.entry.id === entry.id ? null : u));
        undoTimerRef.current = null;
      }
    }, 5000);

    undoTimerRef.current = timeoutId as unknown as number;
    setUndoInfo({ entry, timeoutId });
  }, [setRemoteEntries, updateState, user?.id]);

  const cancelDeleteModal = useCallback(() => setPendingDelete(null), []);

  const undoDelete = useCallback(() => {
    if (!undoInfo) return;
    try { window.clearTimeout(undoInfo.timeoutId); } catch {}
    const e = undoInfo.entry;
    updateState((draft) => ({ ...draft, entries: [...draft.entries, e] }));
    setUndoInfo(null);
    undoTimerRef.current = null;
  }, [undoInfo, updateState]);

  useEffect(() => () => {
    if (undoTimerRef.current) {
      try { window.clearTimeout(undoTimerRef.current); } catch {}
    }
  }, []);

  const undoSubmission = useCallback(() => {

    updateState((draft) => ({

      ...draft,

      status: Status.Draft,

      rejectionNote: null,

  entries: draft.entries.map((e) => ({ ...e, status: Status.Draft, reviewStatus: EntryReviewStatus.Pending }))

    }));

  }, [updateState]);

  const totalLabel = formatHours(totalMinutesPeriod);

  const selectedMonthLabel = formatMonthLabel(agentState.period);

  // Micro-interaction: ripple on fancy buttons (e.g., Ajouter un jour)
  const ripple = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--y', `${e.clientY - rect.top}px`);
    el.classList.remove('is-rippling');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('is-rippling');
    window.setTimeout(() => el.classList.remove('is-rippling'), 500);
  }, []);

  // Helpers: ISO week for grouping
  function getIsoWeekParts(dateStr: string): { year: number; week: number } {
    const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
    const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const dayNum = date.getUTCDay() || 7; // 1..7, Mon=1
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: date.getUTCFullYear(), week };
  }

  const weeklyGroups = useMemo(() => {
    const orderKeys: string[] = [];
  const map: Record<string, { key: string; label: string; totalMinutes: number; entries: DayEntry[] }> = {};
    for (const e of visibleEntries) {
      const { year, week } = getIsoWeekParts(e.day);
      const key = `${year}-W${String(week).padStart(2, '0')}`;
      if (!map[key]) {
        map[key] = { key, label: `Total Semaine ${week}`, totalMinutes: 0, entries: [] };
        orderKeys.push(key);
      }
      map[key].entries.push(e);
      map[key].totalMinutes += computeWorkedMinutes(e);
    }
    return orderKeys.map((k) => map[k]);
  }, [visibleEntries]);

  // Row renderer for a single entry (keeps JSX concise)
  const renderEntryRow = useCallback((entry: DayEntry) => {
    const total = computeWorkedMinutes(entry);
    const isDraft = entry.status === 'draft';
    const isDuplicated = /_\d{13,}/.test(entry.id);
    const isSynced = remoteIds.has(entry.id);
    const isToday = entry.day === todayIsoStr;
    const rowClass = [
      isDuplicated ? 'checklist-row--compact' : '',
      isSynced ? 'checklist-row--synced' : 'checklist-row--local',
      isToday ? 'checklist-row--today' : '',
    ].filter(Boolean).join(' ');

    const tooltip = `Enverra au superviseur ${entry.supervisor ? entry.supervisor : '—'}`;

    return (
      <tr key={entry.id} className={rowClass}>
        <td className="day-col">
          <label htmlFor={`day-${entry.id}`} className="sr-only">Jour</label>
          <div className="day-field">
            <div className="day-field__inputWrap">
              <input
                id={`day-${entry.id}`}
                className="input day-field__inputControl"
                type="date"
                value={entry.day}
                onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'day', e.target.value)}
                disabled={!isDraft}
              />
            </div>
            <div className="day-field__meta">
              <span className="day-field__weekday">{formatDayLabel(entry.day)}</span>
              {isToday && <span className="day-field__status day-field__status--today">Aujourd'hui</span>}
              {/* Petite pastille JJ/MM pour repère visuel, comme sur la maquette */}
              <span className="date-chip date-chip--muted">{`${entry.day.slice(8,10)}/${entry.day.slice(5,7)}`}</span>
            </div>
          </div>
        </td>

        <td className="session-col">
          <fieldset className="session-fieldset">
            <label className="session-toggle">
              <input type="checkbox" checked={entry.includeMorning} onChange={(e: ChangeEvent<HTMLInputElement>) => toggleSession(entry.id, 'includeMorning', e.target.checked)} disabled={!isDraft} />
              <span>Activer</span>
            </label>
            {entry.includeMorning ? (
              <div className="time-grid session-times">
                <input className="input input--time" type="time" value={entry.morningStart} onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'morningStart', e.target.value)} disabled={!isDraft} />
                <input className="input input--time" type="time" value={entry.morningEnd} onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'morningEnd', e.target.value)} disabled={!isDraft} />
              </div>
            ) : (
              <span className="session-empty">N/A</span>
            )}
          </fieldset>
        </td>

        <td className="session-col">
          <fieldset className="session-fieldset">
            <label className="session-toggle">
              <input type="checkbox" checked={entry.includeAfternoon} onChange={(e: ChangeEvent<HTMLInputElement>) => toggleSession(entry.id, 'includeAfternoon', e.target.checked)} disabled={!isDraft} />
              <span>Activer</span>
            </label>
            {entry.includeAfternoon ? (
              <div className="time-grid session-times">
                <input className="input input--time" type="time" value={entry.afternoonStart} onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'afternoonStart', e.target.value)} disabled={!isDraft} />
                <input className="input input--time" type="time" value={entry.afternoonEnd} onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'afternoonEnd', e.target.value)} disabled={!isDraft} />
              </div>
            ) : (
              <span className="session-empty">N/A</span>
            )}
          </fieldset>
        </td>

        <td className="operation-cell project-col">
          <select className="select select--operation" value={entry.project} onChange={(e: ChangeEvent<HTMLSelectElement>) => changeEntryField(entry.id, 'project', e.target.value as ProjectOption)} disabled={!isDraft}>
            {PROJECT_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </td>

        <td className="supervisor-col">
          {isDraft ? (
            <select className="select select--supervisor" value={entry.supervisor || ''} onChange={e => changeEntryField(entry.id, 'supervisor', e.target.value)}>
              <option value="">--</option>
              <option value="Sabrina">Sabrina</option>
              <option value="Arthur">Arthur</option>
              <option value="Ismael">Ismael</option>
              <option value="Laetitia">Laetitia</option>
              <option value="Maurice">Maurice</option>
              <option value="Samia">Samia</option>
            </select>
          ) : (
            <span>{entry.supervisor || '--'}</span>
          )}
        </td>

        <td className="total-col total-col--value">{formatHours(total)}</td>

        <td className="actions-col">
          {isDraft ? (
            <div className="table-actions">
              <button type="button" className="button table-actions__danger" onClick={() => requestDeleteEntry(entry)}>Supprimer</button>
              <button
                type="button"
                className="button table-actions__primary has-tooltip"
                data-tooltip={tooltip}
                title={tooltip}
                aria-label={tooltip}
                onClick={() => submitEntry(entry)}
              >
                Soumettre
              </button>
            </div>
          ) : (
            <ReviewBadge status={entry.reviewStatus}>Soumise</ReviewBadge>
          )}
        </td>
      </tr>
    );
  }, [changeEntryField, remoteIds, submitEntry, toggleSession, todayIsoStr]);


  return (
    <div className={`cactus-hours-theme ${themeClass} delight-bg`} style={{ minHeight: '100vh' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {!tableOnly && <Sidebar />}
        <div className="page-shell" style={{ flex: 1, minWidth: 0 }}>
          {!tableOnly && (
            <>
              <ChecklistTopHeader active="agent" />
              <div className="page-header delight-hero anim-fade">
                <div>
                  <h2 className="page-title gradient-title">Mes heures</h2>
                  <div className="status-line badge-pulse">
                    <StatusBadge status={agentState.status} />
                    <span>{selectedMonthLabel}</span>
                  </div>
                </div>
                <div className="toolbar">
                  <label htmlFor="period-select" className="sr-only">Période</label>
                  <input id="period-select" className="input" type="month" value={agentState.period} onChange={onPeriodChange} />
                  <button className="button btn-radiant" type="button" onClick={(e) => { ripple(e); addDay(); }}>Ajouter un jour</button>
                  <button className="button button--ghost" type="button" onClick={resetEntries}>Réinitialiser</button>
                  {hasSubmittedEntries && (
                    <button className="button button--danger" type="button" onClick={undoSubmission}>Annuler la soumission</button>
                  )}
                </div>
              </div>
              {agentState.status === Status.Rejected && agentState.rejectionNote && (
                <div className="alert"><strong>Soumission rejetée :</strong> {agentState.rejectionNote}</div>
              )}
            </>
          )}

          <div className="table-container">
            <div className="table-scroll anim-fade">
              <table className="checklist-table">
              <colgroup>
                <col className="col-day" />
                <col className="col-session" />
                <col className="col-session" />
                <col className="col-project" />
                <col className="col-supervisor" />
                <col className="col-total" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="col-day-th">Jour</th>
                  <th>Matin</th>
                  <th>Après-midi</th>
                  <th>Opération</th>
                  <th className="col-supervisor">Superviseur</th>
                  <th className="total-col">Total</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {weeklyGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="week-sticky">
                      <td colSpan={7}>
                        <div className="week-bar">
                          <span className="week-bar__title">{group.label}</span>
                          <span className="week-bar__total">{formatHours(group.totalMinutes)}</span>
                        </div>
                      </td>
                    </tr>
                    {group.entries.map((entry) => renderEntryRow(entry))}
                  </Fragment>
                ))}
              </tbody>
              </table>
            </div>
          </div>

          {!tableOnly && visibleEntries.length === 0 && (
            <div className="card hint-card glow-card anim-pop">Toutes vos déclarations validées sont visibles dans les archives.</div>
          )}
          {!tableOnly && (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
              <div>
                <span className="section-subtitle">Total période</span>
                <div className="total-highlight">{totalLabel}</div>
              </div>
              <StatusBadge status={agentState.status}>{`Statut : ${STATUS_LABELS[agentState.status] ?? agentState.status}`}</StatusBadge>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {pendingDelete && (
        <div role="dialog" aria-modal="true" className="modal-overlay">
          <div className="modal-card">
            <h3 className="modal-title">Supprimer cette journée ?</h3>
            <p className="modal-text">Cette action peut être annulée pendant 5 secondes après confirmation.</p>
            <div className="modal-actions">
              <button className="button button--ghost" type="button" onClick={cancelDeleteModal}>Annuler</button>
              <button className="button table-actions__danger" type="button" onClick={() => confirmDeleteEntry(pendingDelete)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo snackbar */}
      {undoInfo && (
        <div className="snackbar">
          <span>Entrée supprimée.</span>
          <button className="button snackbar__action" type="button" onClick={undoDelete}>Annuler</button>
        </div>
      )}

      {/* Quick toast (top-right) */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[1000] px-4 py-3 rounded shadow-md ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

