import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { ReviewBadge } from '../modules/checklist/components/ReviewBadge';

import StatusBadge from '../modules/checklist/components/StatusBadge';

import { EntryReviewStatus, PROJECT_OPTIONS, ProjectOption, Status, STATUS_LABELS } from '../modules/checklist/lib/constants';

import { DayEntry, StoredAgentState, ensureEntryForDay, hydrateEntry, loadAgentFromStorage, persistAgentState } from '../modules/checklist/lib/storage';
import Sidebar from '../components/Sidebar';

import { addDaysToIso, computeWorkedMinutes, formatDayLabel, formatHours, formatMonthLabel, sortIsoDatesAscending } from '../modules/checklist/lib/time';

import '../modules/checklist/styles/base.css';
import '../modules/checklist/styles/select-operation-fix.css';
import '../modules/checklist/styles/modern-theme.css';
import ChecklistTopHeader from '../modules/checklist/components/ChecklistTopHeader';

import { subscribeEntriesByUser, upsertAgentEntry, submitAgentHours, deleteEntry as deleteRemoteEntry, getEntryDocIdFor } from '../services/hoursService';

import { useAuth } from '../contexts/AuthContext';

function cloneState(state: StoredAgentState): StoredAgentState {

  return { ...state, entries: state.entries.map((e) => ({ ...e })) };

}

