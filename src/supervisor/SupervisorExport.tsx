import React from "react";
import { utils, writeFile } from "xlsx";
import { getAllValidatedSales } from "../services/salesService";

const SupervisorExport: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [sales, setSales] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  // Filtres UI avancés
  const [filters, setFilters] = React.useState({
    startDate: '',
    endDate: '',
    offers: [] as string[],
    statuses: [] as string[],
    agents: [] as string[],
  });

  // Region state (FR/CIV) with localStorage persistence
  const [region, setRegion] = React.useState<'FR' | 'CIV'>(() => {
    try { return ((localStorage.getItem('activeRegion') || 'FR').toUpperCase() === 'CIV') ? 'CIV' : 'FR'; } catch { return 'FR'; }
  });
  React.useEffect(() => {
    setLoading(true);
    setError(null);
    getAllValidatedSales(region)
      .then((data) => {
        setSales(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Erreur de chargement des ventes Canal+");
        setLoading(false);
      });
  }, [region]);

  // Extraction unique pour les filtres dynamiques
  const agentsList = Array.from(new Set(sales.map(s => s.name || s.userName || s.agent || ''))).filter(Boolean);
  const offersList = [
    'CANAL+',
    'CANAL+ Ciné Séries',
    'CANAL+ Sport',
    'CANAL+ 100%'
  ];
  const statusList = [
    'En attente',
    'Validé',
    'Problème IBAN',
    'ROAC',
    'Valid Soft'
  ];

  // Filtrage local avancé
  const filteredSales = sales.filter(s => {
    // Période
    if (filters.startDate) {
      const d = parseSaleDate(s.date);
      if (!d || d < new Date(filters.startDate)) return false;
    }
    if (filters.endDate) {
      const d = parseSaleDate(s.date);
      if (!d || d > new Date(filters.endDate + 'T23:59:59')) return false;
    }
    // Type d'offre (filtrage insensible à la casse, gère tableau ou string, match partiel)
    if (filters.offers.length > 0) {
      // Fonction de normalisation (enlève accents, espaces, +, etc.)
      const normalize = (str:string) => str
        .toLowerCase()
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '')
        .replace(/[+]/g, '')
        .replace(/-/g, '')
        .replace(/[^a-z0-9]/g, '');

      let saleOffers = s.offer || s.offre || '';
      if (Array.isArray(saleOffers)) {
        saleOffers = saleOffers.map((x:any) => normalize(x.toString()));
      } else if (typeof saleOffers === 'string') {
        saleOffers = saleOffers.split(/[,;]/).map(x => normalize(x));
      } else {
        saleOffers = [normalize(saleOffers.toString())];
      }
      // On veut une correspondance stricte (égalité après normalisation)
      const match = filters.offers.some(o => {
        const normO = normalize(o);
        return saleOffers.includes(normO);
      });
      if (!match) return false;
    }
    // Statut commande (champ basketStatut prioritaire, normalisation pour correspondance souple)
    if (filters.statuses.length > 0) {
      // Mapping des labels UI vers les valeurs Firestore réelles
      const normalize = (str:string) => str
        .toLowerCase()
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '')
        .replace(/[+]/g, '')
        .replace(/-/g, '')
        .replace(/[^a-z0-9]/g, '');
      const statusMap: Record<string, string[]> = {
        'Validé': ['ok'],
        'Valid Soft': ['validsoft'],
        'En attente': ['enattente','attente','att'],
        'Problème IBAN': ['problemeiban'],
        'ROAC': ['roac'],
      };
      const saleStatus = s.basketStatus || s.basketStatut || s.status || s.statut || '';
      const normSaleStatus = normalize(saleStatus);
      let match = false;
      for (const st of filters.statuses) {
        const possibles = statusMap[st] || [normalize(st)];
        if (possibles.includes(normSaleStatus)) {
          match = true;
        }
      }
      if (!match) return false;
    }
    // Télévendeurs
    if (filters.agents.length > 0 && !filters.agents.includes(s.name || s.userName || s.agent || '')) return false;
    return true;
  });

  // Utilitaire pour parser la date Firestore ou string/number
  function parseSaleDate(date: any): Date | null {
    if (!date) return null;
    // Firestore Timestamp
    if (typeof date === 'object' && date.seconds) {
      return new Date(date.seconds * 1000);
    }
    // String ou nombre
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  // Tri Date ASC/DESC
  const [dateSort, setDateSort] = React.useState<'asc' | 'desc'>('desc');
  // DEBUG : Afficher tous les statuts distincts présents dans les ventes
  const allStatuses = Array.from(new Set(sales.map(s => s.basketStatus || s.basketStatut || s.status || s.statut || '').filter(Boolean)));
  console.log('Statuts Firestore présents :', allStatuses);
  const sortedSales = [...filteredSales].sort((a, b) => {
    const da = parseSaleDate(a.date)?.getTime() || 0;
    const db = parseSaleDate(b.date)?.getTime() || 0;
    return dateSort === 'asc' ? da - db : db - da;
  });

  const handleExport = () => {
    if (!sortedSales.length) return;
    const data = sortedSales.map((s) => {
      const d = parseSaleDate(s.date);
      let numCmd = s.orderNumber || "";
      if (numCmd && typeof numCmd === "number") numCmd = `#${numCmd}`;
      else if (typeof numCmd === "string" && !numCmd.startsWith("#") && numCmd.length > 0) numCmd = `#${numCmd}`;
      return {
        Date: d ? d.toLocaleDateString('fr-FR') : '',
        Vendeur: s.name || s.userName || s.agent || "",
        "N°Commande": numCmd,
      };
    });
    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Ventes Canal+");
    writeFile(wb, `ventes_canalplus_${region.toLowerCase()}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 p-6 max-w-[1600px] mx-auto">
      {/* Filtres */}
      <div className="bg-[#131a28] rounded-2xl border border-[#1a2233] p-7 w-full max-w-[370px] flex-shrink-0 shadow-xl" style={{minWidth:'340px'}}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-blue-200 text-[13px] font-semibold tracking-[0.18em] uppercase">FILTRES</span>
          </div>
          <button className="text-red-400 text-base font-semibold flex items-center gap-1 hover:underline" onClick={() => setFilters({startDate:'',endDate:'',offers:[],statuses:[],agents:[]})}>
            <span className="text-xl">✖</span> Effacer tout
          </button>
        </div>
        {/* Période */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2"><span className="text-blue-100 text-xs">PÉRIODE</span></div>
          <div className="flex gap-2">
            <div className="flex flex-col">
              <label className="text-xs text-blue-100 mb-1">Date de début</label>
              <input type="date" className="rounded-lg bg-[#0d1220] border border-[#22334a] px-3 py-2 text-blue-100" value={filters.startDate} onChange={e => setFilters(f => ({...f, startDate: e.target.value}))} placeholder="jj/mm/aaaa" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-blue-100 mb-1">Date de fin</label>
              <input type="date" className="rounded-lg bg-[#0d1220] border border-[#22334a] px-3 py-2 text-blue-100" value={filters.endDate} onChange={e => setFilters(f => ({...f, endDate: e.target.value}))} placeholder="jj/mm/aaaa" />
            </div>
          </div>
        </div>
        {/* Type d'offre */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2"><span className="text-blue-100 text-xs">TYPE D'OFFRE</span></div>
          <div className="flex flex-wrap gap-2">
            {offersList.map(o => (
              <button key={o} type="button" className={`px-3 py-1 rounded-lg border text-sm font-semibold transition ${filters.offers.includes(o) ? 'bg-blue-700 border-blue-400 text-white' : 'bg-[#151e2e] border-[#22334a] text-blue-100'}`} onClick={() => setFilters(f => ({...f, offers: f.offers.includes(o) ? f.offers.filter(x=>x!==o) : [...f.offers, o]}))}>{o}</button>
            ))}
          </div>
        </div>
        {/* Statut commande */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2"><span className="text-blue-100 text-xs">STATUT COMMANDE</span></div>
          <div className="flex flex-wrap gap-2">
            {statusList.map((s, idx) => (
              <button key={s} type="button" className={`px-3 py-1 rounded-lg border text-sm font-semibold transition flex items-center gap-2 ${filters.statuses.includes(s) ? (s==='Validé' ? 'bg-green-900 border-green-400 text-green-200' : s==='En attente' ? 'bg-yellow-900 border-yellow-400 text-yellow-200' : s==='Problème IBAN' ? 'bg-pink-900 border-pink-400 text-pink-200' : 'bg-blue-700 border-blue-400 text-white') : 'bg-[#151e2e] border-[#22334a] text-blue-100'}`}
                onClick={() => setFilters(f => ({...f, statuses: f.statuses.includes(s) ? f.statuses.filter(x=>x!==s) : [...f.statuses, s]}))}>
                {s==='En attente' && <span className="inline-block w-2 h-2 rounded-full bg-yellow-300"></span>}
                {s==='Validé' && <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>}
                {s==='Problème IBAN' && <span className="inline-block w-2 h-2 rounded-full bg-pink-300"></span>}
                {s==='Valid Soft' && <span className="inline-block w-2 h-2 rounded-full bg-purple-200"></span>}
                {s==='ROAC' && <span className="inline-block w-2 h-2 rounded-full bg-gray-300"></span>}
                {s}
              </button>
            ))}
          </div>
        </div>
        {/* Télévendeurs */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2"><span className="text-blue-100 text-xs">TÉLÉVENDEURS</span></div>
          <div className="max-h-32 overflow-y-auto flex flex-col gap-1 pr-1">
            {agentsList.map(a => (
              <label key={a} className="flex items-center gap-2 text-blue-100 text-[15px] font-medium cursor-pointer select-none">
                <input type="checkbox" checked={filters.agents.includes(a)} onChange={() => setFilters(f => ({...f, agents: f.agents.includes(a) ? f.agents.filter(x=>x!==a) : [...f.agents, a]}))} className="accent-blue-500 w-4 h-4" />
                {a}
              </label>
            ))}
          </div>
        </div>
        <div className="text-xs text-blue-300 mt-2">Par défaut, toutes les ventes sont affichées</div>
      </div>

      {/* Tableau + export */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-row justify-between items-center mb-6">
          <div>
            <h2 className="text-white text-2xl font-bold leading-tight mb-0">Ventes Canal+ — {region}</h2>
            <p className="text-[#b2becd] text-base font-normal mt-1 mb-0">{filteredSales.length} ventes affichées</p>
          </div>
          {/* Region switcher */}
          <div className="flex items-center gap-2">
            <span className="text-blue-200 text-sm">Région</span>
            <select
              value={region}
              onChange={(e)=>{ const r = (e.target.value === 'CIV' ? 'CIV' : 'FR') as 'FR'|'CIV'; setRegion(r); try{localStorage.setItem('activeRegion', r);}catch{}}}
              className="rounded-lg bg-[#0d1220] border border-[#22334a] px-3 py-2 text-blue-100"
            >
              <option value="FR">FR</option>
              <option value="CIV">CIV</option>
            </select>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-semibold shadow-lg hover:from-blue-700 hover:to-indigo-600 transition text-base tracking-wide"
            disabled={loading || !filteredSales.length}
          >
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path fill="#fff" d="M12 16.5a1 1 0 0 1-1-1V5.83l-3.59 3.58A1 1 0 0 1 6 8.41a1 1 0 0 1 0-1.41l5-5a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1-1.41 1.41L13 5.83V15.5a1 1 0 0 1-1 1Z"/><path fill="#fff" d="M19 20.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6a1 1 0 1 1 2 0v5h10v-5a1 1 0 1 1 2 0v6Z"/></svg>
            EXPORT XLSX
          </button>
        </div>
        <div className="bg-[#172635] rounded-2xl border border-[#22334a] p-6 shadow-lg">
          <h3 className="text-white text-xl font-bold mb-4">Historique ({region})</h3>
          {error && <div className="text-red-400 mb-4">{error}</div>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-base text-blue-100">
              <thead>
                <tr className="border-b border-[#22334a] bg-[#1e3147]">
                  <th className="py-2 px-4 text-left cursor-pointer select-none" onClick={() => setDateSort(dateSort === 'asc' ? 'desc' : 'asc')}>
                    Date
                    <span className="ml-2 align-middle text-blue-300 text-xs">
                      {dateSort === 'asc' ? '▲' : '▼'}
                    </span>
                  </th>
                  <th className="py-2 px-4 text-left">Vendeur</th>
                  <th className="py-2 px-4 text-left">N°Commande</th>
                  <th className="py-2 px-4 text-left">Statut (debug)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="py-4 px-4 text-center text-blue-300">Chargement…</td></tr>
                ) : sortedSales.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 px-4 text-center text-blue-300">Aucune vente</td></tr>
                ) : (
                  sortedSales.map((s, i) => {
                    const d = parseSaleDate(s.date);
                    let numCmd = s.orderNumber || "";
                    if (numCmd && typeof numCmd === "number") numCmd = `#${numCmd}`;
                    else if (typeof numCmd === "string" && !numCmd.startsWith("#") && numCmd.length > 0) numCmd = `#${numCmd}`;
                    return (
                      <tr key={s.id || s.saleId || i} className="border-b border-[#22334a] hover:bg-[#22334a]/40 transition-colors">
                        <td className="py-2 px-4">{d ? d.toLocaleDateString('fr-FR') : ''}</td>
                        <td className="py-2 px-4 font-semibold text-white">{s.name || s.userName || s.agent || ""}</td>
                        <td className="py-2 px-4">{numCmd}</td>
                        <td className="py-2 px-4 text-xs text-blue-200">
                          {s.basketStatus || s.basketStatut || s.status || s.statut || ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupervisorExport;