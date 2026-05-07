// Pre-order list row — server component. Status transitions reuse the
// existing /dashboard/orders client component so the buttons + state machine
// are identical to the regular orders page.

import Link from 'next/link';
import { ChevronRight, Phone } from 'lucide-react';
import type { OrderStatus } from '../orders/status-machine';

type Row = {
  id: string;
  status: string;
  scheduled_for: string | null;
  total_ron: number | string;
  notes: string | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'În așteptare',
  CONFIRMED: 'Confirmată',
  PREPARING: 'În preparare',
  READY: 'Gata',
  DISPATCHED: 'Trimisă',
  IN_DELIVERY: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

const STATUS_PILL: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 ring-amber-200',
  CONFIRMED: 'bg-purple-100 text-purple-800 ring-purple-200',
  PREPARING: 'bg-purple-100 text-purple-800 ring-purple-200',
  READY: 'bg-purple-100 text-purple-800 ring-purple-200',
  DISPATCHED: 'bg-purple-100 text-purple-800 ring-purple-200',
  IN_DELIVERY: 'bg-purple-100 text-purple-800 ring-purple-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};

function formatScheduled(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // Romanian-friendly format: "vin., 12 mai 2026, 14:30"
  return d.toLocaleString('ro-RO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRon(v: number | string): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    maximumFractionDigits: 2,
  }).format(Number(v));
}

export function PreOrderRow({ row, tenantId: _tenantId }: { row: Row; tenantId: string }) {
  const status = row.status as OrderStatus;
  const customerName = [row.customers?.first_name, row.customers?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Client';
  const phone = row.customers?.phone ?? null;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 hover:bg-zinc-50">
      <Link
        href={`/dashboard/orders/${row.id}`}
        className="flex flex-col gap-2"
        prefetch={false}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <span className="truncate">{customerName}</span>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_PILL[status] ?? STATUS_PILL.PENDING}`}
              >
                {STATUS_LABEL[status] ?? status}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              Programată: <span className="font-medium text-zinc-900">{formatScheduled(row.scheduled_for)}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-semibold tabular-nums text-zinc-900">
              {formatRon(row.total_ron)}
            </span>
            <ChevronRight className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          </div>
        </div>

        {row.notes && (
          <p className="line-clamp-2 text-xs text-zinc-600">
            <span className="font-medium text-zinc-700">Mențiuni:</span> {row.notes}
          </p>
        )}
      </Link>

      {phone && (
        <a
          href={`tel:${phone}`}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:underline"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          {phone}
        </a>
      )}
    </li>
  );
}
