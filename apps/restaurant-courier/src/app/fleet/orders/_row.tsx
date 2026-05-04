'use client';

import { useState, useTransition } from 'react';
import { Loader2, RotateCcw, UserCheck } from 'lucide-react';
import { assignOrderToCourierAction, unassignOrderAction } from '../actions';

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
  created_at: string;
  updated_at: string | null;
};

export type DispatchCourier = {
  user_id: string;
  full_name: string | null;
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
};

type DispatchCourierWithStatus = DispatchCourier & { online: boolean };

const STATUS_TONE: Record<string, string> = {
  CREATED: 'bg-zinc-800 text-zinc-300',
  OFFERED: 'bg-amber-500/10 text-amber-300',
  ACCEPTED: 'bg-violet-500/10 text-violet-300',
  PICKED_UP: 'bg-sky-500/10 text-sky-300',
  IN_TRANSIT: 'bg-sky-500/10 text-sky-300',
};

const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Nouă',
  OFFERED: 'Oferită',
  ACCEPTED: 'Acceptată',
  PICKED_UP: 'Ridicată',
  IN_TRANSIT: 'În livrare',
};

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
}: {
  order: DispatchOrder;
  couriers: DispatchCourierWithStatus[];
  courierName: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const isAssigned = order.assigned_courier_user_id !== null;
  const canUnassign = order.status === 'ACCEPTED';

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

  function handleUnassign() {
    setError(null);
    start(async () => {
      const result = await unassignOrderAction(order.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[order.status] ?? 'bg-zinc-800 text-zinc-300'}`}
            >
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
            <p className="truncate text-sm font-medium text-zinc-100">
              {order.customer_first_name ?? 'Client'}
            </p>
            {order.delivery_fee_ron != null ? (
              <span className="text-xs font-medium text-violet-300">
                +{Number(order.delivery_fee_ron).toFixed(2)} RON
              </span>
            ) : null}
            {order.payment_method === 'COD' ? (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                Cash
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {order.pickup_line1 ?? '—'} → {order.dropoff_line1 ?? '—'}
          </p>
          {courierName ? (
            <p className="mt-1 text-[11px] text-zinc-400">
              Curier: <span className="text-zinc-200">{courierName}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-zinc-500">
          <span>{formatAge(order.created_at)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
        {!isAssigned ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setPicker((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
            )}
            {picker ? 'Anulează' : 'Asignează curier'}
          </button>
        ) : null}

        {isAssigned && canUnassign ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleUnassign}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            Reasignează
          </button>
        ) : null}

        {error ? (
          <span className="text-[11px] text-red-400">{error}</span>
        ) : null}
      </div>

      {picker && !isAssigned ? (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
          {couriers.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500">
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
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-800 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-label={c.online ? 'Online' : 'Offline'}
                        className={`h-1.5 w-1.5 rounded-full ${c.online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                      />
                      <span className="font-medium text-zinc-100">
                        {c.full_name ?? 'Curier'}
                      </span>
                      <span className="text-zinc-500">{VEHICLE_LABEL[c.vehicle_type]}</span>
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
