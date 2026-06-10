import Link from 'next/link';
import { ArrowRight, Clock, Phone } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startShiftAction, endShiftAction, acceptOrderAction, markPickedUpAction } from './actions';
import { SwipeButton } from '@/components/swipe-button';
import { RiderMapLazy as RiderMap } from '@/components/rider-map-lazy';
import { VerticalBadge } from '@/components/vertical-badge';
import { MapLink } from '@/components/nav-buttons';
import { WeatherPill } from '@/components/weather-pill';
import { fetchWeather, safetyReminder, BRASOV_CENTER } from '@/lib/weather';
import { DashboardGreeting } from '@/components/dashboard-greeting';
import { OrdersRealtime } from './orders/orders-realtime';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  full_name: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'SUSPENDED';
  vehicle_type: 'BIKE' | 'SCOOTER' | 'CAR';
};

type ShiftRow = {
  id: string;
  last_lat: number | null;
  last_lng: number | null;
  started_at: string | null;
};

type ActiveOrderRow = {
  id: string;
  status: string;
  vertical: 'restaurant' | 'pharma' | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  pickup_line1: string | null;
  dropoff_line1: string | null;
  customer_first_name: string | null;
  updated_at: string | null;
  // Pharma readiness: set by the mirror when the pharmacist marks the order
  // "ready for pickup". null for pharma orders not yet prepared → pickup gated.
  pharma_ready_at: string | null;
  // Optional vendor (pharmacy/restaurant) name + phone for the pickup card.
  pickup_phone: string | null;
  pickup_name: string | null;
  // Order reference (e.g. FDH1-0010) shown as the visible order number.
  external_ref: string | null;
  // Client phone, for the round call button on the delivery leg.
  customer_phone: string | null;
};

