'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Phone, User, Clock } from 'lucide-react';
import type { LiveOrder, CourierOrderStatus } from '../page';

// Status badge config — maps to requirements §2.
const STATUS_BADGE: Record<
  CourierOrderStatus,
  { label: string; className: string }
> = {
  CREATED:   { label: 'Noua',         className: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  OFFERED:   { label: 'Oferita',      className: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  ACCEPTED:  { label: 'Acceptata',    className: 'bg-blue-100 text-blue-700 ring-blue-200' },
  PICKED_UP: { label: 'Ridicata',     className: 'bg-yellow-100 text-yellow-800 ring-yellow-200' },
  IN_TRANSIT:{ label: 'In livrare',   className: 'bg-orange-100 text-orange-700 ring-orange-200' },
  DELIVERED: { label: 'Livrata',      className: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  CANCELLED: { label: 'Anulata',      className: 'bg-rose-100 text-rose-700 ring-rose-200' },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

function deliveryDuration(order: LiveOrder): string | null {
  if (order.status !== 'DELIVERED') return null;
  const ms = new Date(order.updated_at).getTime() - new Date(order.created_at).getTime();
  if (ms <= 0) return null;
  return `${Math.round(ms / 60_000)} min`;
}

function itemCount(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce<number>((s, it) => {
    if (typeof it === 'object' && it !== null && 'quantity' in it) {
      return s + Number((it as { quantity?: number }).quantity ?? 1);
    }
    return s + 1;
  }, 0);
}

function OrderCard({
  order,
  isHighlighted,
  isSelected,
  onSelect,
}: {
  order: LiveOrder;
  isHighlighted: boolean;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.CREATED;
  const count = itemCount(order.items);
  const duration = deliveryDuration(order);

  return (
    <li
      className={`rounded-xl border transition-colors duration-300 ${
        isHighlighted
          ? 'border-yellow-400 bg-yellow-50'
          : isSelected
            ? 'border-purple-400 bg-purple-50/50'
            : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={() => {
          onSelect(isSelected ? null : order.id);
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
        aria-label={`Comanda ${order.id.slice(0, 8)}, ${badge.label}, ${order.dropoff_line1 ?? 'fara adresa'}`}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Row 1: order ID + status + address */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-400">#{order.id.slice(0, 8)}</span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge.className}`}
            >
              {badge.label}
            </span>
            {duration && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <Clock className="h-3 w-3" aria-hidden />
                {duration}
              </span>
            )}
          </div>

          {/* Address — shown large per requirement */}
          <p className="flex items-start gap-1.5 text-sm font-semibold text-zinc-900">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-purple-500" aria-hidden />
            {order.dropoff_line1 ?? (
              <span className="font-normal text-zinc-400 italic">Adresa lipsa</span>
            )}
          </p>

          {/* Courier */}
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <User className="h-3 w-3 flex-none" aria-hidden />
            {order.courier_name
              ? (
                <>
                  {order.courier_name}
                  {order.courier_phone && (
                    <a
                      href={`tel:${order.courier_phone}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Suna curierul ${order.courier_name}`}
                      className="ml-1 inline-flex items-center gap-0.5 text-purple-600 hover:underline"
                    >
                      <Phone className="h-3 w-3" aria-hidden />
                      {order.courier_phone}
                    </a>
                  )}
                </>
              )
              : <span className="italic text-zinc-400">In asteptare</span>
            }
          </p>
        </div>

        {/* Right side: total + time + chevron */}
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-zinc-500">
          {order.total_ron !== null && (
            <span className="font-mono font-semibold text-zinc-800">
              {Number(order.total_ron).toFixed(2)} RON
            </span>
          )}
          <time
            dateTime={order.created_at}
            title={new Date(order.created_at).toLocaleString('ro-RO')}
            className="tabular-nums"
          >
            {timeAgo(order.created_at)}
          </time>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden />
            : <ChevronRight className="h-4 w-4 text-zinc-400" aria-hidden />
          }
        </div>
      </button>

      {/* Expanded details drawer */}
      {expanded && (
        <div className="border-t border-zinc-100 px-4 pb-3 pt-2 text-xs text-zinc-600">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {order.customer_first_name && (
              <>
                <dt className="font-medium text-zinc-400">Client</dt>
                <dd className="col-span-1 sm:col-span-2">{order.customer_first_name}</dd>
              </>
            )}
            {order.customer_phone && (
              <>
                <dt className="font-medium text-zinc-400">Telefon</dt>
                <dd>
                  <a href={`tel:${order.customer_phone}`} className="text-purple-600 hover:underline">
                    {order.customer_phone}
                  </a>
                </dd>
              </>
            )}
            {order.pickup_line1 && (
              <>
                <dt className="font-medium text-zinc-400">Pickup</dt>
                <dd className="col-span-1 sm:col-span-2">{order.pickup_line1}</dd>
              </>
            )}
            {count > 0 && (
              <>
                <dt className="font-medium text-zinc-400">Produse</dt>
                <dd>{count} {count === 1 ? 'produs' : 'produse'}</dd>
              </>
            )}
            {order.payment_method && (
              <>
                <dt className="font-medium text-zinc-400">Plata</dt>
                <dd>{order.payment_method === 'COD' ? 'Numerar' : 'Card'}</dd>
              </>
            )}
            <dt className="font-medium text-zinc-400">Creat</dt>
            <dd title={new Date(order.created_at).toLocaleString('ro-RO')}>
              {formatTime(order.created_at)} ({timeAgo(order.created_at)} in urma)
            </dd>
            <dt className="font-medium text-zinc-400">Ultima actualizare</dt>
            <dd title={new Date(order.updated_at).toLocaleString('ro-RO')}>
              {formatTime(order.updated_at)} ({timeAgo(order.updated_at)} in urma)
            </dd>
          </dl>
        </div>
      )}
    </li>
  );
}

type Props = {
  orders: LiveOrder[];
  highlightIds: Set<string>;
  selectedOrderId: string | null;
  onSelect: (id: string | null) => void;
};

export function OrdersTable({ orders, highlightIds, selectedOrderId, onSelect }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white py-12 text-center">
        <MapPin className="mb-3 h-8 w-8 text-zinc-300" aria-hidden />
        <p className="text-sm font-medium text-zinc-600">Nicio comanda pentru filtrul curent.</p>
        <p className="mt-1 text-xs text-zinc-400">Comenzile noi apar automat fara refresh.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="list" aria-label="Lista comenzi live">
      {orders.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          isHighlighted={highlightIds.has(o.id)}
          isSelected={selectedOrderId === o.id}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
