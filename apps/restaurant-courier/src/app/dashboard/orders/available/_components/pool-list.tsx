'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Navigation, Inbox, MapPin, Shield } from 'lucide-react';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { VerticalBadge } from '@/components/vertical-badge';
import { EmptyState } from '@/components/empty-state';
import { SelfPickupButton } from './self-pickup-button';

function KycBanner() {
  return (
    <Link
      href="/dashboard/kyc"
      className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
    >
      <Shield className="h-4 w-4 flex-none" aria-hidden />
      Verifică-ți contul ca să poți accepta comenzi
    </Link>
  );
}

type OrderRow = {
  id: string;
  status: string;
  vertical: 'restaurant' | 'pharma';
  customer_first_name: string | null;
  pickup_line1: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_line1: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  created_at: string;
  source_tenant_id: string | null;
  fleet_id: string | null;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAge(createdAt: string): { label: string; urgent: boolean } {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return { label: '', urgent: false };
  const diffMin = Math.floor((Date.now() - created) / 60_000);
  const urgent = diffMin >= 5;
  if (diffMin < 1) return { label: 'acum', urgent };
  if (diffMin < 60) return { label: `${diffMin}m`, urgent };
  return { label: `${Math.floor(diffMin / 60)}h`, urgent };
}

export function PoolList({
  orders,
  currentActiveCount,
  maxParallel,
  kycBlocked = false,
}: {
  orders: OrderRow[];
  currentActiveCount: number;
  maxParallel: number | null;
  kycBlocked?: boolean;
}) {
  const atLimit = maxParallel != null && currentActiveCount >= maxParallel;
  const [taken, setTaken] = useState<Set<string>>(new Set());

  const visible = useMemo(() => orders.filter((o) => !taken.has(o.id)), [orders, taken]);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {kycBlocked ? <KycBanner /> : null}
        <EmptyState
          icon={<MapPin className="h-5 w-5" aria-hidden />}
          title="Nicio comandă disponibilă"
          hint="Se actualizează automat când apare o comandă nouă."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {kycBlocked ? <KycBanner /> : null}

      {atLimit ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Ai atins limita de {maxParallel} comenzi paralele. Termină una activă ca să poți lua alta.
        </div>
      ) : null}

      {visible.map((o) => (
        <PoolCard
          key={o.id}
          order={o}
          disabled={atLimit || kycBlocked}
          onClaimed={() => setTaken((prev) => new Set(prev).add(o.id))}
        />
      ))}
    </div>
  );
}

function PoolCard({
  order,
  disabled,
  onClaimed,
}: {
  order: OrderRow;
  disabled: boolean;
  onClaimed: () => void;
}) {
  const hasRoute =
    order.pickup_lat != null &&
    order.pickup_lng != null &&
    order.dropoff_lat != null &&
    order.dropoff_lng != null;
  const distanceKm = hasRoute
    ? haversineKm(
        order.pickup_lat as number,
        order.pickup_lng as number,
        order.dropoff_lat as number,
        order.dropoff_lng as number,
      )
    : null;
  const etaMin = distanceKm != null ? Math.ceil((distanceKm / 25) * 60) : null;
  const fee = order.delivery_fee_ron != null ? Number(order.delivery_fee_ron) : null;
  const age = formatAge(order.created_at);

  return (
    <article className="rounded-2xl border border-hir-border bg-hir-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-base font-semibold text-hir-fg">
          {order.customer_first_name ?? 'Client'}
        </p>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.vertical === 'pharma' ? (
        <div className="mt-2">
          <VerticalBadge vertical="pharma" />
        </div>
      ) : null}

      <div className="relative mt-3 flex flex-col gap-1.5 text-xs">
        <span
          aria-hidden
          className="absolute left-[3px] top-3 h-3 w-0.5 bg-gradient-to-b from-violet-400/50 to-emerald-400/50"
        />
        <div className="relative flex items-start gap-2">
          <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400 ring-2 ring-hir-surface" />
          <span className="truncate text-hir-muted-fg">{order.pickup_line1 ?? '—'}</span>
        </div>
        <div className="relative flex items-start gap-2">
          <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400 ring-2 ring-hir-surface" />
          <span className="truncate text-hir-muted-fg">{order.dropoff_line1 ?? '—'}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hir-border/60 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-hir-muted-fg">
          {distanceKm != null ? (
            <span className="flex items-center gap-1 rounded-lg bg-hir-border/60 px-2 py-1 font-medium text-hir-fg">
              <Navigation className="h-3 w-3 text-violet-300" aria-hidden />
              {distanceKm.toFixed(1)} km
            </span>
          ) : null}
          {etaMin != null ? <span>~{etaMin} min</span> : null}
          <span className="text-hir-muted-fg/70">·</span>
          <span className={age.urgent ? 'font-semibold text-rose-300' : ''}>
            {age.label}
            {age.urgent ? ' URGENT' : ''}
          </span>
        </div>
        {fee != null ? (
          <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-300">
            +{fee.toFixed(2)} RON
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        <SelfPickupButton orderId={order.id} disabled={disabled} onClaimed={onClaimed} />
      </div>
    </article>
  );
}
