import React, { useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

interface TeamTvWallProps { onClose: () => void }

interface SaleEntry {
  id: string;
  name: string;
  offer: string;
  date: Date;
  consent?: string;
}

const OFFER_LABEL: Record<string,string> = {
  'canal': 'CANAL+',
  'canal-cine-series': 'Ciné Séries',
  'canal-sport': 'Sport',
  'canal-100': '100%',
};

const OFFER_COLOR: Record<string,string> = {
  'canal': 'from-cyan-500 to-blue-600',
  'canal-cine-series': 'from-fuchsia-500 to-purple-600',
  'canal-sport': 'from-emerald-500 to-teal-600',
  'canal-100': 'from-amber-400 to-orange-600',
};

const isToday = (dateLike: any) => {
  if (!dateLike) return false;
  let d: Date | null = null;
  if (dateLike instanceof Date) d = dateLike;
  else if (dateLike?.toDate) d = dateLike.toDate();
  else if (typeof dateLike === 'string') d = new Date(dateLike);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const TeamTvWall: React.FC<TeamTvWallProps> = ({ onClose }) => {
  const [sales, setSales] = useState<SaleEntry[]>([]);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const playIntro = useRef(true);

  useEffect(() => {
    const col = collection(db, 'sales');
    const qRef = query(col, orderBy('date', 'desc'), limit(150));
    const unsubscribe = onSnapshot(qRef, snap => {
      const todaySales = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(rec => isToday(rec.date) && (rec.consent === 'yes' || rec.consent === undefined))
        .map(rec => ({
          id: rec.id,
          name: rec.userName || rec.name || 'Inconnu',
          offer: rec.offer || 'canal',
          date: rec.date?.toDate ? rec.date.toDate() : new Date(rec.date),
          consent: rec.consent
        })) as SaleEntry[];
      todaySales.sort((a,b)=> b.date.getTime() - a.date.getTime());
      if (playIntro.current) {
        setSales(todaySales.slice(0,80));
        playIntro.current = false;
      } else {
        setSales(prev => {
          const prevIds = new Set(prev.map(p=>p.id));
          const newOnes = todaySales.filter(s=> !prevIds.has(s.id));
          if (newOnes.length) {
            setHighlightIds(hPrev => {
              const next = new Set(hPrev); newOnes.forEach(n=> next.add(n.id));
              setTimeout(()=>{ setHighlightIds(remPrev => { const c = new Set(remPrev); newOnes.forEach(n=> c.delete(n.id)); return c; }); },6000);
              return next;
            });
          }
          return todaySales.slice(0,80);
        });
      }
    }, err => {
      console.error('[TeamTvWall] erreur snapshot', err);
    });
    return () => unsubscribe();
  }, []);

  const formatTime = (d: Date) => d.toLocaleTimeString('fr-FR',{ hour:'2-digit', minute:'2-digit', second:'2-digit'});

  return (
    <div className="fixed inset-0 z-[260] font-[Inter]">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[#020617] bg-[radial-gradient(circle_at_50%_50%,#0f1f38_0%,#020617_70%)]" />
      <div className="absolute inset-0 opacity-30 mix-blend-screen bg-[linear-gradient(115deg,#0e7490_0%,#1e3a8a_50%,#0f766e_100%)] animate-pulse" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-[200%] h-full opacity-[0.07] bg-[repeating-linear-gradient(transparent,transparent_38px,rgba(255,255,255,0.06)_40px)] animate-[scrollY_14s_linear_infinite]" />
      </div>

      {/* Header */}
      <div className="relative flex items-center justify-between px-10 py-6">
        <h1 className="text-3xl tracking-wide font-semibold text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)] uppercase flex items-center gap-4">
          <span className="text-cyan-400 font-bold">LIVE</span> Leaderboard Ventes — Aujourd'hui
        </h1>
        <button onClick={onClose} className="group relative px-5 py-2.5 text-sm font-semibold text-white rounded-md bg-gradient-to-r from-cyan-600 to-blue-700 shadow-[0_0_0_1px_rgba(34,211,238,0.4),0_0_18px_-2px_rgba(59,130,246,0.5)] hover:from-cyan-500 hover:to-blue-600 transition-all">
          <span className="relative z-10">Fermer ✕</span>
          <span className="absolute inset-0 rounded-md bg-gradient-to-r from-cyan-400/0 via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 blur-md transition-opacity" />
        </button>
      </div>

      {/* Table container */}
      <div className="relative h-[calc(100%-130px)] px-10 pb-10 flex flex-col">
        <div className="relative flex-1 rounded-2xl border border-cyan-400/30 bg-slate-900/40 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_0_30px_-6px_rgba(59,130,246,0.45)] overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.25),transparent_60%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.18),transparent_60%)]" />
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.06)_50%,rgba(255,255,255,0)_100%)] mix-blend-overlay" />
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-cyan-500/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-blue-900/40 to-transparent" />

          {/* Header row */}
          <div className="grid grid-cols-[70px_1fr_260px_160px] gap-4 px-8 py-3 text-xs uppercase tracking-wider text-cyan-300 font-semibold bg-slate-900/60 backdrop-blur border-b border-cyan-400/30">
            <div className="">Rang</div>
            <div>Vendeur</div>
            <div>Offre</div>
            <div className="text-right pr-2">Heure</div>
          </div>

          {/* Rows */}
          <div className="overflow-hidden relative flex-1">
            <div className="absolute inset-0 overflow-y-auto styled-scroll pr-2">
              <ul className="divide-y divide-cyan-400/15">
                {sales.length === 0 && (
                  <li className="px-8 py-6 text-center text-cyan-300/60 text-sm">Aucune vente aujourd'hui (consent yes). Ajoutez une vente pour tester.</li>
                )}
                {sales.map((s, idx) => {
                  const label = OFFER_LABEL[s.offer] || s.offer;
                  const color = OFFER_COLOR[s.offer] || 'from-cyan-600 to-blue-700';
                  const highlight = highlightIds.has(s.id);
                  const today = isToday(s.date);
                  return (
                    <li
                      key={s.id}
                      className={[
                        'relative group grid grid-cols-[70px_1fr_260px_160px] gap-4 items-center px-8 py-3 text-sm transition-all duration-700',
                        today ? 'text-slate-100' : 'text-slate-400/70',
                        highlight ? 'animate-rowEnter' : 'opacity-90 hover:opacity-100',
                      ].join(' ')}
                    >
                      <div className="font-mono text-cyan-300/90 text-base drop-shadow-[0_0_6px_rgba(34,211,238,0.35)]">
                        #{idx + 1}
                      </div>
                      <div className="font-semibold tracking-wide flex items-center gap-2">
                        {s.name}
                        {s.consent !== 'yes' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">pending</span>
                        )}
                      </div>
                      <div className="relative">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-md bg-gradient-to-r ${color} text-white text-xs font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_14px_-2px_rgba(34,211,238,0.55)]`}>{label}</div>
                        {highlight && <span className="absolute -inset-px rounded-md animate-pulseGlow bg-gradient-to-r from-cyan-400/40 to-blue-500/40 blur-sm" />}
                      </div>
                      <div className="text-right font-mono text-cyan-200/90 text-sm">{formatTime(s.date)}</div>
                      {highlight && (
                        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(34,211,238,0.08),rgba(59,130,246,0.08))] rounded-md" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer stats */}
        <div className="mt-6 flex items-center justify-between text-cyan-200/80 text-xs tracking-wider uppercase">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-cyan-300">Total du jour: {sales.length}</span>
            <span className="opacity-70">Dernière mise à jour en temps réel</span>
          </div>
          <div className="text-cyan-400/80">Mode TV • Appuyez sur Fermer pour quitter</div>
        </div>
      </div>

      {/* Styles additionnels */}
      <style>{`
        @keyframes rowEnter {0%{opacity:0; transform:translateY(-12px) scale(0.98);}60%{opacity:1; transform:translateY(2px) scale(1.01);}100%{opacity:1; transform:translateY(0) scale(1);} }
        @keyframes pulseGlow {0%,100%{opacity:.55;}50%{opacity:0.05;}}
        @keyframes scrollY {0%{transform:translateY(0);}100%{transform:translateY(-40px);} }
        .animate-rowEnter{animation:rowEnter .85s cubic-bezier(.4,.14,.2,1);}
        .animate-pulseGlow{animation:pulseGlow 2.4s ease-in-out infinite;}
        .styled-scroll::-webkit-scrollbar{width:8px;} .styled-scroll::-webkit-scrollbar-track{background:transparent;} .styled-scroll::-webkit-scrollbar-thumb{background:linear-gradient(to bottom,#0891b2,#0e7490);border-radius:8px;}
      `}</style>
    </div>
  );
};

export default TeamTvWall;
