import { EntryReviewStatus, ProjectOption, Status, STORAGE_KEY } from './constants';
import { format } from 'date-fns';

export type DayEntry = {
  id: string;
  day: string; // yyyy-MM-dd
  includeMorning: boolean;
  includeAfternoon: boolean;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  project: ProjectOption;
  notes: string;
  status: Status;
  reviewStatus: EntryReviewStatus;
  hasDispute?: boolean;
  disputeNote?: string;
  disputeSubmittedAt?: any;
  supervisor?: string;
  claimStatus?: 'pending' | 'in_progress' | 'accepted' | 'rejected';
  claimAdminComment?: string;
  claimHistory?: Array<{ author: string; message: string; date: string }>;
};

export type StoredAgentState = {
  period: string; // yyyy-MM
  status: Status;
  rejectionNote: string | null;
  entries: DayEntry[];
};

export function hydrateEntry(partial: Partial<DayEntry> & { day: string; id?: string }): DayEntry {
  return {
    id: partial.id ?? partial.day,
    day: partial.day,
    includeMorning: partial.includeMorning ?? true,
    includeAfternoon: partial.includeAfternoon ?? true,
    morningStart: partial.morningStart ?? '10:00',
    morningEnd: partial.morningEnd ?? '13:00',
    afternoonStart: partial.afternoonStart ?? '15:00',
    afternoonEnd: partial.afternoonEnd ?? '19:00',
    project: partial.project ?? 'CANAL 211',
    notes: partial.notes ?? '',
    status: partial.status ?? Status.Draft,
    reviewStatus: partial.reviewStatus ?? EntryReviewStatus.Pending,
    hasDispute: partial.hasDispute ?? false,
    disputeNote: partial.disputeNote,
    disputeSubmittedAt: partial.disputeSubmittedAt,
    supervisor: partial.supervisor ?? '',
    claimStatus: partial.claimStatus ?? undefined,
    claimAdminComment: partial.claimAdminComment ?? '',
    claimHistory: partial.claimHistory ?? [],
  };
}

export function generateInitialEntries(period: string): DayEntry[] {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: DayEntry[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = format(new Date(year, month, d), 'yyyy-MM-dd');
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    entries.push(hydrateEntry({ day: dateStr }));
  }
  return entries;
}

export function ensureEntryForDay(entries: DayEntry[], dayIso: string) {
  if (entries.some((e) => e.day === dayIso)) {
    return { created: false, entries } as const;
  }
  return { created: true, entries: [...entries, hydrateEntry({ day: dayIso })] } as const;
}

function keyFor(period?: string) {
  return `${STORAGE_KEY}:${period ?? getCurrentPeriod()}`;
}

export function getCurrentPeriod(): string {
  const now = new Date();
  return format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM');
}

export function loadAgentFromStorage(period?: string): StoredAgentState {
  const p = period ?? getCurrentPeriod();
  const raw = localStorage.getItem(keyFor(p));
  if (!raw) {
    return {
      period: p,
      status: Status.Draft,
      rejectionNote: null,
      entries: [],
    };
  }
  try {
    const parsed = JSON.parse(raw) as StoredAgentState;
    return parsed;
  } catch {
    return {
      period: p,
      status: Status.Draft,
      rejectionNote: null,
      entries: [],
    };
  }
}

export function persistAgentState(state: StoredAgentState) {
  localStorage.setItem(keyFor(state.period), JSON.stringify(state));
}
