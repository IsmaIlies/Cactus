import { useEffect, useMemo, useState } from 'react';
import { ReviewBadge } from '../modules/checklist/components/ReviewBadge';
import StatusBadge from '../modules/checklist/components/StatusBadge';
import { EntryReviewStatus } from '../modules/checklist/lib/constants';
import { loadAgentFromStorage } from '../modules/checklist/lib/storage';
import { computeWorkedMinutes, formatDayLabel, formatHours, formatMonthLabel, sortIsoDatesAscending } from '../modules/checklist/lib/time';
import '../modules/checklist/styles/base.css';
import '../modules/checklist/styles/archive-hours-right.css';
import Sidebar from '../components/Sidebar';
import ChecklistTopHeader from '../modules/checklist/components/ChecklistTopHeader';
import { createDispute, subscribeEntriesByUser, cancelDispute } from '../services/hoursService';
import { useAuth } from '../contexts/AuthContext';

export default function ChecklistArchivePage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<string>('');
  const state = useMemo(() => loadAgentFromStorage(period || undefined), [period]);
  const [approved, setApproved] = useState(state.entries.filter((e) => e.reviewStatus === EntryReviewStatus.Approved));
  const month = formatMonthLabel(state.period);
  const [claimForDocId, setClaimForDocId] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState('');
  useEffect(() => {
    if (!user?.id) return;
    const p = period || state.period;
    const unsub = subscribeEntriesByUser(user.id, p, (list) => {
      setApproved(list.filter((e) => e.reviewStatus === EntryReviewStatus.Approved));
    });
    return () => unsub();
  }, [period, state.period, user?.id]);
  const sorted = useMemo(() => [...approved].sort((a, b) => sortIsoDatesAscending(a.day, b.day)), [approved]);
  const total = useMemo(() => sorted.reduce((acc, e) => acc + computeWorkedMinutes(e), 0), [sorted]);
  // Group by day for the card-style layout
  const grouped = sorted.reduce<Record<string, typeof sorted>>((acc, e) => {
    (acc[e.day] ||= []).push(e);
    return acc;
  }, {});

  // Helper to color specific times (7h00, 07:00, 7h30, 07:30)
  const isSevenAM = (s?: string) => {
    if (!s) return false;
    const t = s.toLowerCase().replace(/\s/g, '').replace('h', ':');
    return t === '7:00' || t === '07:00' || t === '7:30' || t === '07:30';
  };
  const Time = ({ value }: { value?: string }) => {
    if (!value) return <span>N/A</span>;
    return <span className={isSevenAM(value) ? 'time-early' : undefined}>{value}</span>;
  };

  return (
    <div className="cactus-hours-theme" style={{ minHeight: '100vh', background: '#f7fafc' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div className="page-shell" style={{ flex: 1, minWidth: 0 }}>
          <ChecklistTopHeader active="archive" />
          <div className="page-header">
            <div>
              <h2 className="page-title">Archives</h2>
              <div className="status-line">
                <StatusBadge status={state.status} />
                <span>{month}</span>
              </div>
            </div>
            <div className="toolbar">
              <input className="input" type="month" value={period || state.period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
          </div>
          <div className="archive-wrap">
            <div className="archive-header">
              <div>
                <div className="section-subtitle">{month}</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{sorted.length} {sorted.length <= 1 ? 'jour soumis' : 'jours soumis'}</div>
              </div>
              <div className="total-highlight">{formatHours(total)}</div>
            </div>
            <div style={{ display:'grid', gap: '12px' }}>
              {Object.entries(grouped).map(([dayIso, entries]) => (
                <div key={dayIso} className="archive-day">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      <strong className="date-label">{formatDayLabel(dayIso)}</strong>
                      <span className="date-label" style={{ color: 'var(--color-text-secondary)' }}>{dayIso}</span>
                    </div>
                    <div className="archive-hours-right">{formatHours(entries.reduce((a, e) => a + computeWorkedMinutes(e), 0))}</div>
                  </div>
                  <div style={{ display:'grid', gap: '10px' }}>
                    {entries.map((entry) => (
                      <div key={entry.id} className="archive-entry">
                        <div className="archive-entry-col" style={{ minWidth: 160 }}>
                          <span className="project-badge">{entry.project}</span>
                          <div style={{ color: 'var(--color-text-secondary)' }}>Notes : {entry.notes?.trim() ? entry.notes : '—'}</div>
                          {/* Affiche la réclamation et l'historique */}
                          {entry.hasDispute && (
                            <div
                              style={{
                                marginTop: 18,
                                background: 'linear-gradient(90deg, #f8fafc 0%, #e6fff4 100%)',
                                border: '1.5px solid #1ecf88',
                                borderRadius: 16,
                                padding: '20px 28px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 18,
                                justifyContent: 'center',
                                boxShadow: '0 4px 18px 0 rgba(30,207,136,0.10)',
                                animation: 'fadeIn 0.7s',
                                minWidth: 320,
                                maxWidth: 480,
                                marginLeft: 'auto',
                                marginRight: 'auto',
                                position: 'relative',
                              }}
                            >
                              <svg width="38" height="38" viewBox="0 0 38 38" fill="none" style={{flexShrink:0}} xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                  <radialGradient id="g1" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#1ecf88" stopOpacity="0.18"/>
                                    <stop offset="100%" stopColor="#1ecf88" stopOpacity="0.08"/>
                                  </radialGradient>
                                </defs>
                                <circle cx="19" cy="19" r="18" fill="url(#g1)" stroke="#1ecf88" strokeWidth="2"/>
                                <text x="19" y="26" textAnchor="middle" fontSize="20" fill="#1ecf88" fontFamily="Arial, sans-serif" fontWeight="bold">i</text>
                              </svg>
                              <div style={{display:'flex', flexDirection:'column', alignItems:'flex-start'}}>
                                <span style={{fontWeight:700, fontSize:17, color:'#1ecf88', marginBottom:2}}>Réclamation en attente</span>
                                <span style={{fontWeight:400, fontSize:14, color:'#444'}}>Votre demande a bien été prise en compte et sera traitée prochainement.</span>
                                {/* Bouton Annuler la réclamation si statut non traité */}
                                {(!entry.claimStatus || entry.claimStatus === 'pending' || entry.claimStatus === 'in_progress') && (
                                  <button
                                    type="button"
                                    style={{
                                      marginTop: 14,
                                      background: '#fff',
                                      color: '#e74c3c',
                                      border: '1px solid #e74c3c',
                                      borderRadius: 6,
                                      padding: '6px 16px',
                                      fontWeight: 600,
                                      fontSize: 14,
                                      cursor: 'pointer',
                                      transition: 'background 0.2s, color 0.2s',
                                    }}
                                    onClick={async () => {
                                      if (!window.confirm('Voulez-vous vraiment annuler cette réclamation ?')) return;
                                      try {
                                        // Suppression du statut de réclamation (exemple simple)
                                        const docId = (entry as any)._docId || entry.id;
                                        await cancelDispute(docId);
                                        // Mise à jour locale de l'état pour retirer la réclamation sans reload
                                        setApproved((prev) => prev.map(e => {
                                          if ((e as any)._docId === docId || e.id === docId) {
                                            return { ...e, hasDispute: false };
                                          }
                                          return e;
                                        }));
                                      } catch (e) {
                                        alert('Erreur lors de l\'annulation.');
                                      }
                                    }}
                                  >
                                    Annuler la réclamation
                                  </button>
                                )}
                              </div>
                              <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px);} to { opacity: 1; transform: none; }}`}</style>
                            </div>
                          )}
                        </div>
                        <div className="archive-entry-col">
                          <div className="archive-time">
                            Matin : {entry.includeMorning ? (<>
                              <Time value={entry.morningStart} /> <span>→</span> <Time value={entry.morningEnd} />
                            </>) : 'N/A'}
                          </div>
                          <div className="archive-time">
                            Après-midi : {entry.includeAfternoon ? (<>
                              <Time value={entry.afternoonStart} /> <span>→</span> <Time value={entry.afternoonEnd} />
                            </>) : 'N/A'}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <button
                            type="button"
                            className="icon-badge"
                            title="Signaler une erreur"
                            onClick={() => { setClaimForDocId((entry as any)._docId ?? ''); setClaimNote(''); }}
                          >?</button>
                          <ReviewBadge status={entry.reviewStatus}>Validée</ReviewBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
            <div>
              <span className="section-subtitle">Total période</span>
              <div className="total-highlight">{formatHours(total)}</div>
            </div>
            <StatusBadge status={state.status} />
          </div>
          {claimForDocId && (
            <div className="modal-backdrop" role="dialog" aria-modal="true">
              <div className="modal-card" style={{ padding: 20 }}>
                <h3 className="modal-title" style={{ fontSize: 20, marginBottom: 6 }}>Envoyer une réclamation</h3>
                <div className="section-subtitle" style={{ marginBottom: 14 }}>
                  Décrivez le problème rencontré sur cette journée.<br />
                  L'administration recevra votre message.
                </div>
                <textarea
                  className="textarea textarea--elevated"
                  rows={5}
                  placeholder="Ex.: début à 10h30"
                  value={claimNote}
                  onChange={(e) => setClaimNote(e.target.value)}
                />
                <div className="modal-actions" style={{ marginTop: 14 }}>
                  <button type="button" className="button button--ghost" onClick={() => setClaimForDocId(null)}>Annuler</button>
                  <button
                    type="button"
                    className="button button--primary-strong"
                    onClick={async () => {
                      if (!claimForDocId) return;
                      const note = claimNote.trim();
                      if (!note) return;
                      try {
                        await createDispute(claimForDocId, note);
                        setClaimForDocId(null);
                      } catch (e) {
                        console.warn(e);
                      }
                    }}
                  >Envoyer</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
