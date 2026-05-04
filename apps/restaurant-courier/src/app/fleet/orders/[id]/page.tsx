import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, MapPin, Phone, Banknote, Package } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireFleetManager } from '@/lib/fleet-manager';
import { OrderRow, type DispatchCourier, type DispatchOrder } from '../_row';

export const dynamic = 'force-dynamic';

type OrderDetail = DispatchOrder & {
  vertical: 'restaurant' | 'pharma';
  items: unknown;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  source_type: string | null;
  delivered_proof_url: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Nouă',
  OFFERED: 'Oferită',
  ACCEPTED: 'Acceptată',
  PICKED_UP: 'Ridicată',
  IN_TRANSIT: 'În livrare',
  DELIVERED: 'Livrată',
  CANCELLED: 'Anulată',
};

const TIMELINE_STEPS = ['CREATED', 'ACCEPTED', 'PICKED_UP', 'DELIVERED'] as const;

function osmLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

export default async function FleetOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const fleet = await requireFleetManager();
  const admin = createAdminClient();

  const [{ data: orderData }, { data: couriersData }, { data: shiftsData }] =
    await Promise.all([
      admin
        .from('courier_orders')
        .select(
          'id, status, vertical, customer_first_name, customer_phone, pickup_line1, pickup_lat, pickup_lng, dropoff_line1, dropoff_lat, dropoff_lng, items, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id, source_type, delivered_proof_url, created_at, updated_at',
        )
        .eq('id', params.id)
        .eq('fleet_id', fleet.fleetId)
        .maybeSingle(),
      admin
        .from('courier_profiles')
        .select('user_id, full_name, vehicle_type')
        .eq('fleet_id', fleet.fleetId)
        .order('full_name', { ascending: true }),
      admin.from('courier_shifts').select('courier_user_id').eq('status', 'ONLINE'),
    ]);

  const order = orderData as OrderDetail | null;
  if (!order) notFound();

  const couriers = (couriersData ?? []) as DispatchCourier[];
  const onlineSet = new Set(
    ((shiftsData ?? []) as Array<{ courier_user_id: string }>).map((s) => s.courier_user_id),
  );
  const annotated = couriers
    .map((c) => ({ ...c, online: onlineSet.has(c.user_id) }))
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '');
    });

  const assignedCourier = order.assigned_courier_user_id
    ? couriers.find((c) => c.user_id === order.assigned_courier_user_id) ?? null
    : null;

  const items = Array.isArray(order.items)
    ? (order.items as Array<{ name: string; quantity: number }>)
    : [];

  const pickupOsm = osmLink(order.pickup_lat, order.pickup_lng);
  const dropoffOsm = osmLink(order.dropoff_lat, order.dropoff_lng);

  // Compute the timeline progress index — stop at the first step we haven't
  // reached. Cancelled orders are special-cased below.
  const reachedIdx = order.status === 'CANCELLED'
    ? -1
    : Math.max(
        0,
        TIMELINE_STEPS.findIndex((s) =>
          s === 'CREATED'
            ? true
            : s === 'ACCEPTED'
              ? ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)
              : s === 'PICKED_UP'
                ? ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)
                : ['DELIVERED'].includes(order.status),
        ),
      );
  // findIndex returns the first match; we want the *last* reached step.
  let lastReached = -1;
  for (let i = TIMELINE_STEPS.length - 1; i >= 0; i--) {
    const step = TIMELINE_STEPS[i];
    const passed =
      step === 'CREATED'
        ? true
        : step === 'ACCEPTED'
          ? ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)
          : step === 'PICKED_UP'
            ? ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)
            : order.status === 'DELIVERED';
    if (passed) {
      lastReached = i;
      break;
    }
  }
  // reachedIdx is unused once we have lastReached — keep variable to surface the intent in code review.
  void reachedIdx;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/fleet/orders"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Înapoi la comenzi
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            {order.customer_first_name ?? 'Comandă'}
          </h1>
          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
            #{order.id.slice(0, 8)}
          </p>
        </div>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-200">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      {/* Timeline */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <ul className="grid grid-cols-4 gap-1 text-[10px] text-zinc-400">
          {TIMELINE_STEPS.map((step, idx) => {
            const reached = idx <= lastReached;
            return (
              <li key={step} className="flex flex-col items-center gap-1.5">
                <span
                  className={`h-2 w-full rounded-full ${
                    reached ? 'bg-violet-500' : 'bg-zinc-800'
                  }`}
                />
                <span
                  className={
                    reached ? 'font-semibold text-zinc-100' : 'text-zinc-500'
                  }
                >
                  {STATUS_LABEL[step]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pickup */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
          Ridicare
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-100">
          {order.pickup_line1 ?? '—'}
        </p>
        {pickupOsm ? (
          <a
            href={pickupOsm}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
          >
            <MapPin className="h-3 w-3" aria-hidden />
            Vezi pe hartă
          </a>
        ) : null}
      </section>

      {/* Dropoff */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
          Livrare
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-100">
          {order.dropoff_line1 ?? '—'}
        </p>
        <p className="mt-1 text-xs text-zinc-400">{order.customer_first_name ?? 'Client'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {dropoffOsm ? (
            <a
              href={dropoffOsm}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
            >
              <MapPin className="h-3 w-3" aria-hidden />
              Hartă
            </a>
          ) : null}
          {order.customer_phone ? (
            <a
              href={`tel:${order.customer_phone}`}
              className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
            >
              <Phone className="h-3 w-3" aria-hidden />
              Sună client
            </a>
          ) : null}
        </div>
      </section>

      {/* Items */}
      {items.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            <Package className="h-3 w-3" aria-hidden /> Produse
          </p>
          <ul className="space-y-1 text-sm text-zinc-200">
            {items.map((it, i) => (
              <li key={i}>
                <span className="text-zinc-500">{it.quantity}×</span> {it.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Payment summary */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Total</span>
          <span className="text-base font-semibold text-zinc-100">
            {order.total_ron != null ? `${Number(order.total_ron).toFixed(2)} RON` : '—'}
          </span>
        </div>
        {order.delivery_fee_ron != null ? (
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Taxă livrare</span>
            <span className="text-zinc-300">
              {Number(order.delivery_fee_ron).toFixed(2)} RON
            </span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Plată</span>
          <span className="text-zinc-300">
            {order.payment_method === 'COD' ? (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Banknote className="h-3 w-3" aria-hidden />
                Cash
              </span>
            ) : (
              (order.payment_method ?? '—')
            )}
          </span>
        </div>
      </section>

      {/* Assignment + reassign — reuses the OrderRow assign picker. */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Curier
        </h2>
        {assignedCourier ? (
          <p className="mb-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            <span className="text-zinc-500">Asignat: </span>
            <span className="font-medium">{assignedCourier.full_name ?? '—'}</span>
            {onlineSet.has(assignedCourier.user_id) ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                Online
              </span>
            ) : null}
          </p>
        ) : null}
        <ul>
          <OrderRow order={order} couriers={annotated} courierName={null} />
        </ul>
      </section>

      {order.delivered_proof_url ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Dovadă livrare
          </p>
          <a
            href={order.delivered_proof_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border border-zinc-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.delivered_proof_url}
              alt="Dovadă livrare"
              className="max-h-72 w-full object-cover"
            />
          </a>
        </section>
      ) : null}
    </div>
  );
}
