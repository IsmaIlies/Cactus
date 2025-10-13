import React from 'react';
import { collection, orderBy, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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

const HEADERS = [
  'ID',
  'Heure de début',
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
  'Numéro de téléphone de la fiche',
] as const;

const formatTime = (d: Date | null) => {
  if (!d) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toCsv = (rows: LeadRow[]) => {
  // Build a ; separated CSV with Windows CRLF line endings and BOM for Excel
  const lines: string[] = [];
  lines.push(HEADERS.join(';'));
  for (const r of rows) {
    const values = [
      r.id,
      formatTime(r.createdAt),
      '', // Heure de fin — non enregistré aujourd'hui
      r.email || '',
      r.displayName || '',
      r.numeroId || '',
      r.typeOffre || '',
      r.intituleOffre || '',
      r.referencePanier || '',
      r.codeAlf || '',
      r.ficheDuJour || '',
      r.origineLead || '',
      r.dateTechnicien || '',
      r.telephone || '',
    ];
    // Escape ; and quotes minimally
    const escaped = values.map((v) =>
      /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}` : v
    );
    lines.push(escaped.join(';'));
  }
  const csv = '\uFEFF' + lines.join('\r\n');
  return csv;
};

const SupervisorLeadsPage: React.FC = () => {
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Ventes LEADS — Tableau</h1>
            <p className="text-sm text-gray-600">Données: collection Firestore « leads_sales » (mission ORANGE_LEADS)</p>
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

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={HEADERS.length} className="px-3 py-6 text-center text-gray-500">Chargement…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={HEADERS.length} className="px-3 py-6 text-center text-gray-500">Aucun résultat</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.id}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatTime(r.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{/* Heure de fin inconnue */}</td>
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
