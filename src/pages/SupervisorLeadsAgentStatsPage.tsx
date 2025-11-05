import React from 'react';
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { categorize } from '../leads/services/leadsSalesService';
import { db } from '../firebase';

const CANONICAL_AGENT_ALIASES: Array<{ label: string; patterns: Array<(value: string) => boolean> }> = [
  {
    label: 'TOM HALADJIAN MARIOTTI',
    patterns: [
      (value) => /tom/.test(value) && /mariotti/.test(value),
      (value) => /tom/.test(value) && /haladjian/.test(value),
    ],
  },
];

const resolveAgentLabel = (displayName?: string | null, email?: string | null) => {
  const candidates = [displayName, email]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim());

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    for (const alias of CANONICAL_AGENT_ALIASES) {
      if (alias.patterns.some((matcher) => matcher(lower))) {
        return alias.label;
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  return 'Agent inconnu';
};

const monthOptions = (() => {
  const options: Array<{ label: string; value: string }> = [];
  const current = new Date();
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(current.getFullYear(), current.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    options.push({ label, value });
  }
  return options;
})();

type AgentAggregates = {
  label: string;
  leadCount: number;
  internetSales: number;
  mobileSales: number;
};

const formatNumber = (value: number) => value.toLocaleString('fr-FR');
const formatFloat = (value: number, digits = 2) =>
  value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Utils calendrier: jours ouvrés (lundi-vendredi) du mois
// Important: clé de jour en LOCAL pour éviter les décalages UTC (toISOString())
const toLocalDayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const getWorkingDaysInMonth = (year: number, monthIndex0: number) => {
  const days: string[] = [];
  const d = new Date(year, monthIndex0, 1);
  while (d.getMonth() === monthIndex0) {
    const day = d.getDay(); // 0=Dim ... 6=Sam
    if (day >= 1 && day <= 5) {
      days.push(toLocalDayKey(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
};

const SupervisorLeadsAgentStatsPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    monthOptions[0]?.value || new Date().toISOString().slice(0, 10)
  );
  const [rows, setRows] = React.useState<AgentAggregates[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string>('');

  // Heures éditables par agent (par mois)
  const [hoursByAgent, setHoursByAgent] = React.useState<Record<string, number>>({});
  const [hoursLoading, setHoursLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [dirty, setDirty] = React.useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = React.useState<Record<string, string | null>>({});
  // Heures éditables par agent (par jour sélectionné)
  const [dailyHoursByAgent, setDailyHoursByAgent] = React.useState<Record<string, number>>({});
  const [dailySaving, setDailySaving] = React.useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [dailyDirty, setDailyDirty] = React.useState<Record<string, boolean>>({});
  const [dailySaveError, setDailySaveError] = React.useState<Record<string, string | null>>({});
  // Journée/Calendrier
  const [workingDays, setWorkingDays] = React.useState<string[]>([]);
  const [selectedDayKey, setSelectedDayKey] = React.useState<string>('');
  const [perDayAgentCounts, setPerDayAgentCounts] = React.useState<Record<string, Record<string, number>>>({});

  const selectedMonthDate = React.useMemo(() => {
    const parsed = new Date(selectedMonth);
    if (Number.isNaN(parsed.getTime())) {
      const fallback = new Date();
      fallback.setDate(1);
      return fallback;
    }
    return parsed;
  }, [selectedMonth]);

  // Helpers mois/clé/doc
  const monthKey = React.useMemo(
    () => `${selectedMonthDate.getFullYear()}-${`${selectedMonthDate.getMonth() + 1}`.padStart(2, '0')}`,
    [selectedMonthDate]
  );
  const monthStart = React.useMemo(
    () => new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1, 0, 0, 0, 0),
    [selectedMonthDate]
  );

  // Met à jour la liste des jours ouvrés du mois et la sélection de jour
  React.useEffect(() => {
    const wd = getWorkingDaysInMonth(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth());
    setWorkingDays(wd);
    // Sélection par défaut: aujourd'hui si dans le mois et jour ouvré, sinon premier jour ouvré
    const todayKey = toLocalDayKey(new Date());
    const defaultKey = wd.includes(todayKey) ? todayKey : wd[0] || '';
    setSelectedDayKey(defaultKey);
  }, [selectedMonthDate]);

  // Charger heures journalières pour le jour sélectionné
  React.useEffect(() => {
    const loadDaily = async () => {
      if (!selectedDayKey) {
        setDailyHoursByAgent({});
        setDailyDirty({});
        setDailySaving({});
        return;
      }
      try {
        const qd = query(collection(db, 'leads_prod_hours_daily'), where('dayKey', '==', selectedDayKey));
        const snap = await getDocs(qd);
        const map: Record<string, number> = {};
        snap.forEach((d) => {
          const v = d.data() as any;
          const label = (v?.agentLabel as string) || 'Agent inconnu';
          const hours = Number(v?.hours ?? 0);
          if (!Number.isNaN(hours) && hours >= 0) map[label] = hours;
        });
        setDailyHoursByAgent(map);
        setDailyDirty({});
        setDailySaving({});
        setDailySaveError({});
      } catch (e) {
        // silently ignore, UI shows default 7h
        setDailyHoursByAgent({});
        setDailyDirty({});
        setDailySaving({});
        setDailySaveError({});
      }
    };
    loadDaily();
  }, [selectedDayKey]);

  React.useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError('');
      try {
        const monthStart = new Date(
          selectedMonthDate.getFullYear(),
          selectedMonthDate.getMonth(),
          1,
          0,
          0,
          0,
          0
        );
        const monthEndExclusive = new Date(
          selectedMonthDate.getFullYear(),
          selectedMonthDate.getMonth() + 1,
          1,
          0,
          0,
          0,
          0
        );

        const q = query(
          collection(db, 'leads_sales'),
          where('mission', '==', 'ORANGE_LEADS'),
          where('createdAt', '>=', Timestamp.fromDate(monthStart)),
          where('createdAt', '<', Timestamp.fromDate(monthEndExclusive)),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);

  const aggregates = new Map<string, AgentAggregates>();
  // Comptage par jour et par agent
  const perDay: Record<string, Record<string, number>> = {};

        snapshot.forEach((document) => {
          const data = document.data() as Record<string, unknown>;
          const createdBy = (data?.createdBy ?? {}) as Record<string, unknown>;
          const label = resolveAgentLabel(
            createdBy?.displayName as string | undefined,
            createdBy?.email as string | undefined
          );
          const current = aggregates.get(label) || {
            label,
            leadCount: 0,
            internetSales: 0,
            mobileSales: 0,
          };

          const categorized = categorize(data?.typeOffre as string | undefined | null);
          current.leadCount += 1;
          current.internetSales += categorized.internet + categorized.internetSosh;
          current.mobileSales += categorized.mobile + categorized.mobileSosh;
          aggregates.set(label, current);

          // Clé jour (YYYY-MM-DD)
          const ts = (data?.createdAt as Timestamp | undefined) ?? undefined;
          if (ts) {
            const dt = ts.toDate();
            const dk = toLocalDayKey(dt);
            if (!perDay[dk]) perDay[dk] = {};
            perDay[dk][label] = (perDay[dk][label] ?? 0) + 1;
          }
        });

        const nextRows = Array.from(aggregates.values()).sort((a, b) => b.leadCount - a.leadCount);
        setRows(nextRows);
        setPerDayAgentCounts(perDay);
      } catch (err: any) {
        setRows([]);
        setError(err?.message || 'Impossible de charger les statistiques agents.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedMonthDate, selectedMonth]);

  // Charger heures sauvegardées pour le mois
  React.useEffect(() => {
    const loadHours = async () => {
      setHoursLoading(true);
      try {
        const qh = query(collection(db, 'leads_prod_hours_monthly'), where('monthKey', '==', monthKey));
        const snap = await getDocs(qh);
        const map: Record<string, number> = {};
        snap.forEach((d) => {
          const v = d.data() as any;
          const label = (v?.agentLabel as string) || 'Agent inconnu';
          const hours = Number(v?.hours ?? 0);
          if (!Number.isNaN(hours) && hours >= 0) map[label] = hours;
        });
        setHoursByAgent(map);
        setDirty({});
        setSaving({});
      } finally {
        setHoursLoading(false);
      }
    };
    loadHours();
  }, [monthKey]);

  // Préremplir à 7h pour les agents sans valeur existante
  React.useEffect(() => {
    if (!rows.length) return;
    setHoursByAgent((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!(r.label in next)) {
          // Pour le mensuel, valeur par défaut souhaitée: 140h
          next[r.label] = 140;
        }
      }
      return next;
    });
  }, [rows]);

  // Préremplir à 7h pour le jour sélectionné
  React.useEffect(() => {
    if (!rows.length || !selectedDayKey) return;
    setDailyHoursByAgent((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!(r.label in next)) {
          next[r.label] = 7;
        }
      }
      return next;
    });
  }, [rows, selectedDayKey]);

  const setHoursFor = (label: string, value: number) => {
    setHoursByAgent((prev) => ({ ...prev, [label]: value }));
    setDirty((prev) => ({ ...prev, [label]: true }));
    setSaving((prev) => ({ ...prev, [label]: 'idle' }));
  };

  const saveHoursFor = async (label: string) => {
    const hours = Number(hoursByAgent[label] ?? 0);
    if (Number.isNaN(hours) || hours < 0) return;
    const id = `${monthKey}__${encodeURIComponent(label)}`;
    try {
      setSaving((p) => ({ ...p, [label]: 'saving' }));
      setSaveError((p) => ({ ...p, [label]: null }));
      await setDoc(
        doc(collection(db, 'leads_prod_hours_monthly'), id),
        {
          monthKey,
          monthStart: Timestamp.fromDate(monthStart),
          agentLabel: label,
          hours,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSaving((p) => ({ ...p, [label]: 'saved' }));
      setDirty((p) => ({ ...p, [label]: false }));
    } catch (e: any) {
      console.error('saveHoursFor error', label, e);
      const message = e?.message || e?.code || 'Erreur inconnue';
      setSaving((p) => ({ ...p, [label]: 'error' }));
      setSaveError((p) => ({ ...p, [label]: String(message) }));
    }
  };

  const saveAll = async () => {
    const labels = Object.keys(dirty).filter((k) => dirty[k]);
    for (const label of labels) {
      // eslint-disable-next-line no-await-in-loop
      await saveHoursFor(label);
    }
  };

  // Gestion édition/sauvegarde journalière
  const setDailyHoursFor = (label: string, value: number) => {
    setDailyHoursByAgent((prev) => ({ ...prev, [label]: value }));
    setDailyDirty((prev) => ({ ...prev, [label]: true }));
    setDailySaving((prev) => ({ ...prev, [label]: 'idle' }));
  };

  const saveDailyHoursFor = async (label: string) => {
    if (!selectedDayKey) return;
    const hours = Number(dailyHoursByAgent[label] ?? 0);
    if (Number.isNaN(hours) || hours < 0) return;
    const id = `${selectedDayKey}__${encodeURIComponent(label)}`;
    try {
      setDailySaving((p) => ({ ...p, [label]: 'saving' }));
      setDailySaveError((p) => ({ ...p, [label]: null }));
      const dayStart = new Date(selectedDayKey + 'T00:00:00');
      await setDoc(
        doc(collection(db, 'leads_prod_hours_daily'), id),
        {
          dayKey: selectedDayKey,
          dayStart: Timestamp.fromDate(dayStart),
          agentLabel: label,
          hours,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDailySaving((p) => ({ ...p, [label]: 'saved' }));
      setDailyDirty((p) => ({ ...p, [label]: false }));
    } catch (e: any) {
      console.error('saveDailyHoursFor error', label, e);
      const message = e?.message || e?.code || 'Erreur inconnue';
      setDailySaving((p) => ({ ...p, [label]: 'error' }));
      setDailySaveError((p) => ({ ...p, [label]: String(message) }));
    }
  };

  // Note: plus de bouton "tout enregistrer" pour le jour; enregistrement automatique au blur

  const totalLeads = rows.reduce((acc, row) => acc + row.leadCount, 0);
  const totalInternet = rows.reduce((acc, row) => acc + row.internetSales, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Stat Agent</h1>
          <p className="text-sm text-blue-200/80">
            Répartition des ventes par téléacteur sur la période sélectionnée.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-blue-100/80">
          <span>Période</span>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white focus:border-cyan-300 focus:outline-none"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label.charAt(0).toUpperCase() + option.label.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/40 bg-white/5 p-4 shadow-[0_20px_60px_rgba(34,211,238,0.18)]">
        <div className="pointer-events-none absolute -top-24 -left-12 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-60 w-60 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="uppercase tracking-[0.35em] text-xs text-blue-200/70">
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-right">Ventes</th>
                <th className="px-4 py-3 text-right">Internet</th>
                <th className="px-4 py-3 text-right">Mobile</th>
                <th className="px-4 py-3 text-right">Taux Internet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/90">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-blue-100/70">
                    Chargement des statistiques agents…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-blue-100/70">
                    Aucune vente enregistrée pour la période.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const internetRate = row.leadCount > 0 ? (row.internetSales / row.leadCount) * 100 : 0;
                  return (
                    <tr key={row.label} className="hover:bg-white/5">
                      <td className="px-4 py-3 text-left font-semibold text-white">{row.label}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(row.leadCount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-200">{formatNumber(row.internetSales)}</td>
                      <td className="px-4 py-3 text-right text-sky-200">{formatNumber(row.mobileSales)}</td>
                      <td className="px-4 py-3 text-right text-emerald-100">
                        {row.leadCount > 0
                          ? `${internetRate.toLocaleString('fr-FR', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })} %`
                          : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="divide-y divide-white/10 text-white">
                <tr className="bg-white/5">
                  <td className="px-4 py-3 font-semibold">Total</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatNumber(totalLeads)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-200">{formatNumber(totalInternet)}</td>
                  <td className="px-4 py-3 text-right" />
                  <td className="px-4 py-3 text-right text-emerald-100">
                    {totalLeads > 0
                      ? `${((totalInternet / totalLeads) * 100).toLocaleString('fr-FR', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })} %`
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Productivité journalière (éditable, défaut 7h/jour, lun-ven) */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Productivité journalière (éditable)</h2>
            <p className="text-sm text-blue-200/80">Sélectionne un jour ouvré du mois pour voir les ventes et ajuster les heures de production par agent (par défaut 7h).</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-blue-100/80">
            <span>Jour</span>
            <select
              value={selectedDayKey}
              onChange={(e) => setSelectedDayKey(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-1.5 text-sm text-white focus:border-cyan-300 focus:outline-none"
            >
              {workingDays.map((dk) => {
                const d = new Date(dk);
                const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
                return (
                  <option key={dk} value={dk}>
                    {label.charAt(0).toUpperCase() + label.slice(1)}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="relative overflow-x-auto p-4">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="uppercase tracking-[0.35em] text-xs text-blue-200/70">
                  <th className="px-4 py-3 text-left">Agent</th>
                  <th className="px-4 py-3 text-right">Ventes (jour)</th>
                  <th className="px-4 py-3 text-right">Heures (jour)</th>
                  <th className="px-4 py-3 text-right">Ventes/heure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/90">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-blue-100/70">Chargement…</td>
                  </tr>
                ) : !selectedDayKey ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-blue-100/70">Aucun jour ouvré dans le mois.</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const ventesJour = perDayAgentCounts[selectedDayKey]?.[row.label] ?? 0;
                    const hours = dailyHoursByAgent[row.label] ?? 7;
                    const vph = hours > 0 ? ventesJour / hours : 0;
                    const isDirty = !!dailyDirty[row.label];
                    return (
                      <tr key={`day-${selectedDayKey}-${row.label}`} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-left font-semibold text-white">{row.label}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(ventesJour)}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={hours}
                            onChange={(e) => setDailyHoursFor(row.label, Math.max(0, Number(e.target.value)))}
                            onBlur={() => saveDailyHoursFor(row.label)}
                            className={`w-24 rounded-lg border bg-slate-900/40 px-3 py-1.5 text-right text-white focus:border-cyan-300 focus:outline-none ${
                              isDirty ? 'border-cyan-400' : 'border-white/10'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-200">{formatFloat(vph)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/10 bg-white/5 px-4 py-2 text-xs text-blue-200/70">
            Par défaut 7h par jour ouvré (modifiable ci-dessus). Les week-ends sont exclus. Les heures sont enregistrées automatiquement à la sortie du champ.
          </div>
        </div>
      </section>

      {/* Productivité mensuelle (heures éditables, défaut 140h) */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Productivité mensuelle (heures éditables)</h2>
            <p className="text-sm text-blue-200/80">Par défaut, 140h par agent ce mois-ci (modifiable). Le taux de concret se base sur ces heures.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveAll}
              disabled={!Object.values(dirty).some(Boolean)}
              className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-medium text-white shadow hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-cyan-500/30"
              title="Enregistrer toutes les heures mensuelles modifiées"
            >
              Enregistrer ({Object.values(dirty).filter(Boolean).length})
            </button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="relative overflow-x-auto p-4">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="uppercase tracking-[0.35em] text-xs text-blue-200/70">
                  <th className="px-4 py-3 text-left">Agent</th>
                  <th className="px-4 py-3 text-right">Heures (mois)</th>
                  <th className="px-4 py-3 text-right">Ventes (mois)</th>
                  <th className="px-4 py-3 text-right">Ventes/heure</th>
                  <th className="px-4 py-3 text-right">Taux concret</th>
                  <th className="px-4 py-3 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/90">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-blue-100/70">Chargement…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-blue-100/70">Aucune vente enregistrée pour la période.</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const heures = hoursByAgent[row.label] ?? 140;
                    const vph = heures > 0 ? row.leadCount / heures : null;
                    const concret = heures > 0 ? row.leadCount / heures : null; // taux concret = ventes / heures (ex: ventes/140h)
                    const s = saving[row.label] || 'idle';
                    const isDirty = !!dirty[row.label];
                    return (
                      <tr key={`month-cal-${row.label}`} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-left font-semibold text-white">{row.label}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={heures}
                            onChange={(e) => setHoursFor(row.label, Math.max(0, Number(e.target.value)))}
                            onBlur={() => saveHoursFor(row.label)}
                            className={`w-28 rounded-lg border bg-slate-900/40 px-3 py-1.5 text-right text-white focus:border-cyan-300 focus:outline-none ${
                              isDirty ? 'border-cyan-400' : 'border-white/10'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">{formatNumber(row.leadCount)}</td>
                        <td className="px-4 py-3 text-right text-emerald-200">{vph !== null ? formatFloat(vph) : '—'}</td>
                        <td className="px-4 py-3 text-right text-emerald-100">{concret !== null ? formatFloat(concret) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {s === 'saving' && <span className="text-blue-200/80">Enregistrement…</span>}
                          {s === 'saved' && <span className="text-emerald-300">Enregistré</span>}
                          {s === 'error' && (
                            <span className="text-rose-300" title={saveError[row.label] || undefined}>
                              Erreur{saveError[row.label] ? `: ${saveError[row.label]}` : ''}
                            </span>
                          )}
                          {s === 'idle' && !isDirty && <span className="text-blue-200/60">—</span>}
                          {s === 'idle' && isDirty && <span className="text-cyan-300/90">Non enregistré</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/10 bg-white/5 px-4 py-2 text-xs text-blue-200/70">
            Par défaut 140h par agent pour le mois (modifiable ci-dessus). Les heures sont enregistrées automatiquement à la sortie du champ.
          </div>
        </div>
      </section>

      {/* Section journalière dédiée supprimée (fusion avec la table de productivité journalière ci-dessus) */}
    </div>
  );
};

export default SupervisorLeadsAgentStatsPage;
