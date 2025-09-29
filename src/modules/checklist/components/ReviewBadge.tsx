import React from 'react';
import { EntryReviewStatus } from '../lib/constants';

const palette: Record<EntryReviewStatus, string> = {
  pending: '#d6a500', // golden pending like the mockup
  approved: '#0ea5a0',
  rejected: '#e35363',
};

export function ReviewBadge({ status, children }: { status: EntryReviewStatus; children?: React.ReactNode }) {
  return (
    <span className="badge badge--small" style={{ background: palette[status] }}>
      {children ?? status}
    </span>
  );
}
