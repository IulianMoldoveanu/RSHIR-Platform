'use client';

// Client-side CSV export. We build the file in the browser so we never
// have to ship a download endpoint (less attack surface, faster for the
// partner). Encoding: UTF-8 with BOM so Excel-RO opens it without
// mangling the column headings.

import { useState } from 'react';
import { Download } from 'lucide-react';

export type CommissionRow = {
  period_start: string;
  period_end: string;
  type: string;
  status: string;
  orders: number;
  amount_ron: number;
  paid_at: string;
};

const HEADERS = [
  'Perioadă început',
  'Perioadă sfârșit',
  'Tip',
  'Status',
  'Comenzi',
  'Sumă (RON)',
  'Plătit la',
];

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: CommissionRow[]): string {
  const lines = [HEADERS.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.period_start,
        r.period_end,
        r.type,
        r.status,
        r.orders,
        r.amount_ron.toLocaleString('ro-RO', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false,
        }),
        r.paid_at,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n');
}

export function CommissionExportButton({ rows }: { rows: CommissionRow[] }) {
  const [busy, setBusy] = useState(false);

  function handleClick() {
    try {
      setBusy(true);
      const csv = '﻿' + buildCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `hir-comisioane-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke a tick so older browsers finish the download.
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || rows.length === 0}
      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </button>
  );
}
