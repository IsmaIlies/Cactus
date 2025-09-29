import { format } from 'date-fns';

// FR labels
const FR_WEEKDAYS_ABBR_UPPER = ['DIM.', 'LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.'];
const FR_MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const FR_MONTHS_ABBR_UPPER = ['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'];

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function computeWorkedMinutes(entry: {
  includeMorning: boolean;
  includeAfternoon: boolean;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
}): number {
  let total = 0;
  if (entry.includeMorning) {
    total += Math.max(0, parseTimeToMinutes(entry.morningEnd) - parseTimeToMinutes(entry.morningStart));
  }
  if (entry.includeAfternoon) {
    total += Math.max(0, parseTimeToMinutes(entry.afternoonEnd) - parseTimeToMinutes(entry.afternoonStart));
  }
  return total;
}

export function formatHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

export function formatDayLabel(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00');
    const wd = FR_WEEKDAYS_ABBR_UPPER[d.getDay()];
    const dayNum = d.getDate();
    const monthAbbr = FR_MONTHS_ABBR_UPPER[d.getMonth()];
    return `${wd} ${dayNum} ${monthAbbr}`;
  } catch {
    return iso;
  }
}

export function formatMonthLabel(period: string): string {
  try {
    const [y, m] = period.split('-').map((v) => parseInt(v, 10));
    const date = new Date(y, (m - 1) || 0, 1);
    const label = FR_MONTHS[date.getMonth()];
    return `${label} ${date.getFullYear()}`;
  } catch {
    return period;
  }
}

export function sortIsoDatesAscending(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDaysToIso(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}

export function getNextWorkingDayInPeriod(currentIso: string, period: string): string | null {
  let next = addDaysToIso(currentIso, 1);
  const monthPrefix = `${period}-`;
  while (next.startsWith(monthPrefix)) {
    const dow = new Date(next + 'T00:00:00').getDay();
    if (dow !== 0 && dow !== 6) return next;
    next = addDaysToIso(next, 1);
  }
  return null;
}
