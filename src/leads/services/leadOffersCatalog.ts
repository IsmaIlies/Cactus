import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebase';
import * as XLSX from 'xlsx';

export type CatalogGroup = { name: string; items: string[] };
export type LeadOfferCatalog = {
  updatedAt: number;
  items: string[];
  groups?: CatalogGroup[];
};

const CATALOG_DOC = doc(db, 'leads_config', 'offers');

// Normalize labels: fix common CP-1252/UTF-8 mojibake, smart quotes, dashes, NBSP, BOM and trim
function normalizeLabel(input: string): string {
  if (!input) return '';
  let s = String(input);
  // Remove BOM if present
  s = s.replace(/^\uFEFF/, '');
  // Replace non-breaking spaces and control chars with normal spaces
  s = s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  // Remove stray 'Â' produced by cp1252/utf-8 mismatch
  s = s.replace(/\u00C2/g, ''); // Â
  // Remove Unicode replacement characters that may result from bad decoding
  s = s.replace(/\uFFFD/g, '');
  // Fix common mojibake sequences
  const map: Record<string, string> = {
    'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë', 'Ã ': 'à', 'Ã¢': 'â', 'Ã§': 'ç',
    'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü', 'Ã´': 'ô', 'Ã¶': 'ö', 'Ã¯': 'ï', 'Ã‰': 'É',
      'â‚¬': '€', 'â€“': '–', 'â€”': '—', 'â€¦': '…', 'â€™': '’', 'â€˜': '‘',
      'â€œ': '“', 'â€\u009d': '”', 'Â°': '°', 'Â®': '®', 'Â©': '©', 'â„¢': '™'
  };
  for (const [bad, good] of Object.entries(map)) {
    s = s.split(bad).join(good);
  }
  // Replace smart quotes/dashes if still present
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ');
  // Unicode normalize NFC to compose characters
  s = s.normalize('NFC');
  return s.trim();
}

export async function getLeadOffersCatalog(): Promise<LeadOfferCatalog | null> {
  const snap = await getDoc(CATALOG_DOC);
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  const items: string[] = Array.isArray(data?.items)
    ? data.items
        .filter((s: any) => typeof s === 'string')
        .map((v: string) => normalizeLabel(v))
    : [];
  const groups: CatalogGroup[] | undefined = Array.isArray(data?.groups)
    ? data.groups
        .map((g: any) => ({
          name: typeof g?.name === 'string' ? normalizeLabel(g.name) : 'Catalogue',
          items: Array.isArray(g?.items) ? g.items.filter((s: any) => typeof s === 'string').map((v: string) => normalizeLabel(v)) : [],
        }))
        .filter((g: CatalogGroup) => g.items.length > 0)
    : undefined;
  return { updatedAt: Number(data?.updatedAt) || Date.now(), items, groups };
}

export async function setLeadOffersCatalog(items: string[], groups?: CatalogGroup[] | null) {
  const clean = items
    .map((s) => (typeof s === 'string' ? normalizeLabel(s) : ''))
    .filter((s) => s.length > 0)
    .slice(0, 2000); // hard cap safety
  const base: any = { updatedAt: Date.now(), items: clean };
  if (groups === null) {
    base.groups = deleteField();
  } else if (groups && groups.length > 0) {
    base.groups = groups.map((g) => ({
      name: normalizeLabel(g.name),
      items: Array.from(new Set(g.items.map((s) => normalizeLabel(s)).filter(Boolean))).slice(0, 2000),
    }));
  }
  await setDoc(CATALOG_DOC, base, { merge: true });
}

function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // collapse non-alnum
    .trim();
}

function findAlfColumn(headers: string[]): number {
  let idx = -1;
  headers.forEach((h, i) => {
    const n = normalizeHeader(String(h || ''));
    const hasAlf = n.includes('alf');
    const isLibelle = n.includes('libelle') || n.includes('libell');
    if (hasAlf && isLibelle && idx === -1) idx = i;
  });
  return idx;
}

