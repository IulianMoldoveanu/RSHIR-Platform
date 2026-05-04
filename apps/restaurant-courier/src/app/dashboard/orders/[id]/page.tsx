import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  acceptOrderAction,
  markPickedUpAction,
  markDeliveredAction,
} from '../../actions';
import { OrderTimeline } from '@/components/order-timeline';
import { MapLink, PhoneLink } from '@/components/nav-buttons';
import { VerticalBadge } from '@/components/vertical-badge';
import { EarningsPreview } from '@/components/earnings-preview';
import { SosButton } from '@/components/sos-button';
import { ActiveOrderTimer } from '@/components/active-order-timer';
import { OrderActions } from './order-actions';

export const dynamic = 'force-dynamic';

type PharmaMetadata = {
  requires_id_verification?: boolean;
  requires_prescription?: boolean;
};

type OrderDetail = {
  id: string;
  status: string;
  source_type: string;
  vertical: 'restaurant' | 'pharma';
  pharma_metadata: PharmaMetadata | null;
  customer_first_name: string | null;
  customer_phone: string | null;
  pickup_line1: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_line1: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  items: unknown;
  total_ron: number | null;
  delivery_fee_ron: number | null;
  payment_method: 'CARD' | 'COD' | null;
  assigned_courier_user_id: string | null;
  updated_at: string | null;
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('courier_orders')
    .select(
      'id, status, source_type, vertical, pharma_metadata, customer_first_name, customer_phone, pickup_line1, pickup_lat, pickup_lng, dropoff_line1, dropoff_lat, dropoff_lng, items, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id, updated_at',
    )
    .eq('id', params.id)
    .maybeSingle();

  const order = data as OrderDetail | null;
  if (!order) notFound();

  const isMine = order.assigned_courier_user_id === user.id;
  const isAvailable =
    order.assigned_courier_user_id === null &&
    (order.status === 'CREATED' || order.status === 'OFFERED');
  const showSos = isMine && (order.status === 'PICKED_UP' || order.status === 'IN_TRANSIT' || order.status === 'ACCEPTED');

  const acceptBound = acceptOrderAction.bind(null, order.id);
  const pickedUpBound = markPickedUpAction.bind(null, order.id);
  const deliveredBound = markDeliveredAction.bind(null, order.id);

  const items = Array.isArray(order.items)
    ? (order.items as Array<{ name: string; quantity: number }>)
    : [];

  const vertical = order.vertical ?? 'restaurant';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-zinc-100">Comandă</h1>
          <VerticalBadge vertical={vertical} />
        </div>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
          {order.status}
        </span>
      </div>

      {isMine ? <ActiveOrderTimer status={order.status} since={order.updated_at} /> : null}

      {isAvailable ? (
        <EarningsPreview
          deliveryFeeRon={order.delivery_fee_ron}
          paymentMethod={order.payment_method}
          totalRon={order.total_ron}
          pickupLat={order.pickup_lat}
          pickupLng={order.pickup_lng}
          dropoffLat={order.dropoff_lat}
          dropoffLng={order.dropoff_lng}
        />
      ) : null}

      {/* Pickup card. */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
          Ridicare
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-100">
          {order.pickup_line1 ?? '—'}
        </p>
        <div className="mt-3">
          <MapLink
            address={order.pickup_line1}
            lat={order.pickup_lat}
            lng={order.pickup_lng}
          />
        </div>
      </section>

      {/* Timeline. */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <OrderTimeline status={order.status} />
      </section>

      {/* Dropoff card. */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
          Livrare
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-100">
          {order.dropoff_line1 ?? '—'}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          {order.customer_first_name ?? 'Client'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MapLink
            address={order.dropoff_line1}
            lat={order.dropoff_lat}
            lng={order.dropoff_lng}
          />
          <PhoneLink phone={order.customer_phone} />
        </div>
      </section>

      {/* Items + payment. */}
      {items.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            <Package className="h-3 w-3" /> Produse
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
            <span className="text-zinc-300">{Number(order.delivery_fee_ron).toFixed(2)} RON</span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Plată</span>
          <span className="text-zinc-300">{order.payment_method ?? '—'}</span>
        </div>
      </section>

      <OrderActions
        orderId={order.id}
        status={order.status}
        isMine={isMine}
        isAvailable={isAvailable}
        vertical={vertical}
        pharmaMetadata={order.pharma_metadata}
        paymentMethod={order.payment_method}
        totalRon={order.total_ron}
        acceptAction={acceptBound}
        pickedUpAction={pickedUpBound}
        deliveredAction={deliveredBound}
      />

      {showSos ? <SosButton /> : null}
    </div>
  );
}
