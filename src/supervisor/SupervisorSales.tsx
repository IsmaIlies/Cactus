import React from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, onSnapshot, orderBy, query as fsQuery, where, Timestamp } from 'firebase/firestore';

type Sale = {
  id: string;
  date: any;
  name?: string;
  userName?: string;
  agent?: string;
  offer?: string;
  basketStatus?: string;
  consent?: string;
  orderNumber?: string;
  campaign?: string;
  region?: string;
};

const OFFER_OPTIONS = [
  'CANAL+',
  'CANAL+ Ciné Séries',
  'CANAL+ Sport',
  'CANAL+ 100%'
];

const STATUS_OPTIONS = [
  'En attente',
  'Validé',
  'Problème IBAN',
  'ROAC',
  'Valid Soft'
];

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toDate(v: any): Date | null {
  try { if (!v) return null; if (v instanceof Date) return v; if (typeof v?.toDate === 'function') return v.toDate(); const d = new Date(v); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}
function sellerName(s: Sale) { return String(s.name || s.userName || s.agent || 'Inconnu'); }
function fmtDate(d: Date | null) { if (!d) return '—'; return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }); }

// Normalisation accents/espaces/plus
function stripAccents(str: string) {
  try { return str.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return str; }
}
function classifyOffer(raw: string): string {
  const base = stripAccents(String(raw || '')).toLowerCase();
  // Uniformiser les variantes "canal +" -> "canal+"
  const t = base.replace(/\s*\+\s*/g, '+').replace(/\s+/g, ' ').trim();
  if (/100/.test(t)) return 'CANAL+ 100%';
  if (/sport/.test(t)) return 'CANAL+ Sport';
  if (/(cine|cinema|serie|series)/.test(t)) return 'CANAL+ Ciné Séries';
  return 'CANAL+';
}

// Classification statuts -> catégories canoniques
function classifyStatus(basketStatus?: string, consent?: string): 'Validé' | 'Valid Soft' | 'En attente' | 'Problème IBAN' | 'ROAC' | 'Autre' {
  const raw = stripAccents(String(basketStatus || '')).toLowerCase();
  const cons = String(consent || '').toLowerCase();
  // Validé si consent yes (legacy)
  if (cons === 'yes') return 'Validé';
  // Valid Soft (détecter avant Validé pour éviter que "valid soft" tombe dans Validé)
  if (/soft|valid\s*so/.test(raw)) return 'Valid Soft';
  // Validé (OK / valid / valid finale / validé...)
  if (/\bok\b|\bvalid\b|valid[ _-]?finale|valide|valid[ée]/.test(raw)) return 'Validé';
  // Problème IBAN
  if (/iban|rib/.test(raw)) return 'Problème IBAN';
  // ROAC
  if (/roac/.test(raw)) return 'ROAC';
  // En attente (pending/en cours/saisie/traitement/attente)
  if (!raw || /attente|pending|awaiting|await|on\s*hold|hold|pause|paused|en\s*pause|en\s*att|en\s*cours|saisie|traitement|traite|wait|enregistrement|draft|validation|valider|a\s*valider|verif|verifier|v[ée]rification|controle|control|a\s*traiter|à\s*traiter|a\s*verifier|à\s*verifier|a\s*completer|à\s*completer|incomplet|incomplete|manque|missing|process|processing/.test(raw)) return 'En attente';
  // Par défaut, considérer comme "En attente" plutôt que "Autre"
  return 'En attente';
}

