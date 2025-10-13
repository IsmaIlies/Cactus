import React from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { Timestamp, collection, doc, getDoc, writeBatch } from 'firebase/firestore';

type LeadCsvRow = {
  id?: string;
  createdAt?: Date | null;
  email?: string;
  displayName?: string;
  numeroId?: string;
  typeOffre?: string;
  intituleOffre?: string;
  referencePanier?: string;
  codeAlf?: string;
  ficheDuJour?: string;
  origineLead?: string;
  dateTechnicien?: string;
  telephone?: string;
};

function norm(h: string) {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseDateLike(val?: string | null): Date | null {
  if (!val) return null;
  const s = String(val).trim();
  // Try ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  // Try dd/mm/yyyy or dd-mm-yyyy possibly with time HH:mm
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const dd = parseInt(m[1], 10); const mm = parseInt(m[2], 10) - 1; const yyyy = parseInt(m[3].length === 2 ? ('20' + m[3]) : m[3], 10);
    const HH = m[4] ? parseInt(m[4], 10) : 0; const MM = m[5] ? parseInt(m[5], 10) : 0;
    const d = new Date(yyyy, mm, dd, HH, MM, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseTimeOn(date: Date | null, t?: string | null): Date | null {
  if (!date) return null;
  if (!t) return date;
  const m = String(t).trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return date;
  const d = new Date(date); d.setHours(parseInt(m[1],10), parseInt(m[2],10), 0, 0); return d;
}

// Basic CSV parser supporting ; or , and quoted fields with "" escaping
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0; let field = ''; let inQuotes = false; const current: string[] = [];
  const pushField = () => { current.push(field); field=''; };
  const pushRow = () => { rows.push([...current]); current.length = 0; };
  const sep = text.indexOf(';') !== -1 && (text.indexOf(';') < text.indexOf(',' ) || text.indexOf(',') === -1) ? ';' : ',';
  while (i < text.length) {
    const ch = text[i++];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === '\n') { pushField(); pushRow(); }
      else if (ch === '\r') { /* skip */ }
      else if (ch === sep) { pushField(); }
      else { field += ch; }
    }
  }
  // flush
  if (field.length > 0 || current.length > 0) { pushField(); pushRow(); }
  // remove empty last row if present
  if (rows.length && rows[rows.length-1].every(c => c === '')) rows.pop();
  return rows;
}

