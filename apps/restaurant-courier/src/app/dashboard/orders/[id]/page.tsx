import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  acceptOrderAction,
  markPickedUpAction,
  markDeliveredAction,
  cancelOrderByCourierAction,
} from '../../actions';
import { OrderTimeline } from '@/components/order-timeline';
import { MapLink, PhoneLink } from '@/components/nav-buttons';
import { VerticalBadge } from '@/components/vertical-badge';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { TenantBadge } from '@/components/tenant-badge';
import { EarningsPreview } from '@/components/earnings-preview';
import { SosButton } from '@/components/sos-button';
import { ActiveOrderTimer } from '@/components/active-order-timer';
import { CopyAddressButton } from '@/components/copy-address-button';
import { OrderActions } from './order-actions';
import { OrderDetailRealtime } from './order-detail-realtime';
import { WakeLockOnActive } from '@/components/wake-lock-on-active';
import { LiveEta } from '@/components/live-eta';
import { resolveRiderMode } from '@/lib/rider-mode';
import { logMedicalAccess } from '@/lib/medical-access';
import { headers } from 'next/headers';
import { QuickCallButtons } from '@/components/quick-call-buttons';
import { GeofenceWatcher } from '@/components/geofence-watcher';

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
  source_tenant_id: string | null;
  fleet_id: string | null;
};

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // IDOR guard (#466): admin client is used here so server rendering stays
  // resilient to RLS variability across environments, but we MUST gate
  // visibility post-fetch. A courier may view an order only when:
  //   * it's assigned to them (their own active delivery), OR
  //   * it's still open (CREATED/OFFERED) within their own fleet.
  // Anything else returns notFound() — no 403 message, no PII leak.
  const admin = createAdminClient();
  const [{ data }, riderMode, { data: profileRow }] = await Promise.all([
    admin
      .from('courier_orders')
      .select(
        'id, status, source_type, vertical, pharma_metadata, customer_first_name, customer_phone, pickup_line1, pickup_lat, pickup_lng, dropoff_line1, dropoff_lat, dropoff_lng, items, total_ron, delivery_fee_ron, payment_method, assigned_courier_user_id, updated_at, source_tenant_id, fleet_id',
      )
      .eq('id', params.id)
      .maybeSingle(),
    resolveRiderMode(user.id),
    admin
      .from('courier_profiles')
      .select('vehicle_type')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  const vehicleType = (profileRow as { vehicle_type?: string } | null)?.vehicle_type ?? 'BIKE';

  const order = data as OrderDetail | null;
  if (!order) notFound();

  const isMine = order.assigned_courier_user_id === user.id;
  const isOpenInMyFleet =
    order.assigned_courier_user_id === null &&
    (order.status === 'CREATED' || order.status === 'OFFERED') &&
    order.fleet_id !== null &&
    order.fleet_id === riderMode.fleetId;
  if (!isMine && !isOpenInMyFleet) notFound();

  // Pharma orders show patient name + delivery address + (downstream)
  // prescription metadata. Per Legea 95 / GDPR Art.30, every such read
  // needs to leave an audit trail. Fire-and-forget — see
  // logMedicalAccess for the contract.
  if (order.vertical === 'pharma') {
    const h = await headers();
    void logMedicalAccess({
      actorUserId: user.id,
      entityType: 'courier_order',
      entityId: order.id,
      purpose: 'delivery',
      // x-forwarded-for is set by Vercel's edge for the originating
      // client IP. Fall back to null if the header is absent (e.g.
      // running locally without the proxy chain).
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: h.get('user-agent'),
      metadata: { rider_mode: riderMode.mode },
    });
  }

  // Mode-B riders see orders from multiple tenants — surface the
  // source restaurant/pharmacy name in the detail header too, not just
  // on the list (#428). Single lookup, cached by Next route segment.
  let tenantName: string | null = null;
  if (riderMode.mode === 'B' && order.source_tenant_id) {
    const { data: tenant } = await admin
      .from('tenants')
      .select('name')
      .eq('id', order.source_tenant_id)
      .maybeSingle();
    tenantName = (tenant as { name: string | null } | null)?.name ?? null;
  }

  const isAvailable = isOpenInMyFleet;
  const showSos = isMine && (order.status === 'PICKED_UP' || order.status === 'IN_TRANSIT' || order.status === 'ACCEPTED');

  // Quick-call: fetch the fleet's dispatcher phone only for active own
  // deliveries — not for available orders the courier hasn't accepted yet.
  let fleetContactPhone: string | null = null;
  let fleetName: string | null = null;
  if (showSos && order.fleet_id) {
    const { data: fleetRow } = await admin
      .from('courier_fleets')
      .select('name, contact_phone')
      .eq('id', order.fleet_id)
      .maybeSingle();
    const fleet = fleetRow as { name: string | null; contact_phone: string | null } | null;
    fleetContactPhone = fleet?.contact_phone ?? null;
    fleetName = fleet?.name ?? null;
  }

  const acceptBound = acceptOrderAction.bind(null, order.id);
  const pickedUpBound = markPickedUpAction.bind(null, order.id);
  const deliveredBound = markDeliveredAction.bind(null, order.id);
  const cancelBound = cancelOrderByCourierAction.bind(null, order.id);

  const items = Array.isArray(order.items)
    ? (order.items as Array<{ name: string; quantity: number }>)
    : [];

  const vertical = order.vertical ?? 'restaurant';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <OrderDetailRealtime
        orderId={order.id}
        viewerId={user.id}
        initialAssignedTo={order.assigned_courier_user_id}
        initialStatus={order.status}
      />
      <WakeLockOnActive status={order.status} />
      {isMine &&
      (order.status === 'ACCEPTED' || order.status === 'PICKED_UP') &&
      order.pickup_lat != null &&
      order.pickup_lng != null &&
      order.dropoff_lat != null &&
      order.dropoff_lng != null ? (
        <GeofenceWatcher
          orderId={order.id}
          pickup={{ lat: order.pickup_lat, lng: order.pickup_lng }}
          dropoff={{ lat: order.dropoff_lat, lng: order.dropoff_lng }}
          status={order.status}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-hir-fg">Comandă</h1>
          <VerticalBadge vertical={vertical} />
          <TenantBadge name={tenantName} />
        </div>
        <OrderStatusBadge status={order.status} size="md" />
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
      <section className="rounded-2xl border border-violet-500/20 bg-hir-surface p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-300">
            1
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
            Ridicare
          </p>
        </div>
        <p className="mt-2 text-base font-semibold text-hir-fg">
          {order.pickup_line1 ?? '—'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MapLink
            address={order.pickup_line1}
            lat={order.pickup_lat}
            lng={order.pickup_lng}
          />
          <CopyAddressButton address={order.pickup_line1} />
        </div>
      </section>

      {/* Timeline. */}
      <section className="rounded-2xl border border-hir-border bg-hir-surface px-5 py-4">
        <OrderTimeline status={order.status} />
      </section>

      {/* Live ETA: only while this courier is actively delivering. */}
      {isMine && (order.status === 'PICKED_UP' || order.status === 'IN_TRANSIT') &&
      order.dropoff_lat != null && order.dropoff_lng != null ? (
        <LiveEta
          dropoffLat={order.dropoff_lat}
          dropoffLng={order.dropoff_lng}
          vehicleType={vehicleType}
        />
      ) : null}

      {/* Dropoff card. */}
      <section className="rounded-2xl border border-emerald-500/20 bg-hir-surface p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
            2
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
            Livrare
          </p>
        </div>
        <p className="mt-2 text-base font-semibold text-hir-fg">
          {order.dropoff_line1 ?? '—'}
        </p>
        <p className="mt-1 text-sm text-hir-muted-fg">
          {order.customer_first_name ?? 'Client'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MapLink
            address={order.dropoff_line1}
            lat={order.dropoff_lat}
            lng={order.dropoff_lng}
          />
          <PhoneLink phone={order.customer_phone} />
          <CopyAddressButton address={order.dropoff_line1} />
        </div>
        {showSos ? (
          <div className="mt-3">
            <QuickCallButtons
              fleetContactPhone={fleetContactPhone}
              fleetName={fleetName}
            />
          </div>
        ) : null}
      </section>

      {/* Items + payment. */}
      {items.length > 0 ? (
        <section className="rounded-2xl border border-hir-border bg-hir-surface p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-hir-muted-fg">
            <Package className="h-3 w-3" /> Produse
          </p>
          <ul className="space-y-1 text-sm text-hir-fg">
            {items.map((it, i) => (
              <li key={i}>
                <span className="text-hir-muted-fg">{it.quantity}×</span> {it.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-hir-border bg-hir-surface p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-hir-muted-fg">Total</span>
          <span className="text-base font-semibold text-hir-fg">
            {order.total_ron != null ? `${Number(order.total_ron).toFixed(2)} RON` : '—'}
          </span>
        </div>
        {order.delivery_fee_ron != null ? (
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-hir-muted-fg">Taxă livrare</span>
            <span className="text-hir-fg">{Number(order.delivery_fee_ron).toFixed(2)} RON</span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-hir-muted-fg">Plată</span>
          <span className="text-hir-fg">{order.payment_method ?? '—'}</span>
        </div>
      </section>

      {/* Sticky action bar: stays visible at the bottom while the courier
          scrolls through pickup/dropoff/item details above. Uses
          pb-safe-bottom so it never hides behind the iOS home indicator.
          The z-index sits below the bottom-nav (z-[1100]) so it doesn't
          bleed over the navigation chrome. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-hir-border bg-hir-bg/95 px-4 pb-[env(safe-area-inset-bottom,0.5rem)] pt-3 backdrop-blur sm:-mx-6 sm:px-6">
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
          cancelAction={cancelBound}
        />

        {showSos ? <div className="mt-2"><SosButton /></div> : null}
      </div>
    </div>
  );
}
