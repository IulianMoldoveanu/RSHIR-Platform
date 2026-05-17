'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Loader2, RotateCcw, UserCheck, Wand2 } from 'lucide-react';
import {
  assignOrderToCourierAction,
  autoAssignOrderAction,
  unassignOrderAction,
} from '../actions';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { Button } from '@hir/ui';

// Order is "stale" once it's been unassigned for ≥6 minutes. Tunable from
// here when we get telemetry on real SLA pressure — for now this matches
// the GloriaFood prep-time soft SLA Iulian uses for the Brașov pilot.
const SLA_BREACH_MINUTES = 6;

// Soft-warning threshold — half the SLA budget. At this point the row
// drifts to a muted amber tint so the dispatcher notices it *before* it
// goes red. Avoids the "fine → on fire" cliff the audit flagged.
const SLA_WARN_MINUTES = 3;

// Order in ACCEPTED state for ≥10 minutes without progressing to PICKED_UP
// suggests the rider is stuck — phone died, got distracted, restaurant
// took too long. The pill nudges the manager to follow up before the
// customer calls. ACCEPTED's `updated_at` is the timestamp the rider
// hit Accept, so age-since-update is the right signal here.
const STALL_PICKUP_MINUTES = 10;

// Soft-warning threshold for stalled pickups — same half-budget pattern.
const STALL_WARN_MINUTES = 5;

