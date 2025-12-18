import React from "react";
import { ChevronRight, ChevronLeft, Route, Sparkles, CornerDownRight, Undo2, Redo2, Info, Clock, Map as MapIcon } from "lucide-react";

export type FlowOption = {
  label: string;
  nextId?: string; // if undefined => terminal/info
};

export type FlowNode = {
  id: string;
  title: string;
  text?: string;
  options?: FlowOption[];
  kind?: 'default' | 'checklist';
  checklistItems?: Array<{
    key: string;
    title: string;
    description?: string;
  }>;
};

type Props = {
  nodes: Record<string, FlowNode>;
  rootId: string;
};

/**
 * Simple decision-tree renderer for call scripts.
 * Clicking an option appends the next node below, creating an "architecture" view.
 */
const CallDecisionFlow: React.FC<Props> = ({ nodes, rootId }) => {
  const [path, setPath] = React.useState<string[]>([rootId]);
  const currentNodes = React.useMemo(() => path.map((id) => nodes[id]).filter(Boolean), [path, nodes]);
  const [checks, setChecks] = React.useState<Record<string, Record<string, boolean>>>({});
  // Manage per-item open/closed state for checklist descriptions without hooks-in-loops
  const [openItems, setOpenItems] = React.useState<Record<string, Record<string, boolean>>>({});
  // Keyboard focus for the last node options
  const [activeOption, setActiveOption] = React.useState<number>(0);
  // History stacks for undo/redo
  const [undoStack, setUndoStack] = React.useState<string[][]>([]);
  const [redoStack, setRedoStack] = React.useState<string[][]>([]);
  // Per-node notes
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  // Toast message
  const lastNodeRef = React.useRef<HTMLDivElement | null>(null);
  const [mapOpen, setMapOpen] = React.useState<boolean>(false);

  const goTo = (nextId: string | undefined, index: number) => {
    if (!nextId) return; // terminal option
    // truncate after index and append nextId
    const newPath = path.slice(0, index + 1);
    setUndoStack((prev) => [...prev, path]);
    setRedoStack([]);
    newPath.push(nextId);
    setPath(newPath);
    setActiveOption(0);
  };

  const backTo = (index: number) => {
    if (index < 0) return;
    setUndoStack((prev) => [...prev, path]);
    setRedoStack([]);
    setPath(path.slice(0, index + 1));
  };

  const reset = () => {
    setUndoStack((prev) => [...prev, path]);
    setRedoStack([]);
    setPath([rootId]);
    setActiveOption(0);
  };

  const undo = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const prevPath = prev[prev.length - 1];
      setRedoStack((r) => [path, ...r]);
      setPath(prevPath);
      setActiveOption(0);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const nextPath = prev[0];
      setUndoStack((u) => [...u, path]);
      setPath(nextPath);
      setActiveOption(0);
      return prev.slice(1);
    });
  };

  // Keyboard navigation on the last node
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const lastIdx = currentNodes.length - 1;
      if (lastIdx < 0) return;
      const last = currentNodes[lastIdx];
      const opts = last.options || [];
      if (opts.length === 0) {
        if (e.key === "Backspace") {
          e.preventDefault();
          backTo(Math.max(0, lastIdx - 1));
        }
        return;
      }
      // numeric selection 1..9
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < opts.length) {
          e.preventDefault();
          goTo(opts[idx].nextId, lastIdx);
          return;
        }
      }
      // undo/redo shortcuts
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        redo();
        return;
      }
      if (["ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        setActiveOption((prev) => (prev + 1) % opts.length);
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setActiveOption((prev) => (prev - 1 + opts.length) % opts.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = opts[activeOption];
        if (chosen) goTo(chosen.nextId, lastIdx);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backTo(Math.max(0, lastIdx - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentNodes, activeOption]);

  // Persist/restore path in sessionStorage
  React.useEffect(() => {
    try {
      const key = `callFlowPath:${rootId}`;
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length && arr[0] === rootId) {
          setPath(arr);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    try {
      const key = `callFlowPath:${rootId}`;
      sessionStorage.setItem(key, JSON.stringify(path));
    } catch {}
  }, [path, rootId]);

  // Auto-scroll to last node
  React.useEffect(() => {
    if (lastNodeRef.current) {
      lastNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [path]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between sticky top-0 z-10 bg-white/80 backdrop-blur border border-emerald-100 rounded-lg px-3 py-2">
        <h3 className="text-lg font-semibold text-black flex items-center gap-2"><Route className="h-4 w-4 text-emerald-700" /> Arborescence du script</h3>
        <div className="flex items-center gap-1">
          <span className="hidden md:flex items-center gap-1 text-xs text-gray-600 mr-2"><Info className="h-3.5 w-3.5" /> Flèches, Entrée, ⌫, 1..9, Ctrl+Z/Y</span>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-gray-700 mr-2"><Clock className="h-3.5 w-3.5" /> {currentNodes.length} étape(s)</span>
          <button type="button" onClick={undo} disabled={!canUndo} title="Annuler (Ctrl+Z)" className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-black inline-flex items-center gap-1"><Undo2 className="h-4 w-4" />Annuler</button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Rétablir (Ctrl+Y)" className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-black inline-flex items-center gap-1"><Redo2 className="h-4 w-4" />Rétablir</button>
          <button type="button" onClick={() => setMapOpen((v) => !v)} title="Mini-carte du parcours" className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-black inline-flex items-center gap-1"><MapIcon className="h-4 w-4" />Carte</button>
          <button type="button" onClick={reset} className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-black">Réinitialiser</button>
        </div>
      </div>

      {/* Breadcrumb path */}
      <div className="w-full overflow-x-auto">
        <nav className="flex items-center gap-1 min-w-max px-1 py-1.5 rounded-md bg-emerald-50/60 border border-emerald-100">
          {currentNodes.map((n, i) => (
            <div key={n.id} className="flex items-center">
              <button
                type="button"
                onClick={() => backTo(i)}
                className={`text-xs md:text-[13px] px-2 py-1 rounded-full border transition-all ${i === currentNodes.length - 1 ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-emerald-200 text-emerald-900 hover:bg-emerald-50'}`}
                aria-current={i === currentNodes.length - 1 ? 'page' : undefined}
                title={`Aller à l'étape ${i + 1}`}
              >
                {i + 1}. {n.title}
              </button>
              {i < currentNodes.length - 1 && (
                <ChevronRight className="mx-1 h-4 w-4 text-emerald-500" />
              )}
            </div>
          ))}
        </nav>
      </div>
      {currentNodes.map((node, idx) => (
        <div key={node.id} ref={idx === currentNodes.length - 1 ? lastNodeRef : null} className="relative anim-soft-in" style={{ animationDelay: `${idx * 80}ms` }}>
          <div className="rounded-2xl border border-emerald-200 bg-white/80 backdrop-blur p-5 shadow-lg transition duration-300 will-change-transform hover:shadow-xl hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center px-2 py-1 rounded-full text-[11px] uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-200">Étape {idx + 1}</div>
                <h4 className="text-base font-semibold text-gray-900">{node.title}</h4>
              </div>
              {idx > 0 && (
                <button type="button" onClick={() => backTo(idx - 1)} className="inline-flex items-center gap-1 text-xs text-black hover:opacity-80 transition-opacity">
                  <ChevronLeft className="h-3.5 w-3.5" /> Retour à l'étape {idx}
                </button>
              )}
            </div>
            {node.kind !== 'checklist' ? (
              <>
                {node.text && (
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{node.text}</p>
                )}
                {/* Quick note area */}
                <div className="mt-3">
                  <details className="group">
                    <summary className="text-xs text-emerald-800 cursor-pointer select-none">Ajouter une note</summary>
                    <textarea
                      value={notes[node.id] || ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [node.id]: e.target.value }))}
                      placeholder="Votre note pour cette étape…"
                      className="mt-2 w-full rounded-md border border-emerald-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      rows={2}
                    />
                  </details>
                </div>
                {Array.isArray(node.options) && node.options.length > 0 && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {node.options.map((opt, i) => {
                      const isActive = idx === currentNodes.length - 1 && i === activeOption;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => goTo(opt.nextId, idx)}
                          className={`btn-ripple relative group text-left rounded-xl border px-4 py-3 text-sm shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${isActive ? 'border-emerald-600 bg-emerald-50' : 'border-emerald-300 bg-white/80 hover:bg-emerald-50'}`}
                          aria-selected={isActive}
                        >
                          <span className="inline-flex items-center gap-2 text-emerald-950">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-emerald-300 text-[11px] text-emerald-800 bg-white/70">{i + 1}</span>
                            <CornerDownRight className="h-4 w-4 text-emerald-600" /> {opt.label}
                          </span>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-emerald-600 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
                          {isActive && (
                            <span className="absolute inset-0 rounded-xl ring-2 ring-emerald-300/70 pointer-events-none" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                {node.text && (
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{node.text}</p>
                )}
                <div className="mt-3 rounded-lg border border-emerald-50 bg-emerald-50/50 p-3 anim-slide-up">
                  {(() => {
                    const items = node.checklistItems || [];
                    const state = checks[node.id] || {};
                    const done = Object.values(state).filter(Boolean).length;
                    const total = items.length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                          <span>{done}/{total} validé(s)</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white">
                          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <ul className="mt-3 divide-y divide-gray-200">
                  {(node.checklistItems || []).map((it) => {
                    const checked = checks[node.id]?.[it.key] || false;
                    const open = openItems[node.id]?.[it.key] || false;
                    const toggleCheck = () => {
                      setChecks((prev) => ({
                        ...prev,
                        [node.id]: { ...prev[node.id], [it.key]: !checked },
                      }));
                    };
                    const toggleOpen = () => {
                      setOpenItems((prev) => ({
                        ...prev,
                        [node.id]: { ...prev[node.id], [it.key]: !open },
                      }));
                    };
                    return (
                      <li key={it.key} className="py-2">
                        <div className="flex items-start gap-3">
                          <button type="button" onClick={toggleCheck} className={`mt-0.5 h-5 w-5 rounded border ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white'}`}></button>
                          <div className="flex-1">
                            <button type="button" onClick={toggleOpen} className="text-left w-full">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900">{it.title}</span>
                                <span className="text-xs text-black/70">{open ? 'Masquer' : 'Voir plus'}</span>
                              </div>
                            </button>
                            {open && it.description && (
                              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{it.description}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {Array.isArray(node.options) && node.options.length > 0 && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {node.options.map((opt, i) => {
                      const isActive = idx === currentNodes.length - 1 && i === activeOption;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => goTo(opt.nextId, idx)}
                          className={`btn-ripple relative group text-left rounded-xl border px-4 py-3 text-sm shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${isActive ? 'border-emerald-600 bg-emerald-200' : 'border-emerald-400 bg-gradient-to-br from-emerald-200 to-emerald-300 hover:from-emerald-300 hover:to-emerald-400'}`}
                          aria-selected={isActive}
                        >
                          <span className="inline-flex items-center gap-2 text-emerald-950">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-emerald-400 text-[11px] text-emerald-900 bg-white/70">{i + 1}</span>
                            <Sparkles className="h-4 w-4 text-emerald-700" /> {opt.label}
                          </span>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-emerald-600 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
                          {isActive && (
                            <span className="absolute inset-0 rounded-xl ring-2 ring-emerald-300/70 pointer-events-none" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          {/* connector line */}
          {idx < currentNodes.length - 1 && (
            <div className="mx-6 relative">
              <div className="connector-grow border-l-2 border-emerald-100 h-8" />
              <span className="absolute -left-1 top-0 h-2 w-2 rounded-full bg-emerald-200 ping-soft" />
            </div>
          )}
        </div>
      ))}

      {/* Mini-map overlay */}
      {mapOpen && (
        <div className="fixed right-4 top-28 z-20 w-64 max-h-[70vh] overflow-auto rounded-lg border border-emerald-200 bg-white/90 backdrop-blur p-3 shadow-xl scroll-beauty-light">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-emerald-900">Parcours</div>
            <button type="button" onClick={() => setMapOpen(false)} className="text-xs text-gray-600 hover:text-gray-900">Fermer</button>
          </div>
          <ol className="space-y-2">
            {currentNodes.map((n, i) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => backTo(i)}
                  className={`w-full text-left px-2 py-1 rounded-md text-[13px] border transition ${i === currentNodes.length - 1 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-emerald-200 text-emerald-900 hover:bg-emerald-50'}`}
                >
                  {i + 1}. {n.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default CallDecisionFlow;
