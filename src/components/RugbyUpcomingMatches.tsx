// src/components/RugbyUpcomingMatches.tsx
import React, { useEffect, useState } from 'react';
import { groupMatchesByISOWeek } from '../services/matchesService';
import type { SportsMatch } from '../types/Match';
import { Loader2 } from 'lucide-react';

interface RugbyUpcomingMatchesProps {
  daysWindow?: number; // nombre de jours à afficher
}

const RugbyUpcomingMatches: React.FC<RugbyUpcomingMatchesProps> = ({ daysWindow = 21 }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<SportsMatch[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const bases: string[] = [];
        const isLocal = window.location.hostname.includes('localhost') || window.location.hostname === '127.0.0.1';
        if (isLocal) {
          // Emulateur Functions format: http://localhost:5001/<project>/<region>
            bases.push('http://localhost:5001/cactus-mm/europe-west9');
        }
        bases.push('https://europe-west9-cactus-mm.cloudfunctions.net');

        let data: SportsMatch[] | null = null;
        let lastErr: any = null;
        for (const b of bases) {
          try {
            const resp = await fetch(`${b}/top14Schedule`, { method: 'GET' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            data = (json.matches || []).map((m: any) => ({
              id: m.id,
              sport: m.sport,
              competition: m.competition,
              round: m.round,
              startTime: new Date(m.startTime),
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              channel: m.channel,
              status: m.status,
            }));
            break; // Succès -> stop boucle
          } catch (err) {
            lastErr = err;
            continue;
          }
        }

        if (!data) {
          // Fallback statique minimal pour ne pas casser l'UI
          const now = new Date();
          const d = (offsetDays: number, h: number, m: number) => {
            const dt = new Date(now);
            dt.setDate(dt.getDate() + offsetDays);
            dt.setHours(h, m, 0, 0);
            return dt;
          };
          data = [
            { id: 'fallback1', sport: 'rugby', competition: 'TOP14', round: 'J?', startTime: d(2, 16, 35), homeTeam: 'Stade Toulousain', awayTeam: 'RC Toulon', channel: 'CANAL+ SPORT', status: 'scheduled' },
            { id: 'fallback2', sport: 'rugby', competition: 'TOP14', round: 'J?', startTime: d(3, 21, 5), homeTeam: 'Racing 92', awayTeam: 'Stade Français', channel: 'CANAL+ FOOT', status: 'scheduled' },
          ];
          if (lastErr) {
            console.warn('[RugbyUpcomingMatches] Toutes les tentatives ont échoué, fallback statique utilisé', lastErr);
          }
        }

        const now = new Date();
        const end = new Date();
        end.setDate(end.getDate() + daysWindow);
        const filtered = data.filter(m => m.startTime >= now && m.startTime <= end);
        if (mounted) setMatches(filtered);
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Erreur chargement matchs');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [daysWindow]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-white/70"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des matchs de rugby...</div>;
  }
  if (error) {
    return <div className="text-sm text-red-300">{error}</div>;
  }
  if (!matches.length) {
    return <div className="text-sm text-white/60">Aucun match à venir sur la période.</div>;
  }

  const grouped = groupMatchesByISOWeek(matches);

  return (
    <div className="space-y-6">
      {grouped.map(group => (
        <div key={group.weekKey} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <h4 className="text-sm font-semibold text-white/90">Semaine {group.weekKey}</h4>
          </div>
          <ul className="space-y-2">
            {group.matches.map(m => {
              const dateStr = m.startTime.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
              const timeStr = m.startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
              return (
                <li key={m.id} className="relative group">
                  <div className="pl-3 pr-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <span className="font-mono text-[11px] text-emerald-300">{dateStr}</span>
                      <span className="font-mono text-[11px] text-emerald-100">{timeStr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white leading-tight">
                        {m.homeTeam} <span className="text-cactus-300/60">vs</span> {m.awayTeam}
                      </p>
                      <p className="text-[11px] text-white/60 mt-0.5 flex flex-wrap gap-2">
                        {m.competition && <span>{m.competition}</span>}
                        {m.channel && <span className="text-emerald-200/80">• {m.channel}</span>}
                        {m.round && <span className="bg-emerald-500/20 text-emerald-100 px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide">{m.round}</span>}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default RugbyUpcomingMatches;