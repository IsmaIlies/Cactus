export type ProjectOption = 'CANAL 211' | 'CANAL 214' | 'CANAL 210' | 'BRIEF';

export const PROJECT_OPTIONS: ProjectOption[] = ['CANAL 211', 'CANAL 214', 'CANAL 210', 'BRIEF'];

export enum EntryReviewStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export enum Status {
  Draft = 'draft',
  Submitted = 'submitted',
  Approved = 'approved',
  Rejected = 'rejected',
}

export const STATUS_LABELS: Record<Status, string> = {
  [Status.Draft]: 'Brouillon',
  [Status.Submitted]: 'Soumise',
  [Status.Approved]: 'Validée',
  [Status.Rejected]: 'Rejetée',
};

export const STORAGE_KEY = 'cactus_hours_agent';
