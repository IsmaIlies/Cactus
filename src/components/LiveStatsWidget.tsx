import React, { useEffect, useRef, useState, useCallback } from 'react';

interface LiveStatsWidgetProps {
  personalToday: number;
  teamToday: number;
  personalMonth: number;
  teamMonth: number;
  streakDays?: number | null; // jours consécutifs avec au moins 1 vente
  conversionPct?: number | null; // taux de conversion (si calculable)
}

const PREF_KEY = 'liveStatsWidgetPrefs';

type WidgetPrefs = {
  showConversion: boolean;
  showStreak: boolean;
  size: 'sm' | 'md' | 'lg';
  locked: boolean;
};

const defaultPrefs: WidgetPrefs = {
  showConversion: true,
  showStreak: true,
  size: 'md',
  locked: false,
};

const loadPrefs = (): WidgetPrefs => {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...JSON.parse(raw) };
  } catch {
    return defaultPrefs;
  }
};

const savePrefs = (p: WidgetPrefs) => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
};

const LiveStatsWidget: React.FC<LiveStatsWidgetProps> = ({
  personalToday,
  teamToday,
  personalMonth,
  teamMonth,
  streakDays,
  conversionPct,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const widgetOrigin = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [closed, setClosed] = useState(false);
  const [prefs, setPrefs] = useState<WidgetPrefs>(() => loadPrefs());
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Initial position (bottom-right)
  useEffect(() => {
    const width = 220;
    const height = 210;
    setOffset({ x: window.innerWidth - width - 16, y: window.innerHeight - height - 16 });
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Constrain & snap logic
  const clampAndSnap = useCallback((raw: { x: number; y: number }, width: number, height: number) => {
    const margin = 8;
    const maxX = window.innerWidth - width - margin;
    const maxY = window.innerHeight - height - margin;
    let x = Math.min(Math.max(raw.x, margin), maxX);
    let y = Math.min(Math.max(raw.y, margin), maxY);
    // Snap to nearest edge (left/right/top/bottom) if within threshold or choose closest
    const distances = [
      { edge: 'left', d: x },
      { edge: 'right', d: Math.abs(window.innerWidth - width - x) },
      { edge: 'top', d: y },
      { edge: 'bottom', d: Math.abs(window.innerHeight - height - y) },
    ];
    const nearest = distances.reduce((a, b) => (b.d < a.d ? b : a));
    const snapThreshold = 40;
    if (nearest.d <= snapThreshold) {
      switch (nearest.edge) {
        case 'left': x = margin; break;
        case 'right': x = maxX; break;
        case 'top': y = margin; break;
        case 'bottom': y = maxY; break;
      }
    }
    return { x, y };
  }, []);

  // Persist prefs
  useEffect(() => { savePrefs(prefs); }, [prefs]);

  // Drag events
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging || prefs.locked) return;
      const width = minimized ? 60 : 220;
      const height = minimized ? 60 : computeHeight(prefs.size, minimized);
      const newPos = {
        x: widgetOrigin.current.x + (e.clientX - dragOrigin.current.x),
        y: widgetOrigin.current.y + (e.clientY - dragOrigin.current.y),
      };
      const constrained = clampAndSnap(newPos, width, height);
      setOffset(constrained);
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dragging, clampAndSnap, minimized]);

  const onDragStart = (e: React.MouseEvent) => {
    if (prefs.locked) return;
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    widgetOrigin.current = { x: rect.left, y: rect.top };
    setDragging(true);
  };

  const pct = teamMonth > 0 ? Math.round((personalMonth / teamMonth) * 100) : 0;

  const baseClasses = isDark
    ? 'bg-gradient-to-br from-slate-800 via-slate-900 to-black text-slate-200 border-cyan-500/30'
    : 'bg-white/90 text-slate-800 border-cyan-300 shadow';

  const sizeConfig = {
    sm: { width: 'w-48', scaleTxt: 'text-[11px]', barH: 'h-1.5', padding: 'p-2 pt-1.5', headerPad: 'px-2 py-1', statGap: 'space-y-0.5' },
    md: { width: 'w-56', scaleTxt: 'text-xs', barH: 'h-2', padding: 'p-3 pt-2', headerPad: 'px-3 py-1.5', statGap: 'space-y-1' },
    lg: { width: 'w-64', scaleTxt: 'text-[13px]', barH: 'h-2.5', padding: 'p-4 pt-3', headerPad: 'px-4 py-2', statGap: 'space-y-1.5' },
  } as const;
  const cfg = sizeConfig[prefs.size];

  function computeHeight(size: WidgetPrefs['size'], isMin: boolean) {
    if (isMin) return 60;
    switch (size) {
      case 'sm': return 185;
      case 'md': return 210;
      case 'lg': return 240;
    }
  }

  if (closed) return null; // Simple close (peut être amélioré avec un bouton de rappel externe)

  // Compact circular mode
  if (minimized) {
    return (
      <div
        ref={ref}
        className={`fixed z-[150] w-14 h-14 rounded-full ${baseClasses} backdrop-blur-md border flex flex-col items-center justify-center cursor-pointer select-none`}
        style={{ left: offset.x, top: offset.y }}
        onClick={() => setMinimized(false)}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-cyan-500">Jour</span>
        <span className="text-lg font-bold text-cyan-600 dark:text-cyan-300">{personalToday}</span>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`fixed select-none z-[150] ${cfg.width} rounded-xl ${baseClasses} backdrop-blur-md border shadow-lg ${cfg.scaleTxt}`} 
      style={{ left: offset.x, top: offset.y }}
    >
      {/* Header / drag handle */}
      <div
        ref={dragHandleRef}
        onMouseDown={onDragStart}
        className={`flex items-center justify-between ${cfg.headerPad} ${prefs.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} rounded-t-xl bg-gradient-to-r from-cyan-600/70 to-blue-700/60 text-white`}
      >
        <span className="font-semibold tracking-wide">Stats Live</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }}
            aria-label="Menu"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-sm"
          >
            ⋮
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
            aria-label="Réduire"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-sm"
          >
            –
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setClosed(true); }}
            aria-label="Fermer"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 text-sm"
          >
            ×
          </button>
          {menuOpen && (
            <div className="absolute top-full right-0 mt-1 w-56 rounded-md bg-slate-800/95 dark:bg-slate-900/95 border border-cyan-500/30 shadow-xl p-2 text-[11px] z-10 backdrop-blur-md">
              <div className="font-semibold text-cyan-300 mb-1">Personnalisation</div>
              <div className="space-y-1">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.showConversion}
                    onChange={() => setPrefs(p => ({ ...p, showConversion: !p.showConversion }))}
                  />
                  <span>Taux conversion</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.showStreak}
                    onChange={() => setPrefs(p => ({ ...p, showStreak: !p.showStreak }))}
                  />
                  <span>Streak</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.locked}
                    onChange={() => setPrefs(p => ({ ...p, locked: !p.locked }))}
                  />
                  <span>Verrouiller position</span>
                </label>
                <div className="mt-2">
                  <div className="text-cyan-400 font-medium mb-1">Taille</div>
                  <div className="flex gap-1">
                    {(['sm','md','lg'] as const).map(sz => (
                      <button
                        key={sz}
                        onClick={() => setPrefs(p => ({ ...p, size: sz }))}
                        className={`px-2 py-0.5 rounded border text-[10px] ${prefs.size === sz ? 'bg-cyan-600 text-white border-cyan-400' : 'border-slate-600 hover:border-cyan-500'}`}
                      >{sz}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={`${cfg.padding} ${cfg.statGap}`}>
        <div className="flex justify-between">
          <span>Moi (jour)</span>
          <span className="font-medium text-cyan-600 dark:text-cyan-300">{personalToday}</span>
        </div>
        <div className="flex justify-between">
          <span>Équipe (jour)</span>
          <span className="font-medium">{teamToday}</span>
        </div>
        <div className="flex justify-between">
          <span>Moi (mois)</span>
          <span className="font-medium text-cyan-600 dark:text-cyan-300">{personalMonth}</span>
        </div>
        <div className="flex justify-between">
          <span>Équipe (mois)</span>
          <span className="font-medium">{teamMonth}</span>
        </div>
        {prefs.showConversion && conversionPct != null && (
          <div className="flex justify-between">
            <span>Conversion</span>
            <span className="font-medium text-cyan-500">{conversionPct}%</span>
          </div>
        )}
        {prefs.showStreak && streakDays != null && (
          <div className="flex justify-between">
            <span>Série de ventes</span>
            <span className="font-medium">{streakDays}j</span>
          </div>
        )}
        <div className="mt-2">
          <div className={`${cfg.barH} bg-slate-200 dark:bg-slate-700 rounded`}>
            <div
              className={`${cfg.barH} rounded bg-cyan-500 transition-all`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="text-[10px] mt-1 text-right text-cyan-500 dark:text-cyan-400">
            {pct}% part perso
          </div>
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">Glisser la barre du haut</div>
      </div>
    </div>
  );
};

export default LiveStatsWidget;
