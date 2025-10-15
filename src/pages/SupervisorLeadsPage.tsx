import React from 'react';
import { collection, orderBy, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LeadKpiSnapshot,
  subscribeToLeadKpis,
  subscribeToLeadMonthlyTotalsAllSources,
} from '../leads/services/leadsSalesService';

type LeadRow = {
  id: string; // Firestore doc id (export: ID)
  createdAt: Date | null; // used for "Heure de début"
  // createdAt is the only timestamp we store today; no explicit end time in DB
  email: string | null; // createdBy.email
  displayName: string | null; // createdBy.displayName
  numeroId: string | null; // DID
  typeOffre: string | null;
  intituleOffre: string | null;
  referencePanier: string | null;
  codeAlf: string | null; // unknown in DB → left null for now
  ficheDuJour: string | null; // oui|non|campagne tiède
  origineLead: string | null; // hipto|dolead|mm
  dateTechnicien: string | null; // YYYY-MM-DD or null
  telephone: string | null;
};

// En-têtes du tableau UI (on retire Heure de début/fin et on affiche une Date unique)
const TABLE_HEADERS = [
  'ID',
  'Date',
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
  'Numéro de téléphone de la fiche',
] as const;

// En-têtes de l'export CSV pour ressembler à PANIER LEADS.xlsx
const CSV_HEADERS = [
  'Id',
  'Heure de début',
  'Heure de fin',
  'Adresse de messagerie',
  'Nom',
  'DID',
  "Type d'offre",
  "Intitulé de l'offre (jaune)",
] as const;

