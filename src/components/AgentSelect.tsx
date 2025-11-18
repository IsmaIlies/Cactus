import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * AgentSelect (combobox) replaces a plain <select> with:
 * - Typeahead filtering
 * - Keyboard navigation (ArrowUp/Down, Enter, Escape)
 * - Clear button
 * - Counts per agent (passed via stats map)
 * - Accessible ARIA roles
 */
export interface AgentSelectProps {
  agents: string[]; // includes '__ALL__'
  value: string;
  onChange: (val: string) => void;
  stats?: Record<string, { total: number; pending?: number; approved?: number; rejected?: number }>; // optional counts
  placeholder?: string;
  className?: string;
}

const normalizeLabel = (a: string) => a === '__ALL__' ? 'Tous les agents' : a;

export const AgentSelect: React.FC<AgentSelectProps> = ({
  agents,
  value,
  onChange,
  stats,
  placeholder = 'Rechercher un agent…',
  className = ''
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const listId = React.useId();

  // Dynamic dropdown metrics (direction + maxHeight)
  const [dropMetrics, setDropMetrics] = React.useState<{ direction: 'down' | 'up'; maxHeight: number; offsetY: number }>({ direction: 'down', maxHeight: 224, offsetY: 0 });

  // Respect prefers-reduced-motion
  const prefersReducedMotion = useReducedMotion();

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  // Derived filtered list
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a => normalizeLabel(a).toLowerCase().includes(q));
  }, [agents, query]);

  // Keyboard navigation index
  const [activeIdx, setActiveIdx] = React.useState<number>(-1);
  React.useEffect(() => { setActiveIdx(filtered.findIndex(a => a === value)); }, [filtered, value]);

  const commit = (val: string) => {
    onChange(val); setOpen(false); setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true); e.preventDefault(); return;
    }
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
      listRef.current?.children?.[Math.min(filtered.length - 1, activeIdx + 1)]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1));
      listRef.current?.children?.[Math.max(0, activeIdx - 1)]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault(); if (activeIdx >= 0 && activeIdx < filtered.length) commit(filtered[activeIdx]);
    }
  };

  // Recompute metrics when opening
  React.useLayoutEffect(() => {
    if (!open) return;
    const btn = rootRef.current?.querySelector('button');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - 16; // margin bottom
    const spaceAbove = rect.top - 16; // margin top
    let direction: 'down' | 'up' = 'down';
    let desiredCap = 260; // slightly reduced for better visibility
    let maxHeight = Math.min(desiredCap, spaceBelow - 8); // desired cap
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      direction = 'up';
      maxHeight = Math.min(desiredCap, spaceAbove - 8);
    }
    maxHeight = Math.max(160, maxHeight); // minimum visual height
    // Upward offset if we open downward but don't have full desiredCap space
    let offsetY = 0;
    if (direction === 'down' && spaceBelow < desiredCap) {
      offsetY = Math.max(0, desiredCap - spaceBelow - 12); // shift up a bit
      offsetY = Math.min(offsetY, 40); // cap shift for aesthetics
    }
    setDropMetrics({ direction, maxHeight, offsetY });
  }, [open]);

  return (
    <div ref={rootRef} className={`relative text-xs ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-[3px] leading-tight rounded bg-white text-black text-left w-80 border border-black/10 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
      >
        <span className="truncate flex-1">{normalizeLabel(value)}</span>
        <span className="text-gray-500 text-[10px] uppercase tracking-wide">Agents</span>
        <svg width="14" height="14" viewBox="0 0 20 20" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path fill="currentColor" d="M5.5 7l4.5 5 4.5-5z" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92, y: dropMetrics.direction === 'down' ? -4 : 4 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: dropMetrics.direction === 'down' ? -4 : 4 }}
            transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 20, mass: 0.5 }}
            className={`absolute z-30 w-80 bg-black/90 backdrop-blur border border-white/15 rounded-lg shadow-lg p-2 ${dropMetrics.direction==='down' ? 'mt-0 origin-top' : 'bottom-full mb-1 origin-bottom'}`}
            style={{ maxHeight: dropMetrics.maxHeight, transform: dropMetrics.direction==='down' ? `translateY(${(-1 - dropMetrics.offsetY)}px)` : undefined }}
          >
            <div className="flex items-center gap-1 mb-2">
              <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(-1); }}
                placeholder={placeholder}
                className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                aria-label="Filtrer agents"
              />
              {query && (
                <button onClick={() => setQuery('')} className="px-2 py-1 text-[10px] rounded bg-white/10 hover:bg-white/15 border border-white/20 text-white">Effacer</button>
              )}
            </div>
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              aria-label="Liste des agents"
              className="overflow-y-auto scroll-beauty text-white divide-y divide-white/5 pr-1"
              style={{ maxHeight: dropMetrics.maxHeight - 46 }}
            >
              {filtered.length === 0 && (
                <li className="py-2 text-center text-white/60 text-xs">Aucun résultat</li>
              )}
              {filtered.map((a, i) => {
                const stat = stats?.[a];
                const label = normalizeLabel(a);
                const selected = value === a;
                const optionId = `${listId}-opt-${i}`;
                return (
                  <motion.li
                    key={a}
                    id={optionId}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(e) => { e.preventDefault(); commit(a); }}
                    onMouseEnter={() => setActiveIdx(i)}
                    initial={prefersReducedMotion ? false : { opacity: 0, x: -6 }}
                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15, delay: i * 0.015 }}
                    className={`group cursor-pointer px-2 py-1.5 flex items-center gap-2 rounded-md text-xs transition-colors ${selected ? 'bg-emerald-600/40' : activeIdx===i ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500/40 to-emerald-600/50 flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {label.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 truncate" title={label}>{label}</span>
                    {stat && (
                      <span className="flex items-center gap-1 text-[10px] text-white/60">
                        {stat.pending!=null && <span className="px-1 rounded bg-yellow-500/20 text-yellow-200" title="En cours">{stat.pending}</span>}
                        {stat.approved!=null && <span className="px-1 rounded bg-emerald-500/25 text-emerald-200" title="Validées">{stat.approved}</span>}
                        {stat.rejected!=null && stat.rejected>0 && <span className="px-1 rounded bg-red-500/40 text-red-100" title="Refusées">{stat.rejected}</span>}
                      </span>
                    )}
                  </motion.li>
                );
              })}
            </ul>
            {/* Bottom fade overlay for visual limit */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/90 to-transparent rounded-b-lg" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AgentSelect;
