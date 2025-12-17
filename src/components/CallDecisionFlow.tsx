import React from "react";

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

  const goTo = (nextId: string | undefined, index: number) => {
    if (!nextId) return; // terminal option
    // truncate after index and append nextId
    const newPath = path.slice(0, index + 1);
    newPath.push(nextId);
    setPath(newPath);
  };

  const backTo = (index: number) => {
    if (index < 0) return;
    setPath(path.slice(0, index + 1));
  };

  const reset = () => setPath([rootId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">Arborescence du script</h3>
        <button type="button" onClick={reset} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-black">Réinitialiser</button>
      </div>
      {currentNodes.map((node, idx) => (
        <div key={node.id} className="relative anim-soft-in" style={{ animationDelay: `${idx * 80}ms` }}>
          <div className="rounded-2xl border border-emerald-200 bg-white/80 backdrop-blur p-5 shadow-lg transition duration-300 will-change-transform hover:shadow-xl hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center px-2 py-1 rounded-full text-[11px] uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-200">Étape {idx + 1}</div>
                <h4 className="text-base font-semibold text-gray-900">{node.title}</h4>
              </div>
              {idx > 0 && (
                <button type="button" onClick={() => backTo(idx - 1)} className="text-xs text-black hover:opacity-80 transition-opacity">⬅️ Retour à l'étape {idx}</button>
              )}
            </div>
            {node.kind !== 'checklist' ? (
              <>
                {node.text && (
                  <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{node.text}</p>
                )}
                {Array.isArray(node.options) && node.options.length > 0 && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {node.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => goTo(opt.nextId, idx)}
                        className="btn-ripple relative group text-left rounded-xl border border-emerald-300 bg-white/80 backdrop-blur hover:bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                      >
                        {opt.label}
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-emerald-600 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
                      </button>
                    ))}
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
                    {node.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => goTo(opt.nextId, idx)}
                        className="btn-ripple relative group text-left rounded-xl border border-emerald-400 bg-gradient-to-br from-emerald-200 to-emerald-300 hover:from-emerald-300 hover:to-emerald-400 px-4 py-3 text-sm text-emerald-950 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                      >
                        {opt.label}
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-emerald-600 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {/* connector line */}
          {idx < currentNodes.length - 1 && (
            <div className="mx-6 h-8 border-l-2 border-emerald-100 relative">
              <span className="absolute -left-1 top-0 h-2 w-2 rounded-full bg-emerald-200 ping-soft" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CallDecisionFlow;
