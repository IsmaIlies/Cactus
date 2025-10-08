import { addRecap, RecapPayload } from "../services/recapService";
import { getValidatedSalesThisMonth, Sale } from "../services/salesService";

// Defaults, can be customized via UI and persisted in localStorage
export const DEFAULT_RECIPIENTS = [
  'i.boultame@mars-marketing.fr',
  'i.brai@mars-marketing.fr',
  'M.DEMAURET@mars-marketing.fr',
  'J.ALLIONE@mars-marketing.fr',
  'maurice@emiciv.fr',
  'arthur.gouet@terredappels.fr',
];

export const DEFAULT_CC_RECIPIENTS = [
  'stella@emiciv.fr',
  'jeanwilfried@emiciv.fr',
];

const RECIPIENTS_STORAGE_KEY = 'presence_ta:recipients';
type RecipientsConfig = { to: string[]; cc: string[] };

export function getRecipientsConfig(): RecipientsConfig {
  try {
    const raw = localStorage.getItem(RECIPIENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const to = Array.isArray(parsed?.to) ? parsed.to.filter(Boolean) : [];
      const cc = Array.isArray(parsed?.cc) ? parsed.cc.filter(Boolean) : [];
      return { to: to.length ? to : DEFAULT_RECIPIENTS, cc: cc.length ? cc : DEFAULT_CC_RECIPIENTS };
    }
  } catch {}
  return { to: DEFAULT_RECIPIENTS, cc: DEFAULT_CC_RECIPIENTS };
}