export type DispatchOrder = {
  id: string;
  status: string;
  customer_first_name: string | null;
  customer_phone: string | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  assigned_courier_user_id: string | null;
  source_tenant_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type DispatchCourier = {
  user_id: string;
  full_name: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
};

type DispatchCourierWithStatus = DispatchCourier & { online: boolean };

const VEHICLE_LABEL: Record<DispatchCourier['vehicle_type'], string> = {
  BIKE: 'Bici',
  SCOOTER: 'Scuter',
  CAR: 'Mașină',
};

function formatAge(dateIso: string): string {
  const ms = Date.now() - new Date(dateIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'acum';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

export function OrderRow({
  order,
  couriers,
  courierName,
  tenantName,
}: {
  order: DispatchOrder;
  couriers: DispatchCourierWithStatus[];
  courierName: string | null;
  // When the fleet handles >1 restaurant, surface the source restaurant
  // on every row so the dispatcher can pair pickup address with venue.
  // Null = same-restaurant fleets (mode A) where the chip would be noise.
  tenantName?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const isAssigned = order.assigned_courier_user_id !== null;
  const canUnassign = order.status === 'ACCEPTED';

  // SLA aging signal: row card-bg drifts neutral → amber-soft → red as
  // the unassigned order ages. Three discrete tiers (not a CSS gradient)
  // because Tailwind utility classes can't interpolate per-row and the
  // dispatcher's eye locks faster on tiers than on a smooth ramp.
  const ageMin = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000);
  const slaWarning = !isAssigned && ageMin >= SLA_WARN_MINUTES && ageMin < SLA_BREACH_MINUTES;
  const slaBreached = !isAssigned && ageMin >= SLA_BREACH_MINUTES;

  // Stalled-pickup signal: assigned + ACCEPTED for too long without the
  // rider tapping "Picked up". Use updated_at because that's when the
  // rider accepted (the most recent status transition timestamp we
  // have in this column).
  const stallMin =
    order.status === 'ACCEPTED' && order.updated_at
      ? Math.floor((Date.now() - new Date(order.updated_at).getTime()) / 60_000)
      : 0;
  const stallWarning =
    isAssigned && order.status === 'ACCEPTED'
      && stallMin >= STALL_WARN_MINUTES && stallMin < STALL_PICKUP_MINUTES;
  const stalled = isAssigned && order.status === 'ACCEPTED' && stallMin >= STALL_PICKUP_MINUTES;

  function handleAssign(courierUserId: string) {
    setError(null);
    start(async () => {
      const result = await assignOrderToCourierAction(order.id, courierUserId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPicker(false);
    });
  }

  function handleAutoAssign() {
    setError(null);
    start(async () => {
      const result = await autoAssignOrderAction(order.id);
      if (!result.ok) setError(result.error);
    });
  }

  function handleUnassign() {
    setError(null);
    start(async () => {
      const result = await unassignOrderAction(order.id);
      if (!result.ok) setError(result.error);
    });
  }

  // `data-search-blob` is consumed by FleetOrdersSearch on /fleet/orders.
  // The blob concatenates fields the dispatcher most likely searches on:
  // order id prefix, customer name, pickup + dropoff. Component-local
  // (not pushed up the prop chain) because /fleet/orders/[id] doesn't
  // need it and we'd rather not bloat that surface.
  const searchBlob = [
    order.id.slice(0, 8),
    order.customer_first_name ?? '',
    order.pickup_line1 ?? '',
    order.dropoff_line1 ?? '',
    tenantName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      data-search-blob={searchBlob}
      className={`rounded-xl border p-3 ${
        slaBreached
          ? 'border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20'
          : stalled
            ? 'border-amber-600/40 bg-amber-500/5 ring-1 ring-amber-500/20'
            : slaWarning || stallWarning
              ? 'border-amber-500/25 bg-amber-500/[0.03]'
              : 'border-hir-border bg-zinc-950'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {slaBreached ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-300">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                SLA {ageMin}m
              </span>
            ) : null}
            {stalled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Curier blocat {stallMin}m
              </span>
            ) : null}
            <OrderStatusBadge status={order.status} />
            {tenantName ? (
              <span
                className="max-w-[140px] truncate rounded-full bg-hir-border px-2 py-0.5 text-[10px] font-semibold text-hir-fg"
                title={tenantName}
              >
                {tenantName}
              </span>
            ) : null}
            <p className="truncate text-sm font-medium text-hir-fg">
              {order.customer_first_name ?? 'Client'}
            </p>
            {order.delivery_fee_ron != null ? (
              <span className="text-xs font-medium text-violet-300">
                +{Number(order.delivery_fee_ron).toFixed(2)} RON
              </span>
            ) : null}
            {order.payment_method === 'COD' ? (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                Cash
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-hir-muted-fg">
            {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
          </p>
          {courierName ? (
            <p className="mt-1 text-[11px] text-hir-muted-fg">
              Curier: <span className="text-hir-fg">{courierName}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-hir-muted-fg">
          <span>{formatAge(order.created_at)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hir-border pt-3">
        {!isAssigned ? (
          <>
            <Button
              type="button"
              disabled={pending}
              onClick={handleAutoAssign}
              className="gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Auto-asignează
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setPicker((v) => !v)}
              className="gap-1.5 rounded-lg border-hir-border bg-hir-surface px-3 py-1.5 text-xs font-semibold text-hir-muted-fg hover:bg-hir-surface/60"
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
              {picker ? 'Anulează' : 'Manual'}
            </Button>
          </>
        ) : null}

        {isAssigned && canUnassign ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleUnassign}
            className="gap-1.5 rounded-lg border-hir-border bg-hir-surface px-3 py-1.5 text-xs font-semibold text-hir-muted-fg hover:bg-hir-surface/60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            Reasignează
          </Button>
        ) : null}

        {error ? (
          <span className="text-[11px] text-red-400">{error}</span>
        ) : null}
      </div>

      {picker && !isAssigned ? (
        <div className="mt-3 rounded-lg border border-hir-border bg-hir-surface p-2">
          {couriers.length === 0 ? (
            <p className="px-2 py-3 text-xs text-hir-muted-fg">
              Niciun curier în flotă încă. Invită unul din pagina Curieri.
            </p>
          ) : (
            <ul className="flex flex-col">
              {couriers.map((c) => (
                <li key={c.user_id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAssign(c.user_id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-hir-surface/60 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-label={c.online ? 'Online' : 'Offline'}
                        className={`h-1.5 w-1.5 rounded-full ${c.online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                      />
                      <span className="font-medium text-hir-fg">
                        {c.full_name ?? 'Curier'}
                      </span>
                      <span className="text-hir-muted-fg">{VEHICLE_LABEL[c.vehicle_type]}</span>
                    </span>
                    {c.online ? (
                      <span className="text-[10px] uppercase tracking-wide text-emerald-300">Online</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}
