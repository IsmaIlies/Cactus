// Centralized CSV builder for Checklist/Archives exports
// Ensures identical headers, FR formatting, BOM + semicolon + CRLF

export type ChecklistCsvInput = Array<{
  // Dates (ms or Date)
  date: Date | number | string
  // Agent
  agentName: string
  agentEmail?: string
  // Supervisor name
  supervisor?: string | null
  // Time slots (strings like "08:00")
  morningStart?: string | null
  morningEnd?: string | null
  afternoonStart?: string | null
  afternoonEnd?: string | null
  // Derived flags
  includeMorning?: boolean
  includeAfternoon?: boolean
  // Business context
  project?: string | null
  notes?: string | null
  mission?: string | null
  region?: string | null
  // Status (internal values: approved|pending|rejected or custom)
  status?: string | null
}>;

export type ChecklistCsvOptions = {
  // Filename hint
  filenameBase?: string
  // If true, also include a Total (min) technical column for audits
  includeTotalMinutesColumn?: boolean
  // Override headers and mapping to match a specific template
  // Provide exactly the list of headers and a mapper producing values by header.
  customSchema?: {
    headers: string[]
    mapRow: (row: ReturnType<typeof normalizeRow>) => Record<string, string>
    // Optional second header row (values aligned to headers)
    secondHeader?: string[]
  }
};

function toFRDate(d: Date | number | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toMinutes(hhmm?: string | null): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map((x) => parseInt(x || '0', 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function intervalMinutes(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

function toHhMm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toHourDecimalFR(totalMin: number): string {
  const dec = totalMin / 60;
  // French decimal comma
  const s = dec.toString();
  return s.replace('.', ',');
}

function statusToFR(s?: string | null): string {
  switch ((s || '').toLowerCase()) {
    case 'approved':
    case 'valide':
    case 'validé':
      return 'Validé';
    case 'rejected':
    case 'refuse':
    case 'refusé':
      return 'Refusé';
    case 'pending':
    case 'en_attente':
    case 'en attente':
    default:
      return 'En attente';
  }
}

function normalizeRow(row: ChecklistCsvInput[number]) {
  const morning = (row.includeMorning ?? !!(row.morningStart && row.morningEnd))
    ? `${row.morningStart || ''} -> ${row.morningEnd || ''}`.trim()
    : '';
  const afternoon = (row.includeAfternoon ?? !!(row.afternoonStart && row.afternoonEnd))
    ? `${row.afternoonStart || ''} -> ${row.afternoonEnd || ''}`.trim()
    : '';
  const morningMin = (row.includeMorning ?? !!(row.morningStart && row.morningEnd))
    ? intervalMinutes(row.morningStart, row.morningEnd)
    : 0;
  const afternoonMin = (row.includeAfternoon ?? !!(row.afternoonStart && row.afternoonEnd))
    ? intervalMinutes(row.afternoonStart, row.afternoonEnd)
    : 0;
  const totalMin = morningMin + afternoonMin;

  return {
    date: toFRDate(row.date),
    agent: row.agentName || '',
    agentEmail: row.agentEmail || '',
    supervisor: row.supervisor || '',
    morning,
    afternoon,
    durationHM: toHhMm(totalMin),
    durationDecFR: toHourDecimalFR(totalMin),
    totalMinutes: String(totalMin),
    project: row.project || '',
    brief: (row.notes || '').replaceAll('\n', ' ').trim(),
    mission: row.mission || '',
    region: row.region || '',
    statusFR: statusToFR(row.status),
  };
}

function defaultHeaders(includeTotalMinutesColumn: boolean): string[] {
  const base = [
    'Période',
    'Jour',
    'Agent',
    'Matin',
    'Après-midi',
    'Durée (hh:mm)',
    'Opération',
    'Brief',
    'Mission',
    'Espace',
    'Statut',
  ];
  return includeTotalMinutesColumn ? [...base, 'Total (min)'] : base;
}

export function buildChecklistCsv(
  input: ChecklistCsvInput,
  periodLabel: string,
  opts: ChecklistCsvOptions = {}
): { csv: string; filename: string } {
  const rows = input.map(normalizeRow);

  // Schema
  const headers = opts.customSchema
    ? opts.customSchema.headers
    : defaultHeaders(!!opts.includeTotalMinutesColumn);

  // Map each normalized row to record by header
  const mapRecord = (r: ReturnType<typeof normalizeRow>): Record<string, string> => {
    if (opts.customSchema) {
      return opts.customSchema.mapRow(r);
    }
    const record: Record<string, string> = {
      'Période': periodLabel,
      'Jour': r.date,
      'Agent': r.agent,
      'Matin': r.morning,
      'Après-midi': r.afternoon,
      'Durée (hh:mm)': r.durationHM,
      'Opération': r.project,
      'Brief': r.brief,
      'Mission': r.mission,
      'Espace': r.region,
      'Statut': r.statusFR,
    };
    if (opts.includeTotalMinutesColumn) {
      record['Total (min)'] = r.totalMinutes;
    }
    return record;
  };

  const records = rows.map(mapRecord);

  // CSV with semicolon separator and CRLF, and UTF-8 BOM
  const sep = ';';
  const eol = '\r\n';

  const csvLines: string[] = [];
  csvLines.push(headers.join(sep));
  if (opts.customSchema?.secondHeader) {
    const second = opts.customSchema.secondHeader.map((v) => '"' + (v ?? '').toString().replaceAll('"','""') + '"').join(sep);
    csvLines.push(second);
  }
  for (const rec of records) {
    const line = headers
      .map((h) => {
        const raw = (rec[h] ?? '').toString();
        // Escape; double quotes; wrap in quotes to be safe for Excel
        const escaped = '"' + raw.replaceAll('"', '""') + '"';
        return escaped;
      })
      .join(sep);
    csvLines.push(line);
  }

  const csvBody = csvLines.join(eol) + eol;
  const bom = '\uFEFF';
  const csv = bom + csvBody;

  const filenameBase = opts.filenameBase || 'checklist';
  const filename = `${filenameBase}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return { csv, filename };
}