export function parseCsvOffers(csvText: string): string[] {
  // Accept either ; or , separator, try to detect header with Libellé ALF
  const rows = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => (line.includes(';') ? line.split(';') : line.split(',')));

  if (rows.length === 0) return [];
  const firstRow = rows[0].map((c) => c.trim());
  let alfIdx = findAlfColumn(firstRow);
  const items: string[] = [];
  rows.forEach((cols, rowIdx) => {
    const cells = cols.map((c) => String(c).trim());
    let value = '';
    if (alfIdx >= 0) {
      if (rowIdx === 0) return; // skip header row when ALF header detected
      value = cells[alfIdx] || '';
    } else {
      // fallback: take first non-empty cell, skip header-like
      const candidate = cells.find((p) => p.length > 0) || '';
      if (rowIdx === 0 && /intitul[eé]|offre|label|alf/i.test(candidate)) return;
      value = candidate;
    }
    const norm = normalizeLabel(value);
    if (norm) items.push(norm);
  });
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

export type XlsxSheetOffers = { name: string; items: string[] };
export type XlsxOffersParseResult = { flat: string[]; sheets: XlsxSheetOffers[] };

export async function parseXlsxOffers(buffer: ArrayBuffer): Promise<XlsxOffersParseResult> {
  const wb = XLSX.read(buffer, { type: 'array' });
  const perSheet: XlsxSheetOffers[] = [];
  const all = new Set<string>(); // preserves insertion order
  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    // Get rows as arrays including headers
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows || rows.length === 0) return;
    const header = rows[0] as string[];
    const idx = findAlfColumn(header);
    const items: string[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] as any[];
      const val = idx >= 0 ? String(row[idx] ?? '').trim() : String((row.find((c) => String(c).trim().length > 0) ?? '')).trim();
      const norm = normalizeLabel(val);
      if (!norm) continue;
      items.push(norm);
      // Add to global flat list preserving sheet/row order
      if (!all.has(norm)) all.add(norm);
    }
    // De-dupe preserving original sheet order (no sort). If this is a TOTAL sheet and empty, we'll fill later.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const v of items) {
      if (v && !seen.has(v)) {
        seen.add(v);
        ordered.push(v);
      }
    }
    perSheet.push({ name: normalizeLabel(sheetName), items: ordered });
  });
  let flat = Array.from(all); // already in insertion order
  // If there is a sheet named TOTAL but it had no items, fill it with the global flat list
  const idxTotal = perSheet.findIndex((s) => /^total$/i.test(s.name));
  if (idxTotal >= 0 && perSheet[idxTotal].items.length === 0) {
    perSheet[idxTotal] = { name: perSheet[idxTotal].name, items: flat.slice() };
  } else if (idxTotal >= 0 && perSheet[idxTotal].items.length > 0) {
    // Use the TOTAL sheet as the authoritative global list if it exists and has content
    flat = perSheet[idxTotal].items.slice();
  }
  return { flat, sheets: perSheet };
}

export function parseCsvOffersAdvanced(csvText: string): { flat: string[]; sheets: XlsxSheetOffers[] } {
  // Parse CSV into rows
  const rows = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => (line.includes(';') ? line.split(';') : line.split(',')));
  if (rows.length === 0) return { flat: [], sheets: [] };
  const header = rows[0].map((h) => String(h).trim());
  const alfIdx = findAlfColumn(header);
  // Detect group column
  const normalizedHeaders = header.map((h) => normalizeHeader(h));
  const groupIdx = normalizedHeaders.findIndex((h) => /^(groupe|feuille|sheet|categorie|categorie|cat|grouper)$/.test(h));

  const groupsOrder: string[] = [];
  const groupMap = new Map<string, string[]>();
  const flatSet = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r].map((c) => String(c).trim());
    const raw = alfIdx >= 0 ? cells[alfIdx] : (cells.find((p) => p.length > 0) || '');
    const title = normalizeLabel(raw);
    if (!title) continue;
    // Flat accumulation preserving order
    if (!flatSet.has(title)) flatSet.add(title);

    if (groupIdx >= 0) {
      const gNameRaw = cells[groupIdx] || '';
      const gName = normalizeLabel(gNameRaw) || 'Autres';
      if (!groupMap.has(gName)) {
        groupMap.set(gName, []);
        groupsOrder.push(gName);
      }
      const arr = groupMap.get(gName)!;
      if (!arr.includes(title)) arr.push(title);
    }
  }

  const sheets: XlsxSheetOffers[] = groupsOrder.map((g) => ({ name: g, items: groupMap.get(g)! }));
  const flat = Array.from(flatSet);
  return { flat, sheets };
}