const pad = (n: number) => n.toString().padStart(2, '0');
const formatDate = (d: Date | null) => {
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const toCsv = (rows: LeadRow[]) => {
  // Build a ; separated CSV with Windows CRLF line endings and BOM for Excel
  const lines: string[] = [];
  lines.push(CSV_HEADERS.join(';'));
  rows.forEach((r, i) => {
    const day = formatDate(r.createdAt);
    const values = [
      String(i + 1), // Id séquentiel pour Excel
      day, // Heure de début (date du jour)
      day, // Heure de fin (même date — pas d'heure de fin)
      r.email || '',
      r.displayName || '',
      r.numeroId || '',
      r.typeOffre || '',
      r.intituleOffre || '',
    ];
    const escaped = values.map((v) =>
      /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}` : v
    );
    lines.push(escaped.join(';'));
  });
  const csv = '\uFEFF' + lines.join('\r\n');
  return csv;
};

const SupervisorLeadsPage: React.FC = () => {
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [kpis, setKpis] = React.useState<LeadKpiSnapshot>({
    hipto: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
    dolead: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
    mm: { mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 },
  });
  const [monthlyTotals, setMonthlyTotals] = React.useState({ mobiles: 0, box: 0, mobileSosh: 0, internetSosh: 0 });

  const mapDoc = (doc: any): LeadRow => {
    const data = doc.data() as any;
    const createdAtTs: Timestamp | null = data?.createdAt ?? null;
    const createdAt = createdAtTs ? createdAtTs.toDate() : null;
    return {
      id: doc.id,
      createdAt,
      email: data?.createdBy?.email ?? null,
      displayName: data?.createdBy?.displayName ?? null,
      numeroId: data?.numeroId ?? null,
      typeOffre: data?.typeOffre ?? null,
      intituleOffre: data?.intituleOffre ?? null,
      referencePanier: data?.referencePanier ?? null,
      codeAlf: data?.codeAlf ?? null, // souvent absent aujourd'hui
      ficheDuJour: data?.ficheDuJour ?? null,
      origineLead: data?.origineLead ?? null,
      dateTechnicien: data?.dateTechnicien ?? null,
      telephone: data?.telephone ?? null,
    };
  };

  // Fetch latest leads (mission == ORANGE_LEADS), order by createdAt desc with fallback if index missing.
  React.useEffect(() => {
    setLoading(true);
    setError(null);

    let unsub: (() => void) | null = null;
    const primary = query(
      collection(db, 'leads_sales'),
      where('mission', '==', 'ORANGE_LEADS'),
      orderBy('createdAt', 'desc')
    );

    try {
      unsub = onSnapshot(
        primary,
        (snap) => {
          const list = snap.docs.map(mapDoc);
          setRows(list);
          setLoading(false);
        },
        async (err) => {
          const code = (err as any)?.code;
          if (code === 'failed-precondition') {
            // Fallback without orderBy; sort client-side
            try { unsub && unsub(); } catch {}
            const fb = query(collection(db, 'leads_sales'), where('mission', '==', 'ORANGE_LEADS'));
            unsub = onSnapshot(
              fb,
              (snap2) => {
                const list = snap2.docs.map(mapDoc).sort((a, b) => {
                  const ta = a.createdAt ? a.createdAt.getTime() : 0;
                  const tb = b.createdAt ? b.createdAt.getTime() : 0;
                  return tb - ta;
                });
                setRows(list);
                setLoading(false);
              },
              (err2) => {
                setError((err2 as any)?.message || 'Lecture impossible');
                setLoading(false);
              }
            );
          } else if (code === 'permission-denied') {
            setError("Accès refusé par les règles Firestore. Vérifie l'authentification et les règles.");
            setLoading(false);
          } else {
            setError((err as any)?.message || 'Erreur de lecture');
            setLoading(false);
          }
        }
      );
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue');
      setLoading(false);
    }

    return () => { try { unsub && unsub(); } catch {} };
  }, []);

  // KPI realtime: today by source + monthly totals all sources
  React.useEffect(() => {
    const un1 = subscribeToLeadKpis((snapshot) => setKpis(snapshot));
    const un2 = subscribeToLeadMonthlyTotalsAllSources((tot) => setMonthlyTotals(tot));
    return () => {
      try { (un1 as any)?.(); } catch {}
      try { (un2 as any)?.(); } catch {}
    };
  }, []);

  const handleExport = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    a.download = `leads_sales_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalJour = React.useMemo(() => {
    const sources = ['hipto','dolead','mm'] as const;
    return sources.reduce((acc, key) => {
      const m = (kpis as any)[key] || { mobiles: 0, box: 0 };
      return { mobiles: acc.mobiles + m.mobiles, box: acc.box + m.box };
    }, { mobiles: 0, box: 0 });
  }, [kpis]);

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Supervision LEADS</h1>
            <p className="text-sm text-gray-600">Données: Firestore « leads_sales » (mission ORANGE_LEADS)</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              disabled={rows.length === 0}
              title={rows.length === 0 ? 'Aucune donnée à exporter' : 'Exporter en CSV'}
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <section className="grid gap-4 md:grid-cols-4">
          {/* Jour total */}
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500">Total du jour</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <p className="text-[12px] text-gray-500">Mobiles</p>
                <p className="text-xl font-semibold text-gray-900">{totalJour.mobiles}</p>
              </div>
              <div>
                <p className="text-[12px] text-gray-500">Box</p>
                <p className="text-xl font-semibold text-gray-900">{totalJour.box}</p>
              </div>
            </div>
          </div>

          {/* Sources */}
          {([
            { key: 'hipto', label: 'Hipto', color: 'text-sky-700' },
            { key: 'dolead', label: 'Dolead', color: 'text-violet-700' },
            { key: 'mm', label: 'MM', color: 'text-blue-700' },
          ] as const).map((s) => (
            <div key={s.key} className="rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-4 shadow-sm">
              <p className={`text-xs uppercase tracking-wider text-gray-600`}>{s.label}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[12px] text-gray-500">Mobiles</p>
                  <p className={`text-xl font-semibold ${s.color}`}>{kpis[s.key as keyof LeadKpiSnapshot].mobiles}</p>
                  <p className="text-[12px] text-gray-500">dont Sosh: {kpis[s.key as keyof LeadKpiSnapshot].mobileSosh}</p>
                </div>
                <div>
                  <p className="text-[12px] text-gray-500">Box</p>
                  <p className={`text-xl font-semibold ${s.color}`}>{kpis[s.key as keyof LeadKpiSnapshot].box}</p>
                  <p className="text-[12px] text-gray-500">dont Sosh: {kpis[s.key as keyof LeadKpiSnapshot].internetSosh}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Cumul mensuel */}
        <section className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">Cumul mensuel</p>
              <h2 className="text-base font-semibold text-gray-900">Performance Leads</h2>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[12px] text-gray-500">Mobiles</p>
              <p className="text-2xl font-semibold text-gray-900">{monthlyTotals.mobiles}</p>
              <p className="text-[12px] text-gray-500 mt-1">dont Sosh: {monthlyTotals.mobileSosh}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[12px] text-gray-500">Box</p>
              <p className="text-2xl font-semibold text-gray-900">{monthlyTotals.box}</p>
              <p className="text-[12px] text-gray-500 mt-1">dont Sosh: {monthlyTotals.internetSosh}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {TABLE_HEADERS.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={TABLE_HEADERS.length} className="px-3 py-6 text-center text-gray-500">Chargement…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={TABLE_HEADERS.length} className="px-3 py-6 text-center text-gray-500">Aucun résultat</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.id}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{r.email || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.displayName || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.numeroId || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.typeOffre || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-[13px]">
                        {r.intituleOffre || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.referencePanier || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.codeAlf || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.ficheDuJour || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.origineLead || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.dateTechnicien || '—'}</td>
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.telephone || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SupervisorLeadsPage;
