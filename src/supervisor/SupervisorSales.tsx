import React from 'react';
import { Wrench, Check, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query as fsQuery, where, Timestamp, updateDoc, doc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import SupervisorPresenceFR from './SupervisorPresenceFR';

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
  // Infos client (si présentes dans Firestore)
  clientFirstName?: string;
  clientLastName?: string;
  clientPhone?: string;
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
  // Edition de date (inline)
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingDate, setEditingDate] = React.useState<string>('');
  const [saving, setSaving] = React.useState<boolean>(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // ===== LEADS state & helpers =====
  type LeadRow = {
    id: string;
    createdAt: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    email: string | null;
    displayName: string | null;
    numeroId: string | null;
    typeOffre: string | null;
    intituleOffre: string | null;
    referencePanier: string | null;
    codeAlf: string | null;
    ficheDuJour: string | null;
    origineLead: string | null;
    dateTechnicien: string | null;
    telephone: string | null;
  };
  // En LEADS: tableau visible détaillé (toutes colonnes) et CSV au format demandé
  // Colonnes CSV (uniquement pour l'export) — ne pas confondre avec l'UI
  const LEADS_CSV_HEADERS = [
    'Id',
    'Heure de depart',
    'Heure de fin',
    'Adresse de messagerie',
    'Nom',
    'DID',
    "Type d'offre",
    "Intitulé de l'offre (jaune)",
    'Référence du panier',
    'CODE ALF',
    'FICHE DU JOUR',
    'ORIGINE LEADS',
    'Date technicien',
    'Numéro de téléphone de la fiche'
  ] as const;
  const LEADS_TABLE_HEADERS = [
    'ID', 'Date', 'Adresse de messagerie', 'Nom', 'DID', "Type d'offre",
    "Intitulé de l'offre (jaune)", 'Référence du panier', 'CODE ALF', 'FICHE DU JOUR', 'ORIGINE LEADS', 'Date technicien', 'Numéro de téléphone de la fiche'
  ] as const;
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const formatDateOnly = (d: Date | null) => {
    if (!d) return '—';
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
  };
  const canonicalLeadType = (raw: string | null | undefined): string => {
    const s = String(raw || '').trim().toLowerCase().replace(/\s+/g,'');
    if (s === 'internet') return 'Internet';
    if (s === 'internetsosh') return 'Internet Sosh';
    if (s === 'mobile') return 'Mobile';
    if (s === 'mobilesosh') return 'Mobile Sosh';
    // Combined legacy values: pick Internet variant as primary if present
    if (s.includes('internetsosh') && s.includes('mobilesosh')) return 'Internet Sosh';
    if (s.includes('internet') && s.includes('mobile')) return 'Internet';
    // Fallbacks on partial matches
    if (/internetsosh/.test(s)) return 'Internet Sosh';
    if (/mobilesosh/.test(s)) return 'Mobile Sosh';
    if (/internet/.test(s)) return 'Internet';
    if (/mobile/.test(s)) return 'Mobile';
    return String(raw || '');
  };
  const formatDateTime = (d: Date | null) => {
    if (!d) return '';
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const HH = pad2(d.getHours());
    const MM = pad2(d.getMinutes());
    const SS = pad2(d.getSeconds());
    return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
  };
  // Génère un classeur Excel soigné avec largeurs, auto-filter, header stylé, et freeze top row
  const toXlsxBlob = (rows: LeadRow[]) => {
    const data = [LEADS_CSV_HEADERS as unknown as string[]];
    rows.forEach((r, i) => {
      data.push([
        String(i + 1),
        formatDateTime(r.startedAt || r.createdAt),
        formatDateTime(r.completedAt || r.createdAt),
        r.email || '',
        r.displayName || '',
        r.numeroId || '',
        canonicalLeadType(r.typeOffre),
        r.intituleOffre || '',
        r.referencePanier || '',
        r.codeAlf || '',
        r.ficheDuJour || '',
        (r.origineLead || '').toString().toUpperCase(),
        r.dateTechnicien || '',
        r.telephone || ''
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Largeur de colonnes
    const colWidths = [5, 20, 20, 28, 22, 14, 16, 42, 18, 12, 14, 14, 16, 20].map(w => ({ wch: w }));
    (ws as any)['!cols'] = colWidths;
    // Freeze first row and add autofilter
    (ws as any)['!freeze'] = { rows: 1, columns: 0 };
    (ws as any)['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r:0, c:0 }, e: { r: Math.max(rows.length,1), c: LEADS_CSV_HEADERS.length-1 } }) };
    // Header style (gras, fond foncé, texte blanc, centré)
    for (let c = 0; c < LEADS_CSV_HEADERS.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = (ws as any)[addr];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1F2937' } }, // slate-800
          alignment: { horizontal: 'center', vertical: 'center' }
        } as any;
      }
    }
    // Hauteur de la première ligne
    (ws as any)['!rows'] = [{ hpt: 22 }];
  // Alignements sélectifs par colonne (ID, DID, CODE ALF, Date tech, Téléphone)
  const centerCols = new Set([0, 5, 9, 12, 13]);
    for (let r = 1; r <= rows.length; r++) {
      centerCols.forEach((c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = (ws as any)[addr];
        if (cell) {
          cell.s = Object.assign({}, cell.s || {}, { alignment: { horizontal: 'center', vertical: 'center' } });
        }
      });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PANIER LEADS');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
  const [leadsRows, setLeadsRows] = React.useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = React.useState<boolean>(false);
  const [leadsError, setLeadsError] = React.useState<string | null>(null);
  const [leadsUsingFallback, setLeadsUsingFallback] = React.useState<boolean>(false);
  // Filtres LEADS côté client (offre + télévendeur)
  const [selectedLeadSellers, setSelectedLeadSellers] = React.useState<string[]>([]);
  const [selectedLeadOrigins, setSelectedLeadOrigins] = React.useState<string[]>([]);
  const leadSellerLabel = (r: LeadRow) => (r.displayName || r.email || '—');
  const availableLeadOrigins = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of leadsRows) {
      const v = String(r.origineLead || '').toLowerCase().trim();
      if (v) set.add(v);
    }
    // Garder l'ordre connu si présents
  const known = ['opportunity','dolead','mm'];
    const list = Array.from(set);
    return list.sort((a,b) => {
      const ia = known.indexOf(a); const ib = known.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1; if (ib !== -1) return 1;
      return a.localeCompare(b, 'fr');
    });
  }, [leadsRows]);
  const availableLeadSellers = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of leadsRows) { const v = leadSellerLabel(r); if (v && v !== '—') set.add(v); }
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'fr'));
  }, [leadsRows]);
  const filteredLeadsRows = React.useMemo(() => {
    // La période est déjà gérée par la requête Firestore (start/end) et par le fallback.
    return leadsRows.filter(r => {
      // Origine
      if (selectedLeadOrigins.length > 0) {
        const origin = String(r.origineLead || '').toLowerCase().trim();
        if (!selectedLeadOrigins.includes(origin)) return false;
      }
      if (selectedLeadSellers.length > 0) {
        const lbl = leadSellerLabel(r);
        if (!selectedLeadSellers.includes(lbl)) return false;
      }
      return true;
    });
  }, [leadsRows, selectedLeadOrigins, selectedLeadSellers]);
  const leadsCount = filteredLeadsRows.length;

  // ——— Persistance des filtres LEADS (localStorage) ———
  React.useEffect(() => {
    if (!isLeads) return;
    try {
      const saved = JSON.parse(localStorage.getItem('leadsFilters') || '{}');
      if (saved && typeof saved === 'object') {
        if (typeof saved.start === 'string') setStart(saved.start);
        if (typeof saved.end === 'string') setEnd(saved.end);
        if (Array.isArray(saved.origins)) setSelectedLeadOrigins(saved.origins);
        if (Array.isArray(saved.sellers)) setSelectedLeadSellers(saved.sellers);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeads]);

  React.useEffect(() => {
    if (!isLeads) return;
    const payload = {
      start,
      end,
      origins: selectedLeadOrigins,
      sellers: selectedLeadSellers,
    };
    try { localStorage.setItem('leadsFilters', JSON.stringify(payload)); } catch {}
  }, [isLeads, start, end, selectedLeadOrigins, selectedLeadSellers]);

  // Si on est en mode LEADS, on ne branche pas l'abonnement Canal+
  // Polling (60s) des ventes Canal+ de la région sélectionnée (FR/CIV) avec fallback si index manquant
  React.useEffect(() => {
    if (!region) return; // LEADS: on sort, rendu géré plus bas
    setLoading(true); setError(null); setUsingFallback(false);
    const startDate = start ? startOfDay(new Date(start)) : startOfDay(defaultStart);
    const endDateBase = end ? startOfDay(new Date(end)) : startOfDay(new Date());
    const endExclusive = addDays(endDateBase, 1);

    let cancelled = false;
    let inFlight = false;
    let timer: number | null = null;

    const fetchPrimary = async () => {
      const qPrimary = fsQuery(
        collection(db, 'sales'),
        where('region', '==', region),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<', Timestamp.fromDate(endExclusive)),
        orderBy('date', sortOrder)
      );
      const snap = await getDocs(qPrimary);
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Sale));
    };

    const fetchFallback = async () => {
      // Fallback: date-only + orderBy, filtrage région en mémoire
      setUsingFallback(true);
      const qDateOnly = fsQuery(
        collection(db, 'sales'),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<', Timestamp.fromDate(endExclusive)),
        orderBy('date', sortOrder)
      );
      const snap = await getDocs(qDateOnly);
      const items: Sale[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const reg = String(region).toUpperCase();
      return items.filter(s => String((s as any).region || '').toUpperCase() === reg || String((s as any).region || '').toLowerCase() === reg.toLowerCase());
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (typeof document !== 'undefined' && document.hidden) return; // pause onglet caché
      inFlight = true;
      try {
        setError(null);
        let list: Sale[] = [];
        try {
          setUsingFallback(false);
          list = await fetchPrimary();
        } catch (e: any) {
          const msg = String(e?.message || '');
          const isIndexErr = msg.toLowerCase().includes('requires an index') || msg.toLowerCase().includes('index');
          if (isIndexErr) {
            list = await fetchFallback();
          } else {
            throw e;
          }
        }
        if (!cancelled) { setSales(list); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message || 'Erreur chargement ventes'); setLoading(false); }
      } finally {
        inFlight = false;
      }
    };

    // Première récupération immédiate
    tick();
    // Démarrer l'intervalle 60s
    timer = window.setInterval(tick, 60_000);

    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timer) { clearInterval(timer); }
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [region, start, end, sortOrder]);

  // Polling LEADS (leads_sales) toutes 60s avec fallback si index manquant
  React.useEffect(() => {
    if (!isLeads) return;
    setLeadsLoading(true); setLeadsError(null); setLeadsUsingFallback(false);
    const startDate = start ? startOfDay(new Date(start)) : startOfDay(defaultStart);
    const endDateBase = end ? startOfDay(new Date(end)) : startOfDay(new Date());
    const endExclusive = addDays(endDateBase, 1);
    const activeRegion = (() => {
      try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase() === 'CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; }
    })();

    let cancelled = false;
    let inFlight = false;
    let timer: number | null = null;

    const mapSnapDoc = (d: any): LeadRow => {
      const data = d.data() as any;
      const createdAt = toDate(data?.createdAt);
      const startedAt = toDate(data?.startedAt);
      const completedAt = toDate(data?.completedAt);
      return {
        id: d.id,
        createdAt,
        startedAt,
        completedAt,
        email: data?.createdBy?.email ?? null,
        displayName: data?.createdBy?.displayName ?? null,
        numeroId: data?.numeroId ?? null,
        typeOffre: data?.typeOffre ?? null,
        intituleOffre: data?.intituleOffre ?? null,
        referencePanier: data?.referencePanier ?? null,
        codeAlf: data?.codeAlf ?? null,
        ficheDuJour: data?.ficheDuJour ?? null,
        origineLead: data?.origineLead ?? null,
        dateTechnicien: data?.dateTechnicien ?? null,
        telephone: data?.telephone ?? null,
      };
    };

    const fetchPrimary = async (): Promise<LeadRow[]> => {
      const qPrimary = fsQuery(
        collection(db, 'leads_sales'),
        ...(activeRegion === 'CIV'
          ? [where('mission','==','ORANGE_LEADS'), where('region','==','CIV')]
          : [where('mission','==','ORANGE_LEADS')]
        ),
        where('createdAt','>=', Timestamp.fromDate(startDate)),
        where('createdAt','<', Timestamp.fromDate(endExclusive)),
        orderBy('createdAt','desc')
      );
      const snap = await getDocs(qPrimary);
      return snap.docs.map(mapSnapDoc);
    };

    const fetchFallback = async (): Promise<LeadRow[]> => {
      setLeadsUsingFallback(true);
      const fb = activeRegion === 'CIV'
        ? fsQuery(collection(db, 'leads_sales'), where('mission','==','ORANGE_LEADS'), where('region','==','CIV'))
        : fsQuery(collection(db, 'leads_sales'), where('mission','==','ORANGE_LEADS'));
      const snap = await getDocs(fb);
      return snap.docs.map(mapSnapDoc)
        .filter(r => r.createdAt && r.createdAt >= startDate && r.createdAt < endExclusive)
        .sort((a,b) => (b.createdAt?.getTime()||0) - (a.createdAt?.getTime()||0));
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (typeof document !== 'undefined' && document.hidden) return; // pause onglet caché
      inFlight = true;
      try {
        setLeadsError(null);
        let list: LeadRow[] = [];
        try {
          setLeadsUsingFallback(false);
          list = await fetchPrimary();
        } catch (e: any) {
          const msg = String(e?.message || '');
          const isIndexErr = msg.toLowerCase().includes('requires an index') || msg.toLowerCase().includes('index');
          if (isIndexErr) list = await fetchFallback(); else throw e;
        }
        if (!cancelled) { setLeadsRows(list); setLeadsLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setLeadsError(e?.message || 'Erreur chargement LEADS'); setLeadsLoading(false); }
      } finally {
        inFlight = false;
      }
    };

    // Première récupération immédiate
    tick();
    // Démarrer l'intervalle 60s
    timer = window.setInterval(tick, 60_000);

    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timer) { clearInterval(timer); }
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isLeads, start, end]);

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

  // ===== Export (Canal+) =====
  type ExportColumnKey = 'date' | 'seller' | 'offer' | 'status' | 'rawStatus' | 'orderNumber' | 'region' | 'campaign' | 'client' | 'phone';
  const EXPORT_COLUMNS: Record<ExportColumnKey, { label: string; width: number }> = {
    date: { label: 'Date', width: 20 },
    seller: { label: 'Télévendeur', width: 24 },
    offer: { label: "Type d'offre (normalisé)", width: 26 },
    status: { label: 'Statut (catégorie)', width: 20 },
    rawStatus: { label: 'Statut (brut)', width: 24 },
    orderNumber: { label: 'N° commande', width: 18 },
    region: { label: 'Région', width: 10 },
    campaign: { label: 'Campagne', width: 16 },
    client: { label: 'Client', width: 22 },
    phone: { label: 'Téléphone', width: 16 },
  };
  const DEFAULT_EXPORT_ORDER: ExportColumnKey[] = ['date','seller','offer','status','orderNumber','region','campaign','client','phone','rawStatus'];
  const [exportOrder, setExportOrder] = React.useState<ExportColumnKey[]>(() => {
    try {
      const raw = localStorage.getItem('canalExportOrder');
      if (raw) {
        const parsed = JSON.parse(raw) as ExportColumnKey[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return DEFAULT_EXPORT_ORDER;
  });
  const [exportEnabled, setExportEnabled] = React.useState<Record<ExportColumnKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem('canalExportEnabled');
      if (raw) return JSON.parse(raw) as Record<ExportColumnKey, boolean>;
    } catch {}
    return Object.keys(EXPORT_COLUMNS).reduce((acc, k) => { (acc as any)[k] = true; return acc; }, {} as Record<ExportColumnKey, boolean>);
  });
  const [showExportConfig, setShowExportConfig] = React.useState(false);

  React.useEffect(() => {
    try { localStorage.setItem('canalExportOrder', JSON.stringify(exportOrder)); } catch {}
  }, [exportOrder]);
  React.useEffect(() => {
    try { localStorage.setItem('canalExportEnabled', JSON.stringify(exportEnabled)); } catch {}
  }, [exportEnabled]);

  const moveCol = (key: ExportColumnKey, dir: -1 | 1) => {
    setExportOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx === -1) return prev;
      const ni = idx + dir;
      if (ni < 0 || ni >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(ni, 0, item);
      return next;
    });
  };

  const activeColumns = exportOrder.filter((k) => exportEnabled[k]);

  const buildWorksheet = (rows: Sale[]) => {
    const header = activeColumns.map((k) => EXPORT_COLUMNS[k].label);
    const data: (string | number)[][] = [header];
    rows.forEach((s) => {
      const d = toDate(s.date);
      const cat = getStatusCategory(s);
      const raw = getRawStatus(s);
      const clientName = `${(s as any).clientFirstName || ''} ${(s as any).clientLastName || ''}`.trim();
      const phone = (s as any).clientPhone || '';
      const offerNorm = classifyOffer(String(s.offer || ''));
      const row = activeColumns.map((k) => {
        switch (k) {
          case 'date': return d ? fmtDate(d) : '';
          case 'seller': return sellerName(s);
          case 'offer': return offerNorm;
          case 'status': return cat;
          case 'rawStatus': return raw || '';
          case 'orderNumber': return s.orderNumber || '';
          case 'region': return (s as any).region || '';
          case 'campaign': return s.campaign || '';
          case 'client': return clientName || '';
          case 'phone': return phone || '';
        }
      });
      data.push(row as (string | number)[]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    (ws as any)['!cols'] = activeColumns.map((k) => ({ wch: EXPORT_COLUMNS[k].width }));
    for (let c = 0; c < header.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = (ws as any)[addr];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { bottom: { style: 'thin', color: { rgb: '334155' } } },
        } as any;
      }
    }
    (ws as any)['!freeze'] = { rows: 1, columns: 0 };
    (ws as any)['!rows'] = [{ hpt: 22 }];
    return ws;
  };

  const exportExcel = (rows: Sale[]) => {
    const ws = buildWorksheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VENTES CANAL+');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date(); const pad = (n:number)=>n.toString().padStart(2,'0');
    a.href = url; a.download = `canal_sales_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Construit un CSV UTF-8 (séparateur ;) en forçant la date au format texte (évite ##### dans Excel)
  const buildCsvString = (rows: Sale[]) => {
    const header = activeColumns.map((k) => EXPORT_COLUMNS[k].label);
    const lines: string[] = [];
    const esc = (v: string) => '"' + v.replace(/"/g, '""') + '"';
    lines.push(header.map(h => esc(h)).join(';'));
    rows.forEach((s) => {
      const d = toDate(s.date);
      const cat = getStatusCategory(s);
      const raw = getRawStatus(s);
      const clientName = `${(s as any).clientFirstName || ''} ${(s as any).clientLastName || ''}`.trim();
      const phone = (s as any).clientPhone || '';
      const offerNorm = classifyOffer(String(s.offer || ''));
      const fields = activeColumns.map((k) => {
        switch (k) {
          case 'date': return '\t' + (d ? fmtDate(d) : ''); // \t pour forcer texte dans Excel
          case 'seller': return sellerName(s);
          case 'offer': return offerNorm;
          case 'status': return cat;
          case 'rawStatus': return raw || '';
          case 'orderNumber': return s.orderNumber || '';
          case 'region': return (s as any).region || '';
          case 'campaign': return s.campaign || '';
          case 'client': return clientName || '';
          case 'phone': return phone || '';
        }
      }).map(v => esc(String(v ?? '')));
      lines.push(fields.join(';'));
    });
    return lines.join('\r\n');
  };

  const exportCsv = (rows: Sale[]) => {
    const csv = buildCsvString(rows);
    // BOM UTF-8 pour préserver les accents à l'ouverture dans Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date(); const pad = (n:number)=>n.toString().padStart(2,'0');
    a.href = url; a.download = `canal_sales_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Helpers pour input datetime-local
  const toDateTimeLocal = (dLike: any): string => {
    const d = toDate(dLike);
    if (!d) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const MM = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}`;
  };

  const beginEditDate = (s: Sale) => {
    setEditingId(s.id);
    setEditingDate(toDateTimeLocal(s.date));
    setSaveError(null);
  };

  const cancelEditDate = () => {
    setEditingId(null);
    setEditingDate('');
    setSaveError(null);
  };

  const saveEditDate = async (id: string) => {
    if (!editingDate) return;
    try {
      setSaving(true);
      setSaveError(null);
      const newDate = new Date(editingDate);
      if (isNaN(newDate.getTime())) throw new Error('Date invalide');
      await updateDoc(doc(db, 'sales', id), { date: Timestamp.fromDate(newDate) });
      // Mise à jour locale immédiate
      setSales(prev => prev.map(s => s.id === id ? { ...s, date: Timestamp.fromDate(newDate) } : s));
      setEditingId(null);
    } catch (e: any) {
      setSaveError(e?.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };


  // Vue LEADS: pas de filtres Canal+, affiche le tableau LEADS demandé
  if (isLeads) {
    return (
      <div className="relative">
        <div className="space-y-4 animate-fade-in">
          <p className="text-slate-300">Ventes Leads (leads_sales) — mise à jour toutes 60s</p>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <p className="text-blue-200 text-sm">Ventes LEADS listées</p>
              <p className="text-3xl font-extrabold text-white">{leadsLoading ? '…' : leadsCount}</p>
              {leadsUsingFallback && <div className="text-[11px] text-blue-300 mt-1">Affichage optimisé (index en cours)</div>}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
              <p className="text-blue-200 text-sm">Période</p>
              <div className="text-sm text-blue-100">{start || '—'} → {end || new Date().toISOString().slice(0,10)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Filtres LEADS (période + type d'offre + télévendeurs) */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Filtres</h3>
                <button onClick={() => { setStart(defaultStart.toISOString().slice(0,10)); setEnd(''); setSelectedLeadOrigins([]); setSelectedLeadSellers([]); }} className="text-rose-300 text-sm hover:underline">Effacer tout</button>
              </div>
              <div>
                <p className="text-blue-200 text-sm mb-2">Période</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={start} onChange={e => setStart(e.target.value)} className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500" />
                  <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="bg-slate-800 border border-white/10 text-slate-100 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-500" />
                </div>
              </div>
              <div>
                <p className="text-blue-200 text-sm mb-2">Origine lead</p>
                <div className="flex flex-wrap gap-2">
                  {availableLeadOrigins.map(opt => {
                    const label = opt === 'mm' ? 'MM' : opt.charAt(0).toUpperCase() + opt.slice(1);
                    const active = selectedLeadOrigins.includes(opt);
                    return (
                      <button key={opt} onClick={() => setSelectedLeadOrigins(prev => active ? prev.filter(x => x!==opt) : [...prev, opt])}
                        className={`px-3 py-1 rounded-full text-sm border transition ${active ? 'bg-cactus-600 text-white border-cactus-500 shadow-sm' : 'bg-white/5 border-white/10 text-blue-100 hover:bg-white/10'}`}>
                        {label}
                      </button>
                    );
                  })}
                  {availableLeadOrigins.length === 0 && <div className="text-blue-300 text-sm">—</div>}
                </div>
              </div>
              <div>
                <p className="text-blue-200 text-sm mb-2">Télévendeurs</p>
                <div className="max-h-56 overflow-auto pr-1 scroll-beauty">
                  {availableLeadSellers.map(name => {
                    const active = selectedLeadSellers.includes(name);
                    return (
                      <label key={name} className="flex items-center gap-2 py-1 text-sm text-slate-100">
                        <input type="checkbox" checked={active} onChange={() => setSelectedLeadSellers(prev => active ? prev.filter(x => x!==name) : [...prev, name])} className="accent-cactus-600" />
                        <span className={`${active ? 'text-white' : ''}`}>{name}</span>
                      </label>
                    );
                  })}
                  {availableLeadSellers.length === 0 && <div className="text-blue-300 text-sm">—</div>}
                </div>
              </div>
            </div>

            {/* Liste LEADS */}
            <div className="lg:col-span-2 rounded-lg border border-white/10 bg-white/5 p-0 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="px-4 pt-4">
                  <h3 className="font-semibold text-white">Ventes LEADS ({leadsCount})</h3>
                  <div className="text-xs text-blue-200">{leadsCount} ventes LEADS trouvées</div>
                </div>
                <div className="px-4 pt-4">
                  <button
                    onClick={() => {
                      const blob = toXlsxBlob(filteredLeadsRows);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      const now = new Date(); const pad = (n:number)=>n.toString().padStart(2,'0');
                      a.download = `leads_sales_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.xlsx`;
                      a.click(); URL.revokeObjectURL(url);
                    }}
                    disabled={leadsRows.length===0}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/20 text-white bg-white/10 hover:bg-white/20 disabled:opacity-50"
                    title={leadsRows.length===0 ? 'Aucune donnée à exporter' : 'Exporter en Excel (.xlsx)'}
                  >
                    Export Excel
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900/70 backdrop-blur border-b border-white/10">
                    <tr className="text-blue-200">
                      {LEADS_TABLE_HEADERS.map((h) => (
                        <th key={h} className="text-left p-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leadsLoading && Array.from({length:8}).map((_,i)=> (
                      <tr key={i} className="border-t border-white/10">
                        {LEADS_TABLE_HEADERS.map((_,j)=>(<td key={j} className="p-3 text-blue-300">…</td>))}
                      </tr>
                    ))}
                    {!leadsLoading && filteredLeadsRows.map((r, idx) => (
                      <tr key={r.id} className="border-t border-white/10 hover:bg-white/5 even:bg-white/[0.03]">
                        <td className="p-3 text-white whitespace-nowrap">{idx + 1}</td>
                        <td className="p-3 text-white whitespace-nowrap">{formatDateOnly(r.createdAt)}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.email || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.displayName || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.numeroId || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{canonicalLeadType(r.typeOffre) || '—'}</td>
                        <td className="p-3 whitespace-nowrap"><span className="bg-yellow-200/30 text-yellow-100 px-2 py-0.5 rounded text-[13px]">{r.intituleOffre || '—'}</span></td>
                        <td className="p-3 text-white whitespace-nowrap">{r.referencePanier || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.codeAlf || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.ficheDuJour || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{(r.origineLead || '—').toString().toUpperCase()}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.dateTechnicien || '—'}</td>
                        <td className="p-3 text-white whitespace-nowrap">{r.telephone || '—'}</td>
                      </tr>
                    ))}
                    {!leadsLoading && filteredLeadsRows.length === 0 && (
                      <tr className="border-t border-white/10"><td className="p-3 text-blue-200" colSpan={LEADS_TABLE_HEADERS.length}>Aucune vente LEADS pour la période.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-blue-200 mt-2 px-4 pb-4">{leadsCount} ventes LEADS trouvées</div>
              {leadsError && <div className="text-rose-300 text-xs px-4 pb-3">{leadsError}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="space-y-4 animate-fade-in">
  <p className="text-slate-300">{`Ventes Canal+ (${region || ''})`} — mise à jour toutes 60s</p>

      {region === 'FR' && (
        <SupervisorPresenceFR />
      )}

      {/* KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm animate-fade-in" style={{animationDelay:'40ms'}}>
            <p className="text-blue-200 text-sm">Ventes Canal+ listées</p>
            <p className="text-3xl font-extrabold text-white">{loading ? '…' : totalListed}</p>
            {usingFallback && <div className="text-[11px] text-blue-300 mt-1">Affichage optimisé (index en cours)</div>}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm animate-fade-in" style={{animationDelay:'80ms'}}>
            <p className="text-blue-200 text-sm">Période</p>
            <div className="text-sm text-blue-100">{start || '—'} → {end || new Date().toISOString().slice(0,10)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm animate-fade-in" style={{animationDelay:'120ms'}}>
            <p className="text-blue-200 text-sm mb-2">Répartition statuts</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([k,v]) => {
                const dot = k.toLowerCase().includes('valid') ? 'bg-emerald-500' : k.toLowerCase().includes('attente') ? 'bg-amber-500' : /iban|roac/i.test(k) ? 'bg-rose-500' : 'bg-gray-400';
                return (
                  <span key={k} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-blue-100 text-xs">
                    <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                    {k}
                    <span className="ml-0.5 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-blue-100">{v ?? 0}</span>
                  </span>
                );
              })}
            </div>
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
          <div className="lg:col-span-2 rounded-lg border border-white/10 bg-white/5 p-0 shadow-sm relative">
          <div className="flex items-center justify-between mb-3">
            <div className="px-4 pt-4">
              <h3 className="font-semibold text-white">Ventes Canal+ ({totalListed})</h3>
              <div className="text-xs text-blue-200">{totalListed} ventes Canal+ trouvées</div>
            </div>
            <div className="flex items-center gap-2 px-4 pt-4">
              <div className="relative">
                <button
                  onClick={() => setShowExportConfig((s)=>!s)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/20 text-white bg-white/10 hover:bg-white/20"
                >Colonnes</button>
                {showExportConfig && (
                  <div className="absolute right-0 mt-2 w-[320px] rounded-lg border border-white/10 bg-slate-900/95 backdrop-blur p-3 shadow-xl animate-fade-in z-10">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-white">Colonnes export</h4>
                      <button className="text-blue-200 text-xs hover:underline" onClick={()=>{ setExportOrder(DEFAULT_EXPORT_ORDER); setExportEnabled(Object.keys(EXPORT_COLUMNS).reduce((acc,k)=>{(acc as any)[k]=true; return acc;}, {} as Record<ExportColumnKey, boolean>)); }}>Réinitialiser</button>
                    </div>
                    <div className="max-h-64 overflow-auto pr-1 scroll-beauty">
                      {exportOrder.map((k)=> (
                        <div key={k} className="flex items-center justify-between gap-2 py-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" className="accent-cactus-600" checked={!!exportEnabled[k]} onChange={()=> setExportEnabled(prev => ({ ...prev, [k]: !prev[k] }))} />
                            <span className="text-white">{EXPORT_COLUMNS[k].label}</span>
                          </label>
                          <div className="flex items-center gap-1">
                            <button className="px-1.5 py-0.5 text-xs rounded bg-white/10 border border-white/10 text-blue-100 hover:bg-white/20" onClick={()=>moveCol(k,-1)}>↑</button>
                            <button className="px-1.5 py-0.5 text-xs rounded bg-white/10 border border-white/10 text-blue-100 hover:bg-white/20" onClick={()=>moveCol(k,1)}>↓</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-right">
                      <button className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/20 text-white bg-white/10 hover:bg-white/20" onClick={()=>setShowExportConfig(false)}>Fermer</button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={()=> exportExcel(filtered)}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/20 text-white bg-white/10 hover:bg-white/20"
                disabled={filtered.length===0}
                title={filtered.length===0 ? 'Aucune donnée à exporter' : 'Exporter Excel (.xlsx)'}
              >Export Excel</button>
              <button
                onClick={()=> exportCsv(filtered)}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/20 text-white bg-white/10 hover:bg-white/20"
                disabled={filtered.length===0}
                title={filtered.length===0 ? 'Aucune donnée à exporter' : 'Exporter CSV (.csv)'}
              >Export CSV</button>
              {error && !/requires an index/i.test(String(error)) && (
                <div className="text-rose-300 text-xs">{error}</div>
              )}
            </div>
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
                  <th className="text-left p-3">CLIENT</th>
                  <th className="text-left p-3">N° COMMANDE</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  Array.from({length:8}).map((_,i) => (
                    <tr key={i} className="border-t border-white/10">
                      {[120,140,180,110].map((w, idx) => (
                        <td key={idx} className="p-3">
                          <div className="h-4 rounded bg-white/10 overflow-hidden relative" style={{width: w}}>
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer-move" />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))
                )}
                {!loading && filtered.map((s,idx) => {
                  const d = toDate(s.date);
                  const cat = getStatusCategory(s);
                  const raw = getRawStatus(s);
                  const clientName = `${s.clientFirstName || ''} ${s.clientLastName || ''}`.trim() || '—';
                  return (
                    <tr key={s.id} className="border-t border-white/10 hover:bg-white/5 even:bg-white/[0.03] animate-fade-in" style={{animationDelay: `${Math.min(idx,30)*30}ms`}} title={`Statut: ${cat} | Brut: ${raw || '—'} | Consent: ${s.consent || '—'}`}>
                      <td className="p-3 whitespace-nowrap text-white">
                        {editingId === s.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={editingDate}
                              onChange={(e)=>setEditingDate(e.target.value)}
                              className="bg-slate-800 border border-white/10 text-slate-100 rounded p-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cactus-500"
                            />
                            <button
                              onClick={()=>saveEditDate(s.id)}
                              disabled={saving}
                              className="inline-flex items-center justify-center h-7 w-7 rounded bg-cactus-600 text-white hover:bg-cactus-500 disabled:opacity-60"
                              title="Enregistrer la date"
                              aria-label="Enregistrer"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEditDate}
                              className="inline-flex items-center justify-center h-7 w-7 rounded bg-white/10 border border-white/10 text-blue-100 hover:bg-white/20"
                              title="Annuler"
                              aria-label="Annuler"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{fmtDate(d)}</span>
                            <button
                              onClick={()=>beginEditDate(s)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded border border-white/10 text-blue-200 hover:bg-white/10"
                              title="Modifier la date"
                              aria-label="Modifier la date"
                            >
                              <Wrench className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        {editingId === s.id && saveError && (
                          <div className="text-[11px] text-rose-300 mt-1">{saveError}</div>
                        )}
                      </td>
                      <td className="p-3 text-white">{sellerName(s)}</td>
                      <td className="p-3 text-white">{clientName}</td>
                      <td className="p-3 text-white">{s.orderNumber || '—'}</td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr className="border-t border-white/10">
                    <td className="p-3 text-blue-200" colSpan={4}>Aucune vente pour les filtres courants.</td>
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