const SupervisorSales: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const isLeads = (area || '').toUpperCase() === 'LEADS';
  const region: 'FR' | 'CIV' | null = isLeads ? null : ((area || 'FR').toUpperCase() === 'CIV' ? 'CIV' : 'FR');

  // Période par défaut: mois courant
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [start, setStart] = React.useState<string>(defaultStart.toISOString().slice(0,10));
  const [end, setEnd] = React.useState<string>(''); // vide = aujourd'hui

  // Filtres côté client
  const [selectedOffers, setSelectedOffers] = React.useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [selectedSellers, setSelectedSellers] = React.useState<string[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [usingFallback, setUsingFallback] = React.useState(false);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');

  // Abonnement temps réel aux ventes de la région sélectionnée (FR par défaut côté superviseur Canal+)
  React.useEffect(() => {
    if (!region) return; // LEADS non géré ici
    setLoading(true); setError(null); setUsingFallback(false);
    const startDate = start ? startOfDay(new Date(start)) : startOfDay(defaultStart);
    const endDateBase = end ? startOfDay(new Date(end)) : startOfDay(new Date());
    const endExclusive = addDays(endDateBase, 1);

    let cancelled = false;
    let unsubPrimary: (() => void) | null = null;
    let unsubFallback: (() => void) | null = null;

    const startFallback = () => {
      // Fallback: date-only + orderBy, filtrage région en mémoire
      setUsingFallback(true);
      const qDateOnly = fsQuery(
        collection(db, 'sales'),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<', Timestamp.fromDate(endExclusive)),
        orderBy('date', sortOrder)
      );
      unsubFallback = onSnapshot(qDateOnly, {
        next: (snap) => {
          if (cancelled) return;
          const items: Sale[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          const reg = String(region).toUpperCase();
          const filtered = items.filter(s => String((s as any).region || '').toUpperCase() === reg || String((s as any).region || '').toLowerCase() === reg.toLowerCase());
          setSales(filtered);
          setLoading(false);
        },
        error: (e) => { if (cancelled) return; setError(e?.message || 'Erreur chargement ventes'); setLoading(false); }
      });
    };

    const qPrimary = fsQuery(
      collection(db, 'sales'),
      where('region', '==', region),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<', Timestamp.fromDate(endExclusive)),
      orderBy('date', sortOrder)
    );
    unsubPrimary = onSnapshot(qPrimary, {
      next: (snap) => {
        if (cancelled) return;
        const items: Sale[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setSales(items);
        setLoading(false);
      },
      error: (e) => {
        if (cancelled) return;
        const msg = String(e?.message || '');
        const isIndexErr = msg.toLowerCase().includes('requires an index') || msg.toLowerCase().includes('index');
        if (isIndexErr) {
          // Ne pas afficher l'erreur; passer en fallback
          if (unsubPrimary) { try { unsubPrimary(); } catch {} }
          startFallback();
        } else {
          setError(e?.message || 'Erreur chargement ventes');
          setLoading(false);
        }
      }
    });

    return () => { cancelled = true; if (unsubPrimary) unsubPrimary(); if (unsubFallback) unsubFallback(); };
  }, [region, start, end, sortOrder]);

  // Dériver les vendeurs disponibles
  const availableSellers = React.useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => set.add(sellerName(s)));
    return Array.from(set).sort((a,b) => a.localeCompare(b, 'fr'));
  }, [sales]);

  // Helpers statut: résolution catégorie avec variantes de champs
  const getStatusCategory = (s: Sale) => {
    // Déterminer dès maintenant quelques flags booléens connus
    const anyObj = s as any;
    const hasPendingFlag = anyObj.pending === true || anyObj.isPending === true || anyObj.enAttente === true;
    const hasIbanFlag = anyObj.ibanProblem === true || anyObj.ribProblem === true || anyObj.ibanIssue === true || anyObj.ibanKo === true || anyObj.ribKo === true || anyObj.problemeIban === true;
    const hasRoacFlag = anyObj.roac === true || anyObj.isRoac === true;
    if (hasIbanFlag) return 'Problème IBAN';
    if (hasRoacFlag) return 'ROAC';
    if (hasPendingFlag) return 'En attente';
    // Chercher dans des champs array communs (tags/labels/flags/statuses)
    const arrayKeys = ['tags','labels','flags','statuses','statusList','status_list','notesList','commentsList'];
    for (const k of arrayKeys) {
      const v = (anyObj as any)[k];
      if (Array.isArray(v)) {
        const txt = stripAccents(String(v.join(' ').toLowerCase() || ''));
        if (/iban|rib/.test(txt)) return 'Problème IBAN';
        if (/roac/.test(txt)) return 'ROAC';
        if (/attente|pending|awaiting|on\s*hold|hold|pause|paused|en\s*pause|en\s*att|en\s*cours|saisie|traitement|traite|wait|draft|validation|valider|a\s*valider|verif|verifier|v[ée]rification|controle|control|a\s*traiter|à\s*traiter|a\s*verifier|à\s*verifier|incomplet|incomplete|missing|process|processing/.test(txt)) return 'En attente';
      }
    }
    // Prioriser les champs statut "forts"
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = (anyObj as any)[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
      }
      return '';
    };
    const primaryRaw = pick(
      'basketStatus','status','orderStatus','basket_status','panierStatus',
      'statusLabel','status_label','statusText','status_text',
      'state','stateLabel','state_label',
      'statut','statutCommande','statut_commande','statutPanier','statut_panier',
      'commandeStatus','commande_statut','etat'
    );
    if (primaryRaw) {
      const cat = classifyStatus(primaryRaw, s.consent);
      return cat === 'Autre' ? 'En attente' : cat;
    }
    // Champs "faibles" (texte libre) — utilisés uniquement si ça matche une catégorie connue
    const weakRaw = pick(
      'signalement','issue','problem','probleme','raison','motif','reason',
      'statusDescription','description','note','notes','comment','comments'
    );
    if (weakRaw) {
      const weakCat = classifyStatus(weakRaw, s.consent);
      return weakCat === 'Autre' ? 'En attente' : weakCat;
    }
    // Rien d'exploitable -> considérer comme "En attente"
    return 'En attente';
  };

  const getRawStatus = (s: Sale) => {
    const rawAlt = (s as any).basketStatus
      || (s as any).status
      || (s as any).orderStatus
      || (s as any).basket_status
      || (s as any).panierStatus
      || (s as any).statut
      || (s as any).statutCommande
      || (s as any).statut_commande
      || (s as any).statutPanier
      || (s as any).statut_panier
      || (s as any).commandeStatus
      || (s as any).commande_statut
      || (s as any).etat
      || '';
    return String(rawAlt || '').trim();
  };

  const statusMatches = (s: Sale) => {
    if (selectedStatuses.length === 0) return true;
    const cat = getStatusCategory(s);
    return selectedStatuses.includes(cat);
  };

  // Base après offre + vendeur (sert à calculer les compteurs)
  const baseAfterOfferSeller = React.useMemo(() => {
    return sales.filter(s => {
      const saleCategory = classifyOffer(String(s.offer || ''));
      const offerOk = selectedOffers.length === 0 ? true : selectedOffers.includes(saleCategory);
      if (!offerOk) return false;
      const name = sellerName(s);
      if (selectedSellers.length > 0 && !selectedSellers.includes(name)) return false;
      return true;
    });
  }, [sales, selectedOffers, selectedSellers]);

  // Filtrage final: ajoute le statut
  const filtered = React.useMemo(() => {
    return baseAfterOfferSeller.filter(s => statusMatches(s));
  }, [baseAfterOfferSeller, selectedStatuses]);

  const totalListed = filtered.length;

  // Compter par statut (pour visibilité et debug UX)
  const statusCounts = React.useMemo(() => {
    const acc: Record<string, number> = { 'En attente': 0, 'Validé': 0, 'Problème IBAN': 0, 'ROAC': 0, 'Valid Soft': 0 };
    for (const s of baseAfterOfferSeller) {
      const cat = getStatusCategory(s);
      acc[cat] = (acc[cat] || 0) + 1;
    }
    return acc;
  }, [baseAfterOfferSeller]);


  return (
    <div className="relative">
      <div className="space-y-4 animate-fade-in">
        <p className="text-slate-300">{isLeads ? 'Ventes Leads (leads_sales)' : `Ventes Canal+ (${region || ''})`} — temps réel</p>

      {/* KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
            <p className="text-blue-200 text-sm">Ventes Canal+ listées</p>
            <p className="text-3xl font-extrabold text-white">{loading ? '…' : totalListed}</p>
            {usingFallback && <div className="text-[11px] text-blue-300 mt-1">Affichage optimisé (index en cours)</div>}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
            <p className="text-blue-200 text-sm">Période</p>
            <div className="text-sm text-blue-100">{start || '—'} → {end || new Date().toISOString().slice(0,10)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Filtres */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Filtres</h3>
              <button
                onClick={() => { setSelectedOffers([]); setSelectedStatuses([]); setSelectedSellers([]); setStart(defaultStart.toISOString().slice(0,10)); setEnd(''); }}
                className="text-rose-300 text-sm hover:underline"
              >Effacer tout</button>
            </div>

            <div>
              <p className="text-blue-200 text-sm mb-2">Période</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500" />
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500" />
              </div>
            </div>

            <div>
              <p className="text-blue-200 text-sm mb-2">Type d'offre</p>
              <div className="flex flex-wrap gap-2">
                {OFFER_OPTIONS.map(opt => {
                  const active = selectedOffers.includes(opt);
                  return (
                    <button key={opt} onClick={() => setSelectedOffers(prev => active ? prev.filter(x => x!==opt) : [...prev, opt])}
                      className={`px-3 py-1 rounded-full text-sm border transition ${active ? 'bg-cactus-600 text-white border-cactus-500 shadow-sm' : 'bg-white/5 border-white/10 text-blue-100 hover:bg-white/10'}`}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-blue-200 text-sm mb-2">Statut commande</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => {
                  const active = selectedStatuses.includes(opt);
                  const dot = opt.toLowerCase().includes('valid') ? 'bg-emerald-500' : opt.toLowerCase().includes('attente') ? 'bg-amber-500' : /iban|roac/i.test(opt) ? 'bg-rose-500' : 'bg-gray-400';
                  return (
                    <button key={opt} onClick={() => setSelectedStatuses(prev => active ? prev.filter(x => x!==opt) : [...prev, opt])}
                      className={`px-3 py-1 rounded-full text-sm border transition flex items-center gap-2 ${active ? 'bg-cactus-600 text-white border-cactus-500 shadow-sm' : 'bg-white/5 border-white/10 text-blue-100 hover:bg-white/10'}`}>
                      <span className={`inline-block w-2 h-2 rounded-full ${dot}`}></span>
                      {opt}
                      <span className="ml-1 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-blue-100">{statusCounts[opt] ?? 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-blue-200 text-sm mb-2">Télévendeurs</p>
              <div className="max-h-56 overflow-auto pr-1 scroll-beauty">
                {availableSellers.map(name => {
                  const active = selectedSellers.includes(name);
                  return (
                    <label key={name} className="flex items-center gap-2 py-1 text-sm text-slate-100">
                      <input type="checkbox" checked={active} onChange={() => setSelectedSellers(prev => active ? prev.filter(x => x!==name) : [...prev, name])} className="accent-cactus-600" />
                      <span className={`${active ? 'text-white' : ''}`}>{name}</span>
                    </label>
                  );
                })}
                {availableSellers.length === 0 && <div className="text-blue-300 text-sm">—</div>}
              </div>
            </div>
          </div>

        {/* Liste des ventes */}
          <div className="lg:col-span-2 rounded-lg border border-white/10 bg-white/5 p-0 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="px-4 pt-4">
              <h3 className="font-semibold text-white">Ventes Canal+ ({totalListed})</h3>
              <div className="text-xs text-blue-200">{totalListed} ventes Canal+ trouvées</div>
            </div>
            {error && !/requires an index/i.test(String(error)) && (
              <div className="text-rose-300 text-xs px-4">{error}</div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-900/70 backdrop-blur border-b border-white/10">
                <tr className="text-blue-200">
                  <th className="text-left p-3">
                    <button className="inline-flex items-center gap-1 hover:underline" onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}>
                      <span>DATE</span>
                      <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                    </button>
                  </th>
                  <th className="text-left p-3">VENDEUR</th>
                  <th className="text-left p-3">N° COMMANDE</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  Array.from({length:8}).map((_,i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="p-3 text-blue-300">…</td>
                      <td className="p-3 text-blue-300">…</td>
                      <td className="p-3 text-blue-300">…</td>
                    </tr>
                  ))
                )}
                {!loading && filtered.map((s) => {
                  const d = toDate(s.date);
                  const cat = getStatusCategory(s);
                  const raw = getRawStatus(s);
                  return (
                    <tr key={s.id} className="border-t border-white/10 hover:bg-white/5 even:bg-white/[0.03]" title={`Statut: ${cat} | Brut: ${raw || '—'} | Consent: ${s.consent || '—'}`}>
                      <td className="p-3 whitespace-nowrap text-white">{fmtDate(d)}</td>
                      <td className="p-3 text-white">{sellerName(s)}</td>
                      <td className="p-3 text-white">{s.orderNumber || '—'}</td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr className="border-t border-white/10">
                    <td className="p-3 text-blue-200" colSpan={3}>Aucune vente pour les filtres courants.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-blue-200 mt-2 px-4 pb-4">{totalListed} ventes Canal+ trouvées</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorSales;
