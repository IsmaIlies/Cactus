import React from 'react';
import { Status, STATUS_LABELS } from '../lib/constants';

const colorFor: Record<Status, string> = {
  draft: '#6b7280',
  submitted: '#ec7d28',
  approved: '#0ea5a0',
  rejected: '#e35363',
} as const as Record<Status, string>;

export default function StatusBadge({ status, children }: { status: Status; children?: React.ReactNode }) {
  return (
    <span className="badge" style={{ background: colorFor[status] }}>
      {children ?? STATUS_LABELS[status]}
    </span>
  );
}
