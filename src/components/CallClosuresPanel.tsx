import { useMemo, useState } from "react";
import { X, Search, Star, StarOff, Filter, Copy, Check, ArrowUpDown } from "lucide-react";

export type CallClosure = {
  code: string;
  description: string;
  type: "CA+" | "CNA" | "AUTRE";
};

interface Props {
  open: boolean;
  onClose: () => void;
  closures: CallClosure[];
}

const typeColors: Record<CallClosure["type"], string> = {
  "CA+": "bg-green-100 text-green-700 ring-green-200",
  CNA: "bg-red-100 text-red-700 ring-red-200",
  AUTRE: "bg-gray-100 text-gray-700 ring-gray-200",
};

export default function CallClosuresPanel({ open, onClose, closures }: Props) {
  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<CallClosure["type"][]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"code" | "description" | "type">("code");
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const toggleType = (t: CallClosure["type"]) => {
    setActiveTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = closures.filter((c) => {
      const matchesQ = !q || c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
      const matchesT = activeTypes.length === 0 || activeTypes.includes(c.type);
      const matchesFav = !favoritesOnly || !!favorites[c.code];
      return matchesQ && matchesT && matchesFav;
    });
    // Favorites on top (if not favoritesOnly), then by selected sort
    arr = arr.sort((a, b) => {
      if (!favoritesOnly) {
        const fa = favorites[a.code] ? 1 : 0;
        const fb = favorites[b.code] ? 1 : 0;
        if (fa !== fb) return fb - fa;
      }
      if (sortBy === "description") return a.description.localeCompare(b.description);
      if (sortBy === "type") return a.type.localeCompare(b.type) || a.code.localeCompare(b.code);
      return a.code.localeCompare(b.code);
    });
    return arr;
  }, [closures, query, activeTypes, favorites, favoritesOnly, sortBy]);

  const typeCounts = useMemo(() => {
    const counts: Record<CallClosure["type"], number> = { "CA+": 0, CNA: 0, AUTRE: 0 } as any;
    for (const c of closures) counts[c.type] = (counts[c.type] || 0) + 1;
    return counts;
  }, [closures]);

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highlight = (text: string, q: string) => {
    if (!q) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "ig"));
    return parts.map((p, i) =>
      p.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{p}</mark>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied((m) => ({ ...m, [code]: true }));
      setTimeout(() => setCopied((m) => ({ ...m, [code]: false })), 1200);
    } catch {
      // no-op
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Clôtures d'appel"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Clôtures d’appel</h2>
            <p className="text-xs text-gray-500">Référentiel des statuts d’appel (codes + descriptions)</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-100" aria-label="Fermer">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Tools */}
        <div className="p-4 border-b border-gray-100 space-y-3 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher code ou description…"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-200 focus:ring-2 focus:ring-cactus-500 focus:border-cactus-500 outline-none text-sm"
              />
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Filter className="w-3 h-3" /> Filtres</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["CA+", "CNA", "AUTRE"] as CallClosure["type"][ ]).map((t) => {
              const active = activeTypes.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ring-1 ${typeColors[t]} ${active ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
                >
                  <span className="mr-1">{t}</span>
                  <span className="inline-flex items-center justify-center min-w-4 px-1 rounded bg-white/70 text-gray-800 ml-1">{typeCounts[t] ?? 0}</span>
                </button>
              );
            })}
            {activeTypes.length > 0 && (
              <button onClick={() => setActiveTypes([])} className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-200">
                Réinitialiser
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setFavoritesOnly((v) => !v)}
                className={`px-3 py-1 rounded-full text-xs font-medium ring-1 ${favoritesOnly ? "bg-yellow-100 text-yellow-800 ring-yellow-200" : "bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200"}`}
                title="Afficher uniquement les favoris"
              >
                {favoritesOnly ? "Favoris seulement" : "Tous"}
              </button>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <ArrowUpDown className="w-3 h-3" />
                <label className="sr-only" htmlFor="sort-select">Trier</label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cactus-500"
                >
                  <option value="code">Code</option>
                  <option value="description">Description</option>
                  <option value="type">Type</option>
                </select>
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</div>
        </div>

        {/* List */}
        <div className="p-4 overflow-y-auto h-[calc(100%-140px)]">
          {filtered.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun résultat.</div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((c) => (
                <li key={c.code} className="group bg-white rounded-lg border border-gray-200 hover:border-cactus-300 shadow-sm hover:shadow transition-all">
                  <div className="p-3 flex items-start gap-3">
                    <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded border border-gray-200 min-w-[64px] text-center">
                      {highlight(c.code, query)}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${typeColors[c.type]}`}>{c.type}</span>
                        {favorites[c.code] ? (
                          <button className="ml-1 p-1 text-yellow-600 hover:text-yellow-700" onClick={() => setFavorites((f) => ({ ...f, [c.code]: false }))} aria-label="Retirer des favoris">
                            <Star className="w-4 h-4 fill-yellow-500" />
                          </button>
                        ) : (
                          <button className="ml-1 p-1 text-gray-400 hover:text-yellow-600" onClick={() => setFavorites((f) => ({ ...f, [c.code]: true }))} aria-label="Ajouter aux favoris">
                            <StarOff className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="ml-1 p-1 text-gray-400 hover:text-gray-700"
                          onClick={() => copyCode(c.code)}
                          aria-label={`Copier ${c.code}`}
                          title="Copier le code"
                        >
                          {copied[c.code] ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{highlight(c.description, query)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