export function setRecipientsConfig(cfg: Partial<RecipientsConfig>) {
  const current = getRecipientsConfig();
  const next = { to: cfg.to ?? current.to, cc: cfg.cc ?? current.cc };
  try { localStorage.setItem(RECIPIENTS_STORAGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export type DelayUnit = 'minutes' | 'heures';
export type DelaysMap = Record<string, { value: number; unit: DelayUnit }>;

export type PresenceEmailInputs = {
  missionLabel?: string; // e.g., ORANGE CANAL+
  date?: Date | string; // defaults to today
  encadrants: string[];
  ventesConfirmees: number;
  mailsCommandes: number;
  conges: number;
  sanction: number;
  demission: number;
  notes: { technique?: string; electricite?: string; production?: string };
  present: string[];
  absent: string[];
  unmarked: string[];
  delaysByAgent: DelaysMap;
  region?: 'FR' | 'CIV';
  toList?: string[]; // optional custom recipients (À)
  ccList?: string[]; // optional custom recipients (CC)
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const toDate = (v: any): Date | null => {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    const d = new Date(v); if (!isNaN(d.getTime())) return d; return null;
  } catch { return null; }
};

export async function loadTodaySales(region?: 'FR' | 'CIV', onDate?: Date) {
  const list = await getValidatedSalesThisMonth(region);
  const target = onDate ?? new Date();
  const y = target.getFullYear(); const m = target.getMonth(); const d = target.getDate();
  const isToday = (s: Sale) => {
    const dt = toDate((s as any).date);
    return !!dt && dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  };
  const perSeller: Record<string, number> = {};
  list.filter(isToday).forEach((s) => {
    const seller = (s as any).name || (s as any).userName || (s as any).agent || 'Inconnu';
    const key = normalize(String(seller));
    perSeller[key] = (perSeller[key] || 0) + 1;
  });
  return perSeller;
}

export async function getSvgAsPngDataUrl(svgUrl: string, width = 200, height?: number): Promise<string> {
  // Load SVG text
  const res = await fetch(svgUrl);
  const svgText = await res.text();
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const svgDataUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(svgDataUrl);
    const w = width;
    const h = height || Math.ceil((img.naturalHeight || img.height || 100) * (w / (img.naturalWidth || img.width || 100)));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas ctx not available');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(svgDataUrl);
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function linesJoin(lines: string[]) { return lines.join('\n'); }

export function buildEmailSubjectBody(inputs: PresenceEmailInputs & { logos?: { left?: string; right?: string }; salesBySeller?: Record<string, number> }) {
  const now = inputs.date ? (typeof inputs.date === 'string' ? new Date(inputs.date) : inputs.date) : new Date();
  const yyyy = now.getFullYear(); const mm = String(now.getMonth() + 1).padStart(2, '0'); const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  let mission = inputs.missionLabel;
  if (!mission) {
    try {
      const m = localStorage.getItem('activeMission');
      mission = (m || 'ORANGE CANAL+').replace('_', ' ').replace('PLUS', '+');
    } catch { mission = 'ORANGE CANAL+'; }
  }
  const pad2 = (n: number) => String(Math.max(0, n)).padStart(2, '0');
  const encadrants = inputs.encadrants?.length ? inputs.encadrants.join(', ') : '—';
  const presentCount = inputs.present.length; const absentCount = inputs.absent.length; const unmarkedCount = inputs.unmarked.length;
  const retardCount = Object.keys(inputs.delaysByAgent || {}).length;

  const presentLine = inputs.present.length ? inputs.present.join(', ') : 'Aucun';
  const absentLine = inputs.absent.length ? inputs.absent.join(', ') : 'Aucun';
  const unmarkedLine = inputs.unmarked.length ? inputs.unmarked.join(', ') : 'Aucun';

  const delaysLines = Object.entries(inputs.delaysByAgent || {})
    .map(([name, d]) => `${name}: ${d.value} ${d.unit === 'minutes' ? 'min' : 'h'}`);

  const salesLines = inputs.salesBySeller ? Object.entries(inputs.salesBySeller)
    .filter(([_, c]) => c > 0)
    .map(([seller, c]) => `${seller}: ${c}`) : [];

  const subject = `🌙 Rapport ${mission} — ${dateStr}`;

  const textLines = [
    `Bonsoir à tous,`,
    ``,
    `Ci-dessous le rapport de production et le reporting du "${dateStr}" sur le pôle : ${mission}`,
    ``,
    `• ✅ NOMBRE DE VENTES CONFIRMÉES : ${inputs.ventesConfirmees}`,
    `• ✉️ NOMBRE DE MAILS DE COMMANDES ENVOYÉS : ${inputs.mailsCommandes}`,
    ``,
    `👤 Encadrant(s) : ${encadrants}`,
    ``,
    `📊 Indicateurs`,
    `- Absence : ${pad2(absentCount)}`,
    `- Congés : ${pad2(inputs.conges)}`,
    `- Retard : ${pad2(retardCount)}`,
    `- Mise à pied / Sanction disciplinaire : ${pad2(inputs.sanction)}`,
    `- Démission : ${pad2(inputs.demission)}`,
    ``,
    `🧰 SOUCIS TECHNIQUE : ${inputs.notes?.technique?.trim() || '—'}`,
    `⚡ ÉLECTRICITÉ : ${inputs.notes?.electricite?.trim() || '—'}`,
    `🏭 PRODUCTION : ${inputs.notes?.production?.trim() || '—'}`,
    ``,
    `👥 Présence`,
    `- Présents (${presentCount}) : ${presentLine}`,
    `- Absents (${absentCount}) : ${absentLine}`,
    `- Non marqués (${unmarkedCount}) : ${unmarkedLine}`,
    ...(delaysLines.length ? [`- Retards: ${delaysLines.join('; ')}`] : []),
    ``,
    salesLines.length ? `📈 Ventes du jour:` : `📈 Ventes du jour : Aucune`,
    ...salesLines.map(l => `- ${l}`),
  ];

  const logoLeft = inputs.logos?.left ? `<img src="${inputs.logos.left}" alt="Logo 1" style="height:28px;vertical-align:middle"/>` : '';
  const logoRight = inputs.logos?.right ? `<img src="${inputs.logos.right}" alt="Logo 2" style="height:28px;vertical-align:middle"/>` : '';

  const html = `
    <div style="font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#e5f2ff;background:#041421;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">${logoLeft}<div style="flex:1"></div>${logoRight}</div>
      <h2 style="margin:0 0 8px 0;color:#c1ffde;">${subject}</h2>
      <p>Bonsoir à tous,</p>
      <p>Ci-dessous le rapport de production et le reporting du "${dateStr}" sur le pôle : <b>${mission}</b></p>
      <ul>
        <li>✅ <b>NOMBRE DE VENTES CONFIRMÉES</b> : ${inputs.ventesConfirmees}</li>
        <li>✉️ <b>NOMBRE DE MAILS DE COMMANDES ENVOYÉS</b> : ${inputs.mailsCommandes}</li>
      </ul>
      <p>👤 <b>Encadrant(s)</b> : ${encadrants}</p>
      <h3>📊 Indicateurs</h3>
      <ul>
        <li>Absence : ${pad2(absentCount)}</li>
        <li>Congés : ${pad2(inputs.conges)}</li>
        <li>Retard : ${pad2(retardCount)}</li>
        <li>Mise à pied / Sanction disciplinaire : ${pad2(inputs.sanction)}</li>
        <li>Démission : ${pad2(inputs.demission)}</li>
      </ul>
      <p>🧰 <b>SOUCIS TECHNIQUE</b> : ${inputs.notes?.technique?.trim() || '—'}</p>
      <p>⚡ <b>ÉLECTRICITÉ</b> : ${inputs.notes?.electricite?.trim() || '—'}</p>
      <p>🏭 <b>PRODUCTION</b> : ${inputs.notes?.production?.trim() || '—'}</p>
      <h3>👥 Présence</h3>
      <ul>
        <li>Présents (${presentCount}) : ${presentLine}</li>
        <li>Absents (${absentCount}) : ${absentLine}</li>
        <li>Non marqués (${unmarkedCount}) : ${unmarkedLine}</li>
        ${delaysLines.length ? `<li>Retards: ${delaysLines.join('; ')}</li>` : ''}
      </ul>
      ${salesLines.length ? `<h3>📈 Ventes du jour</h3>
      <ul>${salesLines.map(l => `<li>${l}</li>`).join('')}</ul>` : `<p>📈 <b>Ventes du jour</b> : Aucune</p>`}
    </div>
  `;

  return { subject, textBody: linesJoin(textLines), html, dateStr };
}

export async function handleOpenOutlookWeb(inputs: PresenceEmailInputs & { logos?: { leftUrl?: string; rightUrl?: string } }) {
  // Convert logos if SVG
  let left: string | undefined; let right: string | undefined;
  try {
    if (inputs.logos?.leftUrl) {
      if (/\.svg(\?.*)?$/i.test(inputs.logos.leftUrl)) left = await getSvgAsPngDataUrl(inputs.logos.leftUrl);
      else left = await imageToDataUrl(inputs.logos.leftUrl);
    }
    if (inputs.logos?.rightUrl) {
      if (/\.svg(\?.*)?$/i.test(inputs.logos.rightUrl)) right = await getSvgAsPngDataUrl(inputs.logos.rightUrl);
      else right = await imageToDataUrl(inputs.logos.rightUrl);
    }
  } catch {}

  // Sales by seller for selected date (defaults to today)
  let salesBySeller: Record<string, number> | undefined;
  try {
    const onDate = inputs.date ? (typeof inputs.date === 'string' ? new Date(inputs.date) : inputs.date) : new Date();
    const perSeller = await loadTodaySales(inputs.region, onDate);
    // Keep only names that match present/absent/unmarked union (normalized)
    const allNames = [...inputs.present, ...inputs.absent, ...inputs.unmarked];
    const allow = new Set(allNames.map(normalize));
    salesBySeller = Object.fromEntries(Object.entries(perSeller).filter(([k]) => allow.has(k)));
  } catch {}

  const { subject, textBody, html, dateStr } = buildEmailSubjectBody({ ...inputs, logos: { left, right }, salesBySeller });

  // Copy HTML to clipboard (optionally paste later if you want richer rendering)
  try { await navigator.clipboard.writeText(html); } catch {}

  // Build deeplink URL
  // Use the stable Outlook Web compose deeplink endpoint
  const base = 'https://outlook.office.com/mail/deeplink/compose';
  const cfg = getRecipientsConfig();
  const toList = (inputs.toList && inputs.toList.length ? inputs.toList : cfg.to).filter(Boolean);
  const ccList = (inputs.ccList && inputs.ccList.length ? inputs.ccList : cfg.cc).filter(Boolean);
  const to = toList.join(';');
  const cc = ccList.join(';');
  // Build query string manually with encodeURIComponent to avoid '+' replacing spaces
  const qsParts: string[] = [];
  if (to) qsParts.push(`to=${encodeURIComponent(to)}`);
  if (cc) qsParts.push(`cc=${encodeURIComponent(cc)}`);
  qsParts.push(`subject=${encodeURIComponent(subject)}`);
  qsParts.push(`body=${encodeURIComponent(textBody)}`);
  qsParts.push(`bodyType=Text`);
  const composeCandidates = [
    `${base}?${qsParts.join('&')}`,
    `https://outlook.office.com/owa/?path=/mail/action/compose&${qsParts.join('&')}`,
    `https://outlook.live.com/mail/0/deeplink/compose?${qsParts.join('&')}`,
  ];
  let opened: Window | null = null;
  for (const href of composeCandidates) {
    try {
      opened = window.open(href, '_blank');
      if (opened) break;
    } catch {}
  }
  // Fallback to mailto if all compose attempts failed or were blocked
  if (!opened) {
    try {
      const mailto = `mailto:${encodeURIComponent(to)}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textBody)}`;
      window.open(mailto, '_blank');
    } catch {}
  }

  // Historize recap
  try {
    const payload: RecapPayload = {
      subject,
      to,
      cc,
      date: dateStr,
      mission: inputs.missionLabel,
      encadrants: inputs.encadrants,
      kpis: {
        ventesConfirmees: inputs.ventesConfirmees,
        mailsCommandes: inputs.mailsCommandes,
        conges: inputs.conges,
        sanction: inputs.sanction,
        demission: inputs.demission,
        absence: inputs.absent.length,
        retard: Object.keys(inputs.delaysByAgent || {}).length,
      },
      notes: inputs.notes,
      presence: {
        present: inputs.present,
        absent: inputs.absent,
        unmarked: inputs.unmarked,
        delaysByAgent: inputs.delaysByAgent,
      },
      salesBySeller,
    };
    await addRecap(dateStr, payload);
  } catch {}

}

async function imageToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
