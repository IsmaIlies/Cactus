import React from 'react';
import { Wifi, Smartphone, Package, Star } from 'lucide-react';

type Group = { name: string; items: string[] };
type AutocompleteProps = {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  groups?: Group[]; // optional grouped display
  placeholder?: string;
  disabled?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  className?: string;
};

const itemBase = 'px-3 py-2 cursor-pointer select-none rounded-md transition-colors';

export const Autocomplete: React.FC<AutocompleteProps> = ({
  id,
  value,
  onChange,
  suggestions,
  groups,
  placeholder,
  disabled,
  inputRef,
  className = '',
}) => {
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputEl = React.useRef<HTMLInputElement | null>(null);

  // expose input to parent
  React.useEffect(() => {
    if (inputRef) inputRef(inputEl.current);
    return () => {
      if (inputRef) inputRef(null);
    };
  }, [inputRef]);

  // Debounce input to make typeahead feel smooth
  const [query, setQuery] = React.useState(value);
  React.useEffect(() => setQuery(value), [value]);
  React.useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q === value ? q : value)), 120);
    return () => clearTimeout(t);
  }, [value]);

  const filter = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = suggestions;
    if (q.length > 0) list = suggestions.filter((s) => s.toLowerCase().includes(q));
    return list;
  }, [query, suggestions]);

  const grouped = React.useMemo(() => {
    if (!groups || groups.length === 0) return undefined;
    const q = query.trim().toLowerCase();
    const out: Group[] = groups
      .map((g) => ({ name: g.name, items: q ? g.items.filter((s) => s.toLowerCase().includes(q)) : g.items }))
      .filter((g) => g.items.length > 0);
    return out.length ? out : undefined;
  }, [groups, query]);

  // Fallback grouping by heuristics when groups are not provided (ensures groups-first UX)
  const derived = React.useMemo(() => {
    if (groups && groups.length) return undefined;
    const all = suggestions;
    const q = query.trim().toLowerCase();
    const inQuery = (s: string) => (q ? s.toLowerCase().includes(q) : true);
    const internet = all.filter((s) => /(internet|fibre|adsl|vdsl|livebox|decodeur|tv orange)/i.test(s) && inQuery(s));
    const mobile = all.filter((s) => /(mobile|sosh|forfait|sim|go)/i.test(s) && inQuery(s));
    const top = all.filter((s) => /(\+\s?vendus|top|meilleur|best)/i.test(s) && inQuery(s));
    const setAll = new Set(all);
    const used = new Set<string>([...internet, ...mobile, ...top]);
    const autres = [...all.filter((s) => !used.has(s) && inQuery(s))];
    const buckets: Group[] = [];
    if (internet.length) buckets.push({ name: 'Internet', items: internet });
    if (mobile.length) buckets.push({ name: 'Mobile', items: mobile });
    if (top.length) buckets.push({ name: 'Les + vendus', items: top });
    if (autres.length) buckets.push({ name: 'Autres', items: autres });
    return buckets.length ? buckets : undefined;
  }, [groups, suggestions, query]);

  const chosenGroups = grouped ?? derived;

  // Build a flat visible list for consistent keyboard navigation
  const visibleList = React.useMemo(() => {
    if (chosenGroups) return chosenGroups.flatMap((g) => g.items);
    return filter;
  }, [chosenGroups, filter]);

  const onSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    // keep focus on input
    inputEl.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filter.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const v = filter[highlight];
      if (v) onSelect(v);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  React.useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, []);

  const renderHighlighted = (s: string) => {
    const q = value.trim();
    if (!q) return <span>{s}</span>;
    const idx = s.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <span>{s}</span>;
    const before = s.slice(0, idx);
    const match = s.slice(idx, idx + q.length);
    const after = s.slice(idx + q.length);
    return (
      <span>
        {before}
        <span className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{match}</span>
        {after}
      </span>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        id={id}
        ref={inputEl}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#002FA7] transition"
        autoComplete="off"
      />

      <div
        className={`absolute z-20 mt-1 w-full origin-top rounded-xl border border-gray-200 bg-white shadow-lg transition-all duration-150 ease-out ${
          open && (((chosenGroups && chosenGroups.length > 0) || filter.length > 0))
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {chosenGroups ? (
          <div className="max-h-72 overflow-auto p-2 space-y-2">
            {chosenGroups.map((g, gi) => (
              <details key={g.name + gi} className="rounded-lg border border-gray-100">
                <summary className="flex items-center justify-between list-none cursor-pointer select-none px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#002FA7]/10 text-[#002FA7]">
                      {(() => {
                        const n = g.name.toLowerCase();
                        if (/(internet|fibre|adsl|vdsl)/i.test(n)) return <Wifi className="h-4 w-4" />;
                        if (/(mobile|sosh|forfait|sim)/i.test(n)) return <Smartphone className="h-4 w-4" />;
                        if (/(vendu|top|meilleur|plus)/i.test(n)) return <Star className="h-4 w-4" />;
                        return <Package className="h-4 w-4" />;
                      })()}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{g.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">{g.items.length}</span>
                </summary>
                <ul className="px-2 pb-2">
                  {g.items.map((s, i) => {
                    // compute global index for keyboard highlight
                    const offset = chosenGroups
                      .slice(0, gi)
                      .reduce((acc, gg) => acc + gg.items.length, 0);
                    const idx = offset + i;
                    return (
                    <li
                      key={`${g.name}-${s}-${i}`}
                      className={`${itemBase} ${idx === highlight ? 'bg-[#002FA7]/10 text-[#002FA7]' : 'text-[#002FA7] hover:bg-[#002FA7]/5'}`}
                      onMouseEnter={() => setHighlight(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(s);
                      }}
                    >
                      {renderHighlighted(s)}
                    </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        ) : (
          <ul className="max-h-64 overflow-auto p-2">
            {filter.map((s, i) => (
              <li
                key={`${s}-${i}`}
                className={`${itemBase} ${i === highlight ? 'bg-[#002FA7]/10 text-[#002FA7]' : 'text-[#002FA7] hover:bg-[#002FA7]/5'}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // prevent input blur before selection
                  e.preventDefault();
                  onSelect(s);
                }}
              >
                {renderHighlighted(s)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Autocomplete;
