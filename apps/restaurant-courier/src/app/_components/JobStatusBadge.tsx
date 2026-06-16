// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// JobStatusBadge — shared status badge for `courier_job_listings.status` AND
// `courier_job_applications.status`. The two enums overlap visually (OPEN ↔
// PENDING etc.) so we centralise the label/colour here instead of letting
// each page reinvent the palette.
//
// Listing statuses (from 20260616_013_courier_job_board.sql):
//   OPEN          accepting applications
//   PAUSED        fleet paused, hidden from courier board
//   CLOSED        fleet closed; immutable history
//   EXPIRED       cron flipped past TTL or 30-day default
//
// Application statuses (from same migration):
//   PENDING       waiting for fleet review
//   REVIEWING     fleet reviewing
//   INTERVIEWED   fleet interviewed
//   HIRED         courier hired (terminal)
//   REJECTED      fleet rejected (terminal)
//   WITHDRAWN     courier withdrew (terminal)

import * as React from 'react';

export type CourierJobListingStatus = 'OPEN' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
export type CourierJobApplicationStatus =
  | 'PENDING'
  | 'REVIEWING'
  | 'INTERVIEWED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type JobStatusValue = CourierJobListingStatus | CourierJobApplicationStatus;

const STATUS_STYLE: Record<JobStatusValue, { label: string; cls: string }> = {
  // Listing statuses
  OPEN: { label: 'Deschis', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  PAUSED: { label: 'Pauză', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  CLOSED: { label: 'Închis', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  EXPIRED: { label: 'Expirat', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  // Application statuses
  PENDING: { label: 'În așteptare', cls: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  REVIEWING: { label: 'În analiză', cls: 'bg-blue-100 text-blue-800 ring-blue-200' },
  INTERVIEWED: { label: 'Interviu', cls: 'bg-purple-100 text-purple-800 ring-purple-200' },
  HIRED: { label: 'Angajat', cls: 'bg-green-100 text-green-800 ring-green-200' },
  REJECTED: { label: 'Respins', cls: 'bg-rose-100 text-rose-800 ring-rose-200' },
  WITHDRAWN: { label: 'Retras', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export interface JobStatusBadgeProps {
  status: JobStatusValue;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps): JSX.Element {
  const style = STATUS_STYLE[status];
  if (!style) {
    return (
      <span
        className={[
          'inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {status}
      </span>
    );
  }
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.cls,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {style.label}
    </span>
  );
}

/** Ordered list of application statuses for kanban columns. */
export const APPLICATION_KANBAN_ORDER: ReadonlyArray<CourierJobApplicationStatus> = [
  'PENDING',
  'REVIEWING',
  'INTERVIEWED',
  'HIRED',
  'REJECTED',
] as const;