const SupervisorImport: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const isLeads = (area || '').toUpperCase() === 'LEADS';
  const [rows, setRows] = React.useState<LeadCsvRow[]>([]);
  const [fileName, setFileName] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [skipExisting, setSkipExisting] = React.useState(true);

  const onFile = async (f: File) => {
    setMessage(null);
    const buf = await f.text();
    const table = parseCsv(buf);
    if (!table.length) { setRows([]); return; }
    setFileName(f.name);
    const header = table[0].map(h => norm(h));
    const H = (...names: string[]) => header.findIndex(h => names.map(norm).includes(h));

    // Try detect date/time columns
    const idxId = H('id');
    const idxCreatedAt = H('created at','created_at','date','jour');
    const idxTimeStart = H('heure de debut','heure debut','heure','hdebut');
    const idxEmail = H('adresse de messagerie','email','mail');
    const idxNom = H('nom','display name','auteur','vendeur');
    const idxDid = H('did','numero id','numeroid');
    const idxType = H("type d offre","type d'offre","type offre","type");
    const idxIntitule = H("intitule de l offre jaune","intitule de l offre","intitule offre","intitule");
    const idxPanier = H('reference du panier','reference panier','panier');
    const idxAlf = H('code alf','alf');
    const idxFiche = H('fiche du jour','fiche');
    const idxOrigine = H('origine leads','origine lead','origine');
    const idxDateTech = H('date technicien','date tech');
    const idxPhone = H('numero de telephone de la fiche','telephone','tel');

    const body = table.slice(1).map((r) => {
      const get = (i: number) => (i >= 0 && i < r.length ? r[i] : '').trim();
      let date: Date | null = parseDateLike(get(idxCreatedAt));
      if (!date && idxCreatedAt >= 0 && idxTimeStart >= 0) {
        const d = parseDateLike(get(idxCreatedAt));
        date = parseTimeOn(d, get(idxTimeStart));
      } else if (!date && idxTimeStart >= 0) {
        // If only time provided, assume today
        date = parseTimeOn(new Date(), get(idxTimeStart));
      }
      const row: LeadCsvRow = {
        id: idxId >= 0 ? get(idxId) : undefined,
        createdAt: date,
        email: idxEmail >= 0 ? get(idxEmail) : undefined,
        displayName: idxNom >= 0 ? get(idxNom) : undefined,
        numeroId: idxDid >= 0 ? get(idxDid) : undefined,
        typeOffre: idxType >= 0 ? get(idxType) : undefined,
        intituleOffre: idxIntitule >= 0 ? get(idxIntitule) : undefined,
        referencePanier: idxPanier >= 0 ? get(idxPanier) : undefined,
        codeAlf: idxAlf >= 0 ? get(idxAlf) : undefined,
        ficheDuJour: idxFiche >= 0 ? get(idxFiche) : undefined,
        origineLead: idxOrigine >= 0 ? get(idxOrigine) : undefined,
        dateTechnicien: idxDateTech >= 0 ? get(idxDateTech) : undefined,
        telephone: idxPhone >= 0 ? get(idxPhone) : undefined,
      };
      return row;
    });
    setRows(body);
  };

  const importLeads = async () => {
    setLoading(true); setMessage(null);
    try {
      const CHUNK = 450; // under 500 writes per batch
      const items = rows.filter(r => r.createdAt);
      let imported = 0; let skipped = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        const slice = items.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        // optionally check existing if skipExisting and id provided
        const toWrite: Array<{id?: string,row: LeadCsvRow}> = [];
        if (skipExisting) {
          for (const row of slice) {
            if (row.id) {
              const ref = doc(collection(db, 'leads_sales'), row.id);
              const ex = await getDoc(ref);
              if (ex.exists()) { skipped++; continue; }
              toWrite.push({ id: row.id, row });
            } else {
              toWrite.push({ row });
            }
          }
        } else {
          toWrite.push(...slice.map(row => ({ id: row.id, row })));
        }
        for (const { id, row } of toWrite) {
          const ref = id ? doc(collection(db, 'leads_sales'), id) : doc(collection(db, 'leads_sales'));
          batch.set(ref, {
            mission: 'ORANGE_LEADS',
            createdAt: row.createdAt ? Timestamp.fromDate(row.createdAt) : Timestamp.now(),
            createdBy: { email: row.email || null, displayName: row.displayName || null },
            numeroId: row.numeroId || null,
            typeOffre: row.typeOffre || null,
            intituleOffre: row.intituleOffre || null,
            referencePanier: row.referencePanier || null,
            codeAlf: row.codeAlf || null,
            ficheDuJour: row.ficheDuJour || null,
            origineLead: row.origineLead || null,
            dateTechnicien: row.dateTechnicien || null,
            telephone: row.telephone || null,
            importedFrom: fileName || 'upload',
            importedAt: Timestamp.now(),
          }, { merge: false });
        }
        await batch.commit();
        imported += toWrite.length;
      }
      setMessage(`Import terminé: ${imported} lignes importées, ${skipped} ignorées (existants).`);
    } catch (e: any) {
      setMessage(`Erreur import: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-white text-lg font-semibold">Import ventes historiques {isLeads ? 'LEADS' : ''}</h2>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-blue-200 text-sm mb-2">Fichier CSV (.csv, séparateur ; ou ,)</p>
          <input type="file" accept=".csv,text/csv" onChange={e => e.target.files && onFile(e.target.files[0])} className="text-slate-100" />
          {fileName && <div className="text-blue-200 text-sm mt-1">Fichier: {fileName}</div>}
          <div className="mt-3 flex items-center gap-3">
            <label className="text-blue-100 text-sm inline-flex items-center gap-2">
              <input type="checkbox" checked={skipExisting} onChange={e => setSkipExisting(e.target.checked)} className="accent-cactus-600" />
              Ne pas écraser les documents existants (même ID)
            </label>
            <button disabled={!rows.length || loading}
              onClick={importLeads}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-white/20 text-white bg-white/10 hover:bg-white/20 disabled:opacity-50">
              {loading ? 'Import…' : `Importer ${rows.length} lignes`}
            </button>
          </div>
          {message && <div className="text-blue-200 text-sm mt-2">{message}</div>}
        </div>

        {rows.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-0">
            <div className="px-4 py-3 text-blue-200 text-sm">Aperçu (10 premières lignes)</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/70 border-b border-white/10">
                  <tr className="text-blue-200">
                    {['ID','createdAt','email','displayName','numeroId','typeOffre','intituleOffre','referencePanier','codeAlf','ficheDuJour','origineLead','dateTechnicien','telephone']
                      .map(h => <th key={h} className="text-left p-3 whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,10).map((r,i) => (
                    <tr key={i} className="border-t border-white/10 hover:bg-white/5">
                      <td className="p-3 text-white whitespace-nowrap">{r.id || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.createdAt ? r.createdAt.toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.email || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.displayName || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.numeroId || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.typeOffre || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.intituleOffre || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.referencePanier || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.codeAlf || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.ficheDuJour || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.origineLead || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.dateTechnicien || '—'}</td>
                      <td className="p-3 text-white whitespace-nowrap">{r.telephone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupervisorImport;
