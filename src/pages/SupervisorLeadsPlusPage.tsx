import React from 'react';
import { useParams } from 'react-router-dom';

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

  if (normalizedArea !== 'leads') {
    return (
      <div className="p-6 text-sm text-rose-200">
        Accès réservé — sélectionne l'espace Leads pour consulter la page Leads+.
      </div>
    );
  }

  const cards = [
    { key: 'dolead', label: 'Dolead', value: stats.dolead },
    { key: 'hipto', label: 'Hipto', value: stats.hipto },
  ] as const;

  return (
  <div className="space-y-6 p-6 text-white">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads+</h1>
          <p className="text-blue-200/80 text-sm">
            Suivi des volumes Leads par origine. Les chiffres sont affichés ci-dessous.
          </p>
          {/* ...infos Count, Type et JSON supprimées comme demandé... */}
        </div>
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
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <article
            key={card.key}
            className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0c1c3a]/80 via-[#0a1730]/80 to-[#071122]/80 p-6 shadow-[0_22px_55px_rgba(8,20,40,0.55)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_28px_65px_rgba(56,189,248,0.32)]"
          >
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(96,165,250,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.2),transparent_60%)] transition duration-300 group-hover:opacity-55 group-hover:scale-105" />
            <div className="relative flex h-full flex-col gap-3">
              <p className="text-xs uppercase tracking-[0.4em] text-blue-200/70">Origine</p>
              <h2 className="text-xl font-semibold text-white">{card.label}</h2>
              <p className="text-4xl font-bold text-white">
                {loading ? '…' : card.value.toLocaleString('fr-FR')}
              </p>
              <p className="text-sm text-blue-100/70">Leads reçus</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default SupervisorLeadsPlusPage;
