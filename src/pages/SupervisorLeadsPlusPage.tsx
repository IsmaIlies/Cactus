import React from 'react';
import { useParams } from 'react-router-dom';
import { subscribeToLeadKpis, type LeadKpiSnapshot } from '../leads/services/leadsSalesService';

type LeadsStats = {
  dolead: number;
  hipto: number;
};

const INITIAL_STATS: LeadsStats = { dolead: 0, hipto: 0 };

const SupervisorLeadsPlusPage: React.FC = () => {
  const [apiRaw, setApiRaw] = React.useState<any>(null);
  const [leadCount, setLeadCount] = React.useState<number | null>(null);
  const [leadType, setLeadType] = React.useState<string | null>(null);

  React.useEffect(() => {
    const isLocal = typeof window !== 'undefined' && (window.location.origin.includes('localhost:5173') || window.location.hostname === '127.0.0.1');
    const url = isLocal
      ? '/vendor/leads-stats?token=b7E8g2QEBh8jz7eF57uT'
      : 'https://orange-leads.mm.emitel.io/stats-lead.php?token=b7E8g2QEBh8jz7eF57uT';
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setApiRaw(data);
        if (Array.isArray(data.DATA) && data.DATA.length > 0) {
          setLeadCount(data.DATA[0].count);
          setLeadType(data.DATA[0].type);
        } else {
          setLeadCount(null);
          setLeadType(null);
        }
      })
      .catch(() => {
        setApiRaw(null);
        setLeadCount(null);
        setLeadType(null);
      });
  }, []);
  const { area } = useParams<{ area: string }>();
  const normalizedArea = (area || '').toLowerCase();

  const [stats, setStats] = React.useState<LeadsStats>(INITIAL_STATS);
  const [kpiSnapshot, setKpiSnapshot] = React.useState<LeadKpiSnapshot | null>(null);
  const [caDraft, setCaDraft] = React.useState<Record<'dolead' | 'hipto', string>>({
    dolead: '',
    hipto: '',
  });
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>('');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.origin.includes('localhost:5173') || window.location.hostname === '127.0.0.1');
      const url = isLocal
        ? '/vendor/leads-stats?token=b7E8g2QEBh8jz7eF57uT'
        : 'https://orange-leads.mm.emitel.io/stats-lead.php?token=b7E8g2QEBh8jz7eF57uT';
      const response = await fetch(url);
      const json = await response.json();
      setApiRaw(json);
      let dolead = 0;
      let hipto = 0;
      if (typeof json?.dolead === 'number' && typeof json?.hipto === 'number') {
        dolead = Number(json.dolead) || 0;
        hipto = Number(json.hipto) || 0;
      } else if (json?.RESPONSE === 'OK' && Array.isArray(json?.DATA)) {
        const findCount = (t: string) => {
          const it = json.DATA.find((x: any) => String(x?.type).toLowerCase() === t);
          return it && typeof it.count === 'number' ? it.count : 0;
        };
        dolead = Number(findCount('dolead')) || 0;
        hipto = Number(findCount('hipto')) || 0;
      } else {
        throw new Error('Format de réponse inattendu');
      }
      setStats({ dolead, hipto });
      if (Array.isArray(json?.DATA) && json.DATA.length > 0) {
        setLeadCount(json.DATA[0].count ?? null);
        setLeadType(json.DATA[0].type ?? null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : 'Erreur inconnue (CORS ?)';
      setError(message);
      setStats(INITIAL_STATS);
      setApiRaw(null);
      setLeadCount(null);
      setLeadType(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // TODO: ajouter des filtres date_start/date_end via querystring.

  React.useEffect(() => {
    if (normalizedArea !== 'leads') {
      setKpiSnapshot(null);
      return;
    }
    const unsubscribe = subscribeToLeadKpis((snapshot) => {
      setKpiSnapshot(snapshot);
    });
    return () => {
      try {
        unsubscribe && unsubscribe();
      } catch {
        // noop
      }
    };
  }, [normalizedArea]);

  if (normalizedArea !== 'leads') {
    return (
      <div className="p-6 text-sm text-rose-200">
        Accès réservé — sélectionne l'espace Leads pour consulter la page Leads+.
      </div>
    );
  }

  const safeSnapshot: LeadKpiSnapshot = kpiSnapshot || {
    hipto: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
    dolead: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
    mm: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
  };

  const totalLeads = stats.dolead + stats.hipto;

  const originCards = [
    { key: 'dolead' as const, label: 'Dolead', leads: stats.dolead, kpi: safeSnapshot.dolead },
    { key: 'hipto' as const, label: 'Hipto', leads: stats.hipto, kpi: safeSnapshot.hipto },
  ];

  const handleExport = React.useCallback(
    async (
      origin: 'dolead' | 'hipto',
      label: string,
      leads: number,
      internetSales: number,
      mobileSales: number,
      internetRate: number,
      caValue: number,
      caRate: number
    ) => {
      try {
        const { default: JsPDF } = await import('jspdf');
        const doc = new JsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        const width = doc.internal.pageSize.getWidth();
        const primary = '#0f172a';
        const accent = '#0ea5e9';
        const emerald = '#10b981';

        doc.setFillColor(3, 7, 18);
        doc.rect(0, 0, width, 120, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor('#f8fafc');
        doc.text('CACTUS LABS', 40, 55);

        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`Leads+ — ${label}`, 40, 82);
        doc.setFontSize(10);
        doc.text(`Rapport généré le ${new Date().toLocaleString('fr-FR')}`, 40, 100);

        let y = 150;
        const lineGap = 40;

        const drawBlock = (titleText: string, value: string, subtitle?: string) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(accent);
          doc.text(titleText.toUpperCase(), 40, y);

          doc.setFontSize(22);
          doc.setTextColor(primary);
          doc.text(value, width - 40, y, { align: 'right' });

          if (subtitle) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor('#475569');
            doc.text(subtitle, 40, y + 18);
          }
          y += subtitle ? lineGap : lineGap - 10;
        };

        drawBlock('Volume ventes internet', internetSales.toLocaleString('fr-FR'), 'Inclut offres Sosh');
        drawBlock('Volume ventes mobile', mobileSales.toLocaleString('fr-FR'), 'Inclut offres Sosh');
        drawBlock('Taux ventes internet', `${internetRate.toFixed(1)} %`, 'Ventes internet / Leads reçus');
        drawBlock(
          'Taux CA / Lead du jour',
          caValue ? `${caRate.toFixed(1)} %` : '—',
          caValue ? `Contacts argumentés saisis : ${caValue.toLocaleString('fr-FR')}` : 'Saisissez le CA dans la carte pour alimenter ce taux'
        );
        drawBlock('Leads reçus', leads.toLocaleString('fr-FR'));

        doc.setDrawColor(emerald);
        doc.setLineWidth(1);
        doc.line(40, y + 10, width - 40, y + 10);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#64748b');
        doc.text('Confidentiel — Cactus Labs', 40, doc.internal.pageSize.getHeight() - 40);

        doc.save(`leads-${origin}-${new Date().toISOString().slice(0, 10)}.pdf`);
      } catch (error) {
        console.error('Export PDF Leads+ échoué', error);
        alert('Impossible de générer le PDF. Vérifie que la dépendance "jspdf" est installée.');
      }
    },
    []
  );

  return (
    <div className="space-y-6 p-6 text-white">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads+</h1>
          <p className="text-blue-200/80 text-sm">
            Suivi des volumes Leads par origine. Chiffres agrégés sur la journée en cours.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-blue-200/80">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
              Total leads jour : <strong className="text-white">{loading ? '…' : totalLeads.toLocaleString('fr-FR')}</strong>
            </span>
            {leadCount != null && leadType ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/5 px-3 py-1">
                Source API : {leadType} ({leadCount})
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-100 shadow-[0_12px_32px_rgba(16,185,129,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            aria-label="Mettre à jour les statistiques leads"
          >
            {loading ? (
              <span className="relative h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-transparent" aria-hidden="true" />
            ) : (
              <span className="relative h-4 w-4 rounded-full border-2 border-emerald-200" aria-hidden="true" />
            )}
            Mettre à jour
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {originCards.map(({ key, label, leads, kpi }) => {
          const internetSales = kpi.box;
          const mobileSales = kpi.mobiles;
          const internetRate = leads > 0 ? (internetSales / leads) * 100 : 0;
          const caInput = caDraft[key] || '';
          const caValue = Number.parseFloat(caInput.replace(/,/g, '.')) || 0;
          const caRate = leads > 0 ? (caValue / leads) * 100 : 0;
          return (
            <article
              key={key}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1c3a]/80 via-[#0a1730]/80 to-[#071122]/80 p-6 shadow-[0_22px_55px_rgba(8,20,40,0.55)] transition duration-300 hover:-translate-y-1 hover:border-emerald-300/50 hover:shadow-[0_28px_65px_rgba(45,212,191,0.32)]"
            >
              <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(6,182,212,0.2),transparent_60%)] transition duration-300 group-hover:opacity-55 group-hover:scale-105" />
              <div className="relative flex h-full flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-blue-200/70">Origine</p>
                    <h2 className="text-xl font-semibold text-white">{label}</h2>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-100">
                    Jour J
                  </span>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      handleExport(
                        key,
                        label,
                        leads,
                        internetSales,
                        mobileSales,
                        internetRate,
                        caValue,
                        caRate
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-500/20"
                  >
                    Export PDF
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-white/10 bg-blue-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-blue-200/60">Leads reçus</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{loading ? '…' : leads.toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-100/70">Ventes internet</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{internetSales.toLocaleString('fr-FR')}</p>
                    <p className="text-[11px] text-emerald-100/70">Dont Sosh : {kpi.internetSosh}</p>
                  </div>
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-sky-100/70">Ventes mobile</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{mobileSales.toLocaleString('fr-FR')}</p>
                    <p className="text-[11px] text-sky-100/70">Dont Sosh : {kpi.mobileSosh}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-blue-200/60">Taux internet</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{leads > 0 ? `${internetRate.toFixed(1)} %` : '—'}</p>
                    <p className="text-[11px] text-blue-100/70">Ventes internet / Leads</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-amber-100/70">Contacts argumentés</p>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={caInput}
                      onChange={(e) =>
                        setCaDraft((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-md border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-base font-semibold text-white placeholder:text-amber-200/60 focus:border-amber-200 focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-amber-100/70">Taux CA / Leads</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{caInput ? `${caRate.toFixed(1)} %` : '—'}</p>
                    <p className="text-[11px] text-amber-100/70">CA saisi / Leads reçus</p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default SupervisorLeadsPlusPage;
