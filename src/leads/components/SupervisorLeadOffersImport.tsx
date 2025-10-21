import React from 'react';
import { getLeadOffersCatalog, parseCsvOffers, parseCsvOffersAdvanced, parseXlsxOffers, setLeadOffersCatalog, type XlsxSheetOffers, type CatalogGroup } from '../services/leadOffersCatalog';
import { PlusCircle, MinusCircle, Equal, UploadCloud, CheckCircle2, ChevronDown } from 'lucide-react';

const box = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm';

const SupervisorLeadOffersImport: React.FC = () => {
  const [current, setCurrent] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<string[]>([]);
  const [sheets, setSheets] = React.useState<XlsxSheetOffers[]>([]);
  const [types, setTypes] = React.useState<CatalogGroup[] | undefined>(undefined);
  const [sourceType, setSourceType] = React.useState<'xlsx' | 'csv' | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  const [diff, setDiff] = React.useState<{ added: string[]; removed: string[]; unchanged: string[] }>({ added: [], removed: [], unchanged: [] });
  const [showAdded, setShowAdded] = React.useState(true);
  const [showRemoved, setShowRemoved] = React.useState(true);
  const [showUnchanged, setShowUnchanged] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const cat = await getLeadOffersCatalog();
        setCurrent(cat?.items || []);
        setLastUpdated(cat?.updatedAt ?? null);
      } catch (e: any) {
        setError(e?.message || 'Lecture du catalogue impossible');
      } finally {
        setLoading(false);
      }
    })();
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const computeDiff = React.useCallback((curr: string[], prev: string[]) => {
    const currSet = new Set(curr);
    const prevSet = new Set(prev);
    const added: string[] = [];
    const removed: string[] = [];
    const unchanged: string[] = [];
    prevSet.forEach((v) => {
      if (!currSet.has(v)) added.push(v);
      else unchanged.push(v);
    });
    currSet.forEach((v) => {
      if (!prevSet.has(v)) removed.push(v);
    });
    // Sort for stable UI
    added.sort((a,b) => a.localeCompare(b));
    removed.sort((a,b) => a.localeCompare(b));
    unchanged.sort((a,b) => a.localeCompare(b));
    return { added, removed, unchanged };
  }, []);

  const onFile = async (file: File) => {
    setError(null);
    setSuccess(null);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith('.xlsx')) {
        const buf = await file.arrayBuffer();
        const { flat, sheets, types } = await parseXlsxOffers(buf);
        setPreview(flat);
        setSheets(sheets);
        setTypes(types);
        setSourceType('xlsx');
        setDiff(computeDiff(current, flat));
      } else {
  // Smart-decode CSV: try UTF-8 first, then windows-1252 if replacement chars or mojibake detected
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const hasReplacement = /\uFFFD/.test(text);
  const looksMojibake = /Ã.|â€¦|â€”|â€“|Â./.test(text);
  if (hasReplacement || looksMojibake) {
    try {
      // Fallback to CP-1252
      // @ts-ignore - windows-1252 is supported by TextDecoder in browsers
      text = new TextDecoder('windows-1252', { fatal: false }).decode(buf);
    } catch {
      // keep utf-8 text if decoder not available
    }
  }
  // Essaye d'extraire des groupes s'il y a une colonne GROUPE/FEUILLE/CATEGORIE
  const adv = parseCsvOffersAdvanced(text);
  const items = adv.flat.length ? adv.flat : parseCsvOffers(text);
  setPreview(items);
  setSheets(adv.sheets); // si pas de groupe, tableau vide
  setTypes(adv.types);
  setSourceType('csv');
  setDiff(computeDiff(current, items));
      }
    } catch (e: any) {
      setError(e?.message || 'Import/Parsing impossible');
    }
  };

  const publish = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Priorité aux groupes par "Type de produit" (Informations, Produits, Options) si présents ; sinon Famille ; sinon groupes par feuille
      const groups = sheets.length
        ? sheets.map((sh) => ({ name: sh.name, items: sh.items }))
        : (types && types.length ? types : null);
      await setLeadOffersCatalog(preview, groups);
      setCurrent(preview);
      setPreview([]);
      setLastUpdated(Date.now());
      setSuccess('Catalogue mis à jour');
      setDiff({ added: [], removed: [], unchanged: preview.slice().sort((a,b)=>a.localeCompare(b)) });
    } catch (e: any) {
      setError(e?.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (ms: number | null) => {
    if (!ms) return '—';
    const d = new Date(ms);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${date} ${time}`;
  };

  // Modèles retirés sur demande

  return (
    <section className="space-y-4">
      <div className={`${box} ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} transition-all duration-500`}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-sm">
            <UploadCloud className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">Catalogue des intitulés d'offres LEADS</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Importe un fichier .xlsx (recommandé) ou .csv. Nous détectons automatiquement la colonne
          <span className="font-semibold"> « Libellé ALF »</span> dans chaque feuille et agrégeons toutes les offres.
        </p>
        <div className="mt-2 text-xs text-gray-500">
          <span className="inline-block mr-3">Dernière mise à jour: <span className="font-medium text-gray-700">{formatDateTime(lastUpdated)}</span></span>
          <span>Catalogue actuel: <span className="font-medium text-gray-700">{current.length}</span> élément(s)</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-700 text-sm cursor-pointer hover:bg-gray-50 shadow-sm">
            <UploadCloud className="h-4 w-4" /> Importer .xlsx / .csv
            <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => e.target.files && e.target.files[0] && onFile(e.target.files[0])} />
          </label>
          {/* Boutons de modèles supprimés */}
          <button disabled={preview.length===0 || saving} onClick={publish} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-600 bg-emerald-600 text-white text-sm disabled:opacity-50 shadow-sm hover:brightness-110">
            <CheckCircle2 className="h-4 w-4" /> Publier {preview.length>0 ? `(${preview.length})` : ''}
          </button>
          {loading && <span className="text-sm text-gray-500">Chargement…</span>}
          {saving && <span className="text-sm text-gray-500">Enregistrement…</span>}
        </div>
        {error && <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>}
        {success && <div className="mt-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">{success}</div>}
        <p className="mt-2 text-[12px] text-gray-500">La publication remplace le catalogue actuel par le contenu importé.</p>
      </div>

      {/* Aperçu des changements */}
      <div className={`${box} ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} transition-all duration-500 delay-75`}>
        <h3 className="text-sm font-semibold text-gray-900">Aperçu des changements</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm transition-transform duration-300 ease-out hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-700">
                <PlusCircle className="h-4 w-4" />
                <p className="text-[12px]">Ajoutés</p>
              </div>
              <p className="text-2xl font-semibold text-emerald-800">{diff.added.length}</p>
            </div>
            <button onClick={() => setShowAdded(v => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdded ? 'rotate-180' : ''}`} /> {showAdded ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3 shadow-sm transition-transform duration-300 ease-out hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700">
                <MinusCircle className="h-4 w-4" />
                <p className="text-[12px]">Retirés</p>
              </div>
              <p className="text-2xl font-semibold text-rose-800">{diff.removed.length}</p>
            </div>
            <button onClick={() => setShowRemoved(v => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-rose-700 hover:underline">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRemoved ? 'rotate-180' : ''}`} /> {showRemoved ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 shadow-sm transition-transform duration-300 ease-out hover:-translate-y-0.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-700">
                <Equal className="h-4 w-4" />
                <p className="text-[12px]">Inchangés</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{diff.unchanged.length}</p>
            </div>
            <button onClick={() => setShowUnchanged(v => !v)} className="mt-2 inline-flex items-center gap-1 text-xs text-gray-700 hover:underline">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showUnchanged ? 'rotate-180' : ''}`} /> {showUnchanged ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className={`rounded-lg border border-emerald-200 bg-white p-2 ${showAdded ? 'opacity-100 max-h-64' : 'opacity-0 max-h-0'} overflow-auto transition-all duration-300`}>
            {diff.added.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun élément à ajouter.</p>
            ) : (
              <ul className="text-sm text-gray-800 space-y-1">
                {diff.added.map((s, i) => (
                  <li key={`add-${i}`} className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-1 rounded-md mr-2 transition-colors hover:bg-emerald-100">
                    <span className="text-emerald-600 font-semibold">+</span> {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`rounded-lg border border-rose-200 bg-white p-2 ${showRemoved ? 'opacity-100 max-h-64' : 'opacity-0 max-h-0'} overflow-auto transition-all duration-300`}>
            {diff.removed.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun élément supprimé.</p>
            ) : (
              <ul className="text-sm text-gray-800 space-y-1">
                {diff.removed.map((s, i) => (
                  <li key={`rem-${i}`} className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-2 py-1 rounded-md mr-2 transition-colors hover:bg-rose-100">
                    <span className="text-rose-600 font-semibold">−</span> {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`rounded-lg border border-gray-200 bg-white p-2 ${showUnchanged ? 'opacity-100 max-h-64' : 'opacity-0 max-h-0'} overflow-auto transition-all duration-300`}>
            {diff.unchanged.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun élément inchangé.</p>
            ) : (
              <ul className="text-sm text-gray-800 space-y-1">
                {diff.unchanged.map((s, i) => (
                  <li key={`same-${i}`} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 text-gray-800 px-2 py-1 rounded-md mr-2 transition-colors hover:bg-gray-100">
                    <span className="text-gray-500">=</span> {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {loading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[0,1,2].map((k) => (
              <div key={k} className="h-20 rounded-xl border border-gray-200 bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}
      </div>
      <div className={`${box} ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} transition-all duration-500 delay-150`}>
        <h3 className="text-sm font-semibold text-gray-900">Prévisualisation globale ({preview.length})</h3>
        {preview.length === 0 ? (
          <p className="text-sm text-gray-600">Aucune prévisualisation. Importez un fichier pour voir les valeurs proposées.</p>
        ) : (
          <ul className="mt-2 max-h-64 overflow-auto text-sm text-gray-800">
            {preview.map((s, i) => (
              <li key={i} className="px-2 py-1 rounded hover:bg-gray-50 transition-colors">{s}</li>
            ))}
          </ul>
        )}
        {sheets.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-900">Par feuille</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {sheets.map((sh, idx) => (
                <details key={sh.name + idx} className="rounded-xl border border-gray-200 bg-white p-3 open:shadow-sm transition-all">
                  <summary className="list-none cursor-pointer select-none">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-800">{sh.name}</div>
                      <span className="text-xs text-gray-500">{sh.items.length} offre(s)</span>
                    </div>
                  </summary>
                  <ul className="mt-2 max-h-48 overflow-auto text-sm text-gray-800">
                    {sh.items.map((s, i) => (
                      <li key={`${sh.name}-${i}`} className="px-2 py-1 rounded hover:bg-gray-50 transition-colors">{s}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className={box}>
        <h3 className="text-sm font-semibold text-gray-900">Catalogue actuel</h3>
        {current.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun élément.</p>
        ) : (
          <ul className="mt-2 max-h-64 overflow-auto list-disc pl-5 text-sm text-gray-800">
            {current.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
};

export default SupervisorLeadOffersImport;