// Always-on full-screen map. Offline → swipe-start overlay above the map.
// Online → live rider pin + active-order pickups (violet) and dropoffs (emerald).
// Active orders surface as a stacked card list at the top so the rider can
// jump straight to the next stage without losing the map context.
export default async function DashboardHome() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [{ data: profileData }, { data: shiftData }, { data: activeOrdersData }] =
    await Promise.all([
      admin
        .from('courier_profiles')
        .select('full_name, status, vehicle_type')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('courier_shifts')
        .select('id, last_lat, last_lng, started_at')
        .eq('courier_user_id', user.id)
        .eq('status', 'ONLINE')
        .limit(1)
        .maybeSingle(),
      admin
        .from('courier_orders')
        .select(
          'id, status, vertical, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_line1, dropoff_line1, customer_first_name, customer_phone, updated_at, pharma_ready_at, pickup_phone, pickup_name, external_ref',
        )
        .eq('assigned_courier_user_id', user.id)
        .in('status', ['OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
        .order('updated_at', { ascending: false }),
    ]);

  const profile = profileData as ProfileRow | null;
  const shift = shiftData as ShiftRow | null;
  const isOnline = !!shift;

  // Weather: fetch only when a shift is ONLINE (the courier is on the move).
  // Use the courier's last GPS fix; fall back to Brașov center.
  // fetchWeather is cached 30 min in-process — no extra network latency on
  // subsequent navigations within the same Vercel function instance.
  const weatherLat = shift?.last_lat ?? BRASOV_CENTER.lat;
  const weatherLng = shift?.last_lng ?? BRASOV_CENTER.lng;
  const weather = isOnline ? await fetchWeather(weatherLat, weatherLng) : null;
  const reminder = weather ? safetyReminder(weather) : null;
  // Sort active orders by next-action urgency so the rider sees what to
  // do FIRST at the top: in-progress (IN_TRANSIT > PICKED_UP) before
  // not-yet-picked (ACCEPTED). Tie-break on updated_at desc (already the
  // SQL order). Audit P1 #4 — previous "newest first" left a 12-min-old
  // PICKED_UP behind a fresh ACCEPTED.
  const STATUS_PRIORITY: Record<string, number> = {
    IN_TRANSIT: 0,
    PICKED_UP: 1,
    ACCEPTED: 2,
  };
  // A directed offer (OFFERED, assigned to me, not yet accepted) is surfaced
  // ONLY by the big swipe-to-accept overlay below — keep it out of the
  // active-order pins / quick-jump cards / multi-stop banner so it isn't shown
  // twice. Those reflect work already accepted.
  const activeOrders = ((activeOrdersData ?? []) as ActiveOrderRow[])
    .filter((o) => o.status !== 'OFFERED')
    .slice()
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return ub - ua;
    });

  const activePins = activeOrders.map((o) => ({
    orderId: o.id,
    pickupLat: o.pickup_lat,
    pickupLng: o.pickup_lng,
    dropoffLat: o.dropoff_lat,
    dropoffLng: o.dropoff_lng,
  }));

  // The courier's #1 priority order — its next action is surfaced by the
  // bottom-half active-order card (see below), not echoed in the greeting.
  const topOrder = activeOrders[0] ?? null;

  // An incoming directed offer (assigned to this courier, not yet accepted).
  // Surfaced as a big swipe-to-accept overlay on the main map.
  const incomingOffer =
    ((activeOrdersData ?? []) as ActiveOrderRow[]).find((o) => o.status === 'OFFERED') ?? null;

  // The single active order the courier is "in" right now (highest priority).
  // Its one primary action is shown inline on the home map — pickup while
  // ACCEPTED, deliver once PICKED_UP/IN_TRANSIT — so there's no order list to
  // browse. Pharma pickup stays gated until the pharmacist marks it ready.
  const topIsPickup = topOrder?.status === 'ACCEPTED';
  const topReady = !topOrder
    ? false
    : !topIsPickup
      ? true
      : topOrder.vertical !== 'pharma' || topOrder.pharma_ready_at != null;
  const topAddress = !topOrder
    ? null
    : topIsPickup
      ? topOrder.pickup_line1
      : topOrder.dropoff_line1;
  const topLat = !topOrder ? null : topIsPickup ? topOrder.pickup_lat : topOrder.dropoff_lat;
  const topLng = !topOrder ? null : topIsPickup ? topOrder.pickup_lng : topOrder.dropoff_lng;

  // Vendor word + single stage label so ONE card reflects where the order is:
  // "Comanda se pregătește" (vendor preparing) → "Gata de ridicare" (vendor
  // marked it ready) → "În curs de livrare" (after pickup). Vertical-agnostic.
  const vendorWord = topOrder?.vertical === 'pharma' ? 'Farmacia' : 'Restaurantul';
  const stageTitle = !topOrder
    ? ''
    : topIsPickup
      ? topReady
        ? 'Gata de ridicare'
        : 'Comanda se pregătește'
      : 'În curs de livrare';
  // Visible per-order number: the vendor reference (e.g. FDH1-0010) when present,
  // else a short stable code from the id so EVERY order is numbered for the rider.
  const topOrderNo = !topOrder
    ? ''
    : (topOrder.external_ref ?? topOrder.id.slice(0, 6).toUpperCase());
  // Contact shown with the round call button: the vendor on the pickup leg, the
  // client on the delivery leg.
  const topContactName = !topOrder
    ? null
    : topIsPickup
      ? topOrder.pickup_name
      : topOrder.customer_first_name;
  const topContactPhone = !topOrder
    ? null
    : topIsPickup
      ? topOrder.pickup_phone
      : topOrder.customer_phone;

  // Bleed under header padding (main has pt-6 px-4 pb-24). Negative margins
  // pull the map flush to header bottom + bottom-nav top edges. Height fills
  // viewport minus the 56px header (h-14). Uses dvh (dynamic viewport height)
  // so iOS/Chrome address-bar collapse doesn't leave a strip of empty space
  // under the map — that was the root cause of the "half-screen" complaint.
  // NOTE: we deliberately do not set z-0 here — that creates a stacking
  // context that traps the fixed shift overlay below the bottom-nav.
  return (
    <div className="relative -mx-4 -mt-6 -mb-24 h-[calc(100dvh-3.5rem)] min-h-[calc(100vh-3.5rem)] sm:-mx-6">
      <RiderMap
        fillParent
        activePins={activePins}
        vehicleType={profile?.vehicle_type ?? 'BIKE'}
      />

      {/* Live refresh of THIS courier's orders (assigned-only): a directed
          offer arriving, the pharmacist stamping pharma_ready_at, or an
          out-of-band cancel now re-render the map overlays without a manual
          refresh. The home tab previously had no realtime, so offers/ready
          state were stale until the courier navigated away and back. */}
      <OrdersRealtime courierUserId={user.id} fleetId={null} watchFleetOpenOrders={false} />

      {/* Greeting + status pill + weather, top-left over the map.
          Auto-dismisses after 45s or closable via the X button. */}
      <DashboardGreeting>
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] ${isOnline ? 'bg-emerald-400' : 'bg-zinc-700'}`}
        />
        <div className="px-3.5 py-2.5">
          <p className="text-sm font-semibold tracking-tight text-hir-fg">
            Bună, {profile?.full_name?.split(' ')[0] ?? 'curier'}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-hir-fg">
            <span
              aria-hidden
              className={`relative inline-flex h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-hir-muted-fg/40'}`}
            >
              {isOnline ? (
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70"
                />
              ) : null}
            </span>
            {isOnline ? 'Online' : 'Offline · pornește tura'}
          </p>
          {/* The active order is NOT echoed here — it lives only in the
              bottom-half order card so the courier stays "inside the order"
              and nothing clutters the top-left corner. */}
          <WeatherPill weather={weather} reminder={reminder} />
        </div>
      </DashboardGreeting>

      {/* Active order is surfaced as ONE inline card near the bottom (below) —
          no top-right list, no separate detail page for the primary flow. */}

      {/* Incoming offer — big swipe-to-accept overlay on the main map.
          Shows when a directed offer is assigned to this courier but not yet
          accepted. Swiping calls acceptOrderAction; on success the order
          becomes ACCEPTED and stays as the active/open order. */}
      {incomingOffer ? (
        <div className="fixed inset-x-0 bottom-16 z-[1250] px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-2xl border-2 border-violet-400 bg-hir-bg/95 p-4 shadow-2xl ring-2 ring-inset ring-violet-500/30 backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-hir-fg">
                Comandă nouă{incomingOffer.vertical === 'pharma' ? ' · Farmacie' : ''}
              </p>
              {incomingOffer.vertical === 'pharma' ? <VerticalBadge vertical="pharma" /> : null}
            </div>
            {incomingOffer.pickup_line1 ? (
              <p className="text-xs text-hir-muted-fg">
                Ridicare: <span className="text-hir-fg">{incomingOffer.pickup_line1}</span>
              </p>
            ) : null}
            {incomingOffer.dropoff_line1 ? (
              <p className="mb-3 mt-0.5 text-xs text-hir-muted-fg">
                Livrare: <span className="text-hir-fg">{incomingOffer.dropoff_line1}</span>
              </p>
            ) : (
              <div className="mb-3" />
            )}
            <SwipeButton
              label="→ Glisează pentru a accepta"
              onConfirm={acceptOrderAction.bind(null, incomingOffer.id)}
            />
          </div>
        </div>
      ) : null}

      {/* Active order — ONE inline card with a single next action. The courier
          is "in the order": navigate, then pick up (gated until the pharmacist
          marks it ready), then confirm delivery. No status stepper, no list. */}
      {isOnline && topOrder && !incomingOffer ? (
        <div className="fixed inset-x-0 bottom-16 z-[1200] px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-2xl border-2 border-violet-400/80 bg-hir-bg/95 p-4 shadow-2xl ring-1 ring-inset ring-violet-500/20 backdrop-blur">
            {/* Header: visible order number + stage + vertical badge. */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-hir-fg">
                <span className="text-violet-300">#{topOrderNo}</span>
                <span className="mx-1.5 text-hir-muted-fg">·</span>
                {stageTitle}
              </p>
              {topOrder.vertical === 'pharma' ? <VerticalBadge vertical="pharma" /> : null}
            </div>

            {/* Pickup point (vendor) on the pickup leg, client on delivery —
                name + address, with the round call button alongside. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {topContactName ? (
                  <p className="truncate text-sm font-semibold text-hir-fg">{topContactName}</p>
                ) : null}
                {topAddress ? (
                  <p className="mt-0.5 text-xs text-hir-muted-fg">
                    {topIsPickup ? 'Ridicare' : 'Livrare'}:{' '}
                    <span className="text-hir-fg">{topAddress}</span>
                  </p>
                ) : null}
              </div>
              {topContactPhone ? (
                <a
                  href={`tel:${topContactPhone}`}
                  aria-label={topIsPickup ? `Sună ${vendorWord.toLowerCase()}` : 'Sună clientul'}
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-md shadow-emerald-500/15 transition-all hover:-translate-y-px hover:bg-emerald-500/25 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-emerald-500 focus-visible:outline-offset-2"
                >
                  <Phone className="h-5 w-5" aria-hidden strokeWidth={2.25} />
                </a>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MapLink address={topAddress} lat={topLat} lng={topLng} />
            </div>

            <div className="mt-3">
              {topIsPickup ? (
                <>
                  {/* Grey + non-swipeable until the vendor marks the order ready. */}
                  <SwipeButton
                    label={topReady ? '→ Glisează pentru ridicare' : 'Ridică comanda'}
                    onConfirm={markPickedUpAction.bind(null, topOrder.id)}
                    disabled={!topReady}
                  />
                  {!topReady ? (
                    <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-medium text-amber-300">
                      <Clock className="h-3.5 w-3.5 flex-none" aria-hidden strokeWidth={2.25} />
                      Disponibil după ce {vendorWord.toLowerCase()} marchează comanda gata.
                    </p>
                  ) : null}
                </>
              ) : (
                <Link
                  href={`/dashboard/orders/${topOrder.id}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition active:scale-[0.99] hover:bg-emerald-400"
                >
                  Confirmă livrarea
                  <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={2.5} />
                </Link>
              )}
            </div>
            {/* Recovery escape hatch on the PRIMARY surface: routes into the
                order detail where cancel + "call dispatcher/support" live, so a
                courier stuck at a closed vendor / absent client / wrong address
                isn't dead-ended on the home card (where those actions don't
                exist). Shown in both pickup and delivery phases. */}
            <Link
              href={`/dashboard/orders/${topOrder.id}`}
              className="mt-3 flex items-center justify-center gap-1 text-center text-[11px] font-medium text-amber-300/90 underline-offset-2 transition-colors hover:text-amber-200 hover:underline focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
            >
              Ai o problemă cu comanda?
              <ArrowRight className="h-3 w-3" aria-hidden strokeWidth={2.5} />
            </Link>
            {activeOrders.length > 1 ? (
              <Link
                href="/dashboard/orders"
                className="mt-3 block text-center text-[11px] font-medium text-hir-muted-fg underline-offset-2 transition-colors hover:text-hir-fg hover:underline focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
              >
                +{activeOrders.length - 1}{' '}
                {activeOrders.length - 1 === 1 ? 'altă comandă activă' : 'alte comenzi active'} · vezi toate
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Shift-control overlay. z-[1200] — above the bottom-nav (z-[1100])
          and above any Leaflet internal pane / control. Different copy +
          variant per state: offline → start (violet); online → stop
          (success green, surfaced only when no active orders so the courier
          doesn't accidentally go offline mid-delivery). */}
      {!isOnline ? (
        <div className="fixed inset-x-0 bottom-16 z-[1200] px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-hir-border bg-hir-bg/95 p-4 shadow-2xl ring-1 ring-inset ring-hir-border/40 backdrop-blur">
            <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-hir-muted-fg">
              Ești offline
            </p>
            <SwipeButton
              label="→ Glisează pentru a porni tura"
              onConfirm={startShiftAction}
            />
            <div className="mt-2.5 flex items-center justify-center gap-3 text-[11px] text-hir-muted-fg">
              <span>Glisează sau ține apăsat ~1 secundă.</span>
              <span aria-hidden className="text-hir-border">·</span>
              <Link
                href="/dashboard/help"
                className="group inline-flex items-center gap-1 text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 rounded"
              >
                Ghid rapid
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden strokeWidth={2.25} />
              </Link>
            </div>
          </div>
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-[1200] px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-hir-border bg-hir-bg/95 p-4 shadow-2xl ring-1 ring-inset ring-emerald-500/15 backdrop-blur">
            <p className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-200">
              <span aria-hidden className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
              </span>
              Online · gata pentru comenzi
            </p>
            <SwipeButton
              label="→ Glisează pentru a încheia tura"
              onConfirm={endShiftAction}
              variant="success"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