export default function ChecklistPage() {

  const { user } = useAuth();

  const [agentState, setAgentState] = useState(loadAgentFromStorage);

  const [remoteEntries, setRemoteEntries] = useState<DayEntry[]>([]);

  const remoteIds = useMemo(() => new Set(remoteEntries.map((e) => e.id)), [remoteEntries]);

  const todayIsoStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const updateState = useCallback((mutator: (draft: StoredAgentState) => StoredAgentState) => {

    setAgentState((current) => {

      const draft = cloneState(current);

      const next = mutator(draft);

      persistAgentState(next);

      return next;

    });

  }, []);

  // Fusionne remote + local pour que l'ajout local reste visible même si la sync Firestore échoue

  // Affiche toutes les entrées locales (même plusieurs pour le même jour),

  // mais si une entrée Firestore existe pour un jour, elle masque toutes les locales de ce jour

  const mergedEntries = useMemo(() => {

    // On re-utilise les identifiants synchronises pour visualiser l'etat des lignes

    const result: DayEntry[] = [...remoteEntries];

    // On ajoute les entrees locales qui n'ont pas encore ete synchronisees

    for (const e of agentState.entries) {

      if (!remoteIds.has(e.id)) {

        result.push(e);

      }

    }

    return result;

  }, [remoteEntries, agentState.entries]);

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

    });

    return () => unsub();

  }, [agentState.period, user?.id]);

  const changeEntryField = useCallback(<K extends keyof DayEntry>(id: string, field: K, value: DayEntry[K]) => {

    updateState((draft) => {

      const entries = draft.entries.map((e) => (e.id === id ? { ...e, [field]: value } : e));

      const nextStatus = draft.status === Status.Approved ? Status.Draft : draft.status;

      return { ...draft, entries, status: nextStatus };

    });

  }, [updateState]);

  const toggleSession = useCallback((id: string, session: 'includeMorning' | 'includeAfternoon', enabled: boolean) => {

    changeEntryField(id, session as any, enabled as any);

  }, [changeEntryField]);



  const deleteDraftEntry = useCallback(async (entry: DayEntry) => {

    if (entry.status !== 'draft') return;

    const confirmed = window.confirm('Souhaitez-vous supprimer cette journee ?');

    if (!confirmed) return;

    updateState((draft) => ({

      ...draft,

      entries: draft.entries.filter((it) => it.id !== entry.id),

    }));

    setRemoteEntries((current) => current.filter((it) => it.id !== entry.id));

    if (user?.id) {

      try {

        const docId = getEntryDocIdFor(user.id, entry.id);

        await deleteRemoteEntry(docId);

      } catch (err) {

        console.warn('Failed to delete draft entry remotely', err);

      }

    }

  }, [setRemoteEntries, updateState, user?.id]);

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

    // Mirror to Firestore for admin supervision if authenticated

    try {

      // Write exactly per Admin contract

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

    } catch (e) {

      console.warn('Sync to Firestore failed, will remain local only', e);

    }

  }, [agentState.period, updateState, user?.id]);

  // Ajoute une nouvelle case (entrée) pour le même jour, vide, pour permettre plusieurs checklists sur le même jour

  // Ajoute une nouvelle case (entrée) pour le même jour, avec un id unique, pour permettre plusieurs checklists distinctes sur le même jour

  // Duplique la checklist complète (sessions, horaires, projet, notes, etc.) pour le même jour, avec un nouvel id unique

  const duplicateEntryOperation = useCallback((entry: DayEntry) => {

    updateState((draft) => {

      const uniqueId = entry.day + '_' + Date.now();

      // Remplir tous les champs vides avec les valeurs de l'entrée d'origine

      const dup = hydrateEntry({

        ...entry,

        id: uniqueId,

  status: Status.Draft,

        reviewStatus: EntryReviewStatus.Pending,

        includeMorning: entry.includeMorning ?? true,

        includeAfternoon: entry.includeAfternoon ?? true,

        morningStart: entry.morningStart || '10:00',

        morningEnd: entry.morningEnd || '13:00',

        afternoonStart: entry.afternoonStart || '15:00',

        afternoonEnd: entry.afternoonEnd || '19:00',

        project: entry.project || 'CANAL 211',

        notes: entry.notes || '',

      });

      // Ajoute la nouvelle entrée juste après l'originale dans le tableau

      const idx = draft.entries.findIndex(e => e.id === entry.id);

      const newEntries = [...draft.entries];

      newEntries.splice(idx + 1, 0, dup);

      return { ...draft, entries: newEntries };

    });

  }, [updateState]);

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

        project: 'CANAL 211',

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


  return (

    <div className="cactus-hours-theme checklist-modern" style={{ minHeight: '100vh' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div className="page-shell" style={{ flex: 1, minWidth: 0 }}>
          <ChecklistTopHeader active="agent" />
          <div className="page-header">
            <div>
              <h2 className="page-title">Mes heures</h2>
              <div className="status-line">
                <StatusBadge status={agentState.status} />
                <span>{selectedMonthLabel}</span>
              </div>
            </div>
            <div className="toolbar">
              <label htmlFor="period-select" className="sr-only">Période</label>
              <input id="period-select" className="input" type="month" value={agentState.period} onChange={onPeriodChange} />
              <button className="button" type="button" onClick={addDay}>Ajouter un jour</button>
              <button className="button button--ghost" type="button" onClick={resetEntries}>Réinitialiser</button>
              {hasSubmittedEntries && (
                <button className="button button--danger" type="button" onClick={undoSubmission}>Annuler la soumission</button>
              )}
            </div>
          </div>

        {agentState.status === Status.Rejected && agentState.rejectionNote && (

          <div className="alert"><strong>Soumission rejetée :</strong> {agentState.rejectionNote}</div>

        )}

        <div className="table-container">

          <div className="table-scroll">

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

                {visibleEntries.map((entry) => {

                  const total = computeWorkedMinutes(entry);

                  const isDraft = entry.status === 'draft';

                  const isDuplicated = /_\d{13,}/.test(entry.id);

                  const isSynced = remoteIds.has(entry.id);

                  const isToday = entry.day === todayIsoStr;

                  const isSubmitted = entry.status === 'submitted';

                  const rowClass = [

                    isDuplicated ? 'checklist-row--compact' : '',

                    isSynced ? 'checklist-row--synced' : 'checklist-row--local',

                    isToday ? 'checklist-row--today' : '',

                  ].filter(Boolean).join(' ');

                  const statusTone = isSubmitted ? 'day-field__status--synced' : (isSynced ? 'day-field__status--synced' : 'day-field__status--local');

                  const statusClassName = `day-field__status ${statusTone}`;

                  const statusLabel = isSubmitted ? 'Soumise' : (isSynced ? 'Synchronisee' : 'Brouillon');


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



                            {/* <span className={statusClassName}>{statusLabel}</span> */}



                            {isToday && <span className="day-field__status day-field__status--today">Aujourd'hui</span>}

                          </div>



                        </div>



                      </td>



                      <td className="session-col">

                        <fieldset className="session-fieldset">

                          <label className="session-toggle">

                            <input

                              type="checkbox"

                              checked={entry.includeMorning}

                              onChange={(e: ChangeEvent<HTMLInputElement>) => toggleSession(entry.id, 'includeMorning', e.target.checked)}

                              disabled={!isDraft}

                            />

                            <span>Activer</span>

                          </label>

                          {entry.includeMorning ? (

                            <div className="time-grid session-times">

                              <input

                                className="input input--time"

                                type="time"

                                value={entry.morningStart}

                                onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'morningStart', e.target.value)}

                                disabled={!isDraft}

                              />

                              <input

                                className="input input--time"

                                type="time"

                                value={entry.morningEnd}

                                onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'morningEnd', e.target.value)}

                                disabled={!isDraft}

                              />

                            </div>

                          ) : (

                            <span className="session-empty">N/A</span>

                          )}

                        </fieldset>

                      </td>

                      <td className="session-col">

                        <fieldset className="session-fieldset">

                          <label className="session-toggle">

                            <input

                              type="checkbox"

                              checked={entry.includeAfternoon}

                              onChange={(e: ChangeEvent<HTMLInputElement>) => toggleSession(entry.id, 'includeAfternoon', e.target.checked)}

                              disabled={!isDraft}

                            />

                            <span>Activer</span>

                          </label>

                          {entry.includeAfternoon ? (

                            <div className="time-grid session-times">

                              <input

                                className="input input--time"

                                type="time"

                                value={entry.afternoonStart}

                                onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'afternoonStart', e.target.value)}

                                disabled={!isDraft}

                              />

                              <input

                                className="input input--time"

                                type="time"

                                value={entry.afternoonEnd}

                                onChange={(e: ChangeEvent<HTMLInputElement>) => changeEntryField(entry.id, 'afternoonEnd', e.target.value)}

                                disabled={!isDraft}

                              />

                            </div>

                          ) : (

                            <span className="session-empty">N/A</span>

                          )}

                        </fieldset>

                      </td>

                      <td className="operation-cell project-col">
                        <select
                          className="select select--operation"
                          value={entry.project}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => changeEntryField(entry.id, 'project', e.target.value as ProjectOption)}
                          disabled={!isDraft}
                        >
                          {PROJECT_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td className="supervisor-col">
                        {isDraft ? (
                          <select
                            className="select select--supervisor"
                            value={entry.supervisor || ''}
                            onChange={e => changeEntryField(entry.id, 'supervisor', e.target.value)}
                          >
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

                            <button

                              type="button"

                              className="button table-actions__danger"

                              onClick={() => deleteDraftEntry(entry)}

                            >

                              Supprimer

                            </button>

                            <button

                              type="button"

                              className="button table-actions__secondary"

                              onClick={() => duplicateEntryOperation(entry)}

                            >

                              Ajouter

                            </button>

                            <button

                              type="button"

                              className="button table-actions__primary"

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

                })}

              </tbody>

            </table>

          </div>

        </div>


        {visibleEntries.length === 0 && (
          <div className="card hint-card">Toutes vos déclarations validées sont visibles dans les archives.</div>
        )}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
          <div>
            <span className="section-subtitle">Total période</span>
            <div className="total-highlight">{totalLabel}</div>
          </div>
          <StatusBadge status={agentState.status}>{`Statut : ${STATUS_LABELS[agentState.status] ?? agentState.status}`}</StatusBadge>
        </div>
      </div>
    </div>
  </div>
  );
}

