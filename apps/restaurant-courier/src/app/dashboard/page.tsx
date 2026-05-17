import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { startShiftAction, endShiftAction } from './actions';
import { SwipeButton } from '@/components/swipe-button';
import { RiderMapLazy as RiderMap } from '@/components/rider-map-lazy';
import { VerticalBadge } from '@/components/vertical-badge';
import { OrderStatusBadge } from '@/components/order-status-badge';
import { WeatherPill } from '@/components/weather-pill';
import { fetchWeather, safetyReminder, BRASOV_CENTER } from '@/lib/weather';
import { MultiStopFocus, type FocusOrder } from '@/components/multi-stop-focus';
import { IdleShiftNudge } from '@/components/idle-shift-nudge';

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
          'id, status, vertical, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_line1, dropoff_line1, customer_first_name, updated_at',
        )
        .eq('assigned_courier_user_id', user.id)
        .in('status', ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
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
  const activeOrders = ((activeOrdersData ?? []) as ActiveOrderRow[])
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

  // Natural-language next-action hint for the courier's #1 priority
  // order. Plain RO copy that mirrors how dispatchers actually phrase
  // instructions over the radio - the rider should not have to parse a
  // status enum to know what comes next.
  const topOrder = activeOrders[0] ?? null;
  const nextActionHint = !topOrder
    ? null
    : topOrder.status === 'ACCEPTED'
      ? topOrder.pickup_line1
        ? `Mergi la ridicare · ${topOrder.pickup_line1}`
        : 'Mergi la ridicare'
      : topOrder.status === 'PICKED_UP'
        ? topOrder.dropoff_line1
          ? `Mergi la livrare · ${topOrder.dropoff_line1}`
          : 'Mergi la livrare'
        : topOrder.status === 'IN_TRANSIT'
          ? 'Aproape la client'
          : null;

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

      {/* Greeting + status pill + weather, top-left over the map.
          The accent left border + soft violet glow give the card a
          "hero" feel without being loud. Pulsing emerald dot when
          online so the rider has an at-a-glance live signal. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[62%] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur shadow-lg shadow-violet-500/5">
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] ${isOnline ? 'bg-emerald-400' : 'bg-zinc-700'}`}
        />
        <div className="px-3.5 py-2.5">
          <p className="text-sm font-semibold tracking-tight text-zinc-100">
            Bună, {profile?.full_name?.split(' ')[0] ?? 'curier'}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-300">
            <span
              aria-hidden
              className={`relative inline-flex h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-zinc-500'}`}
            >
              {isOnline ? (
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60"
                />
              ) : null}
            </span>
            {isOnline
              ? activeOrders.length > 0
                ? `${activeOrders.length} ${activeOrders.length === 1 ? 'comandă activă' : 'comenzi active'}`
                : 'Online · aștept comandă'
              : 'Offline · pornește tura'}
          </p>
          {nextActionHint ? (
            <p className="mt-1.5 truncate text-[11px] font-medium text-violet-300">
              {nextActionHint}
            </p>
          ) : null}
          <WeatherPill weather={weather} reminder={reminder} />
        </div>
      </div>

      {/* Active-order quick-jump cards. Sorted by next-action urgency
          (IN_TRANSIT/PICKED_UP first), prefixed with sequence numbers so
          the rider always knows which order to handle next. */}
      {activeOrders.length > 0 ? (
        <div className="absolute right-3 top-3 z-10 flex max-w-[55%] flex-col gap-2">
          {activeOrders.slice(0, 3).map((o, idx) => (
            <Link
              key={o.id}
              href={`/dashboard/orders/${o.id}`}
              className={`group flex items-center gap-2 rounded-xl border bg-zinc-950/90 px-3 py-2 text-xs font-medium text-zinc-100 shadow-lg backdrop-blur transition-all hover:-translate-y-px hover:bg-zinc-900 hover:shadow-xl active:translate-y-0 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2 ${
                idx === 0
                  ? 'border-violet-400 shadow-violet-500/30 ring-1 ring-violet-500/40 hover:border-violet-300 hover:shadow-violet-500/40'
                  : 'border-violet-500/40 hover:border-violet-400'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  idx === 0
                    ? 'bg-violet-500 text-white shadow-md shadow-violet-500/40'
                    : 'bg-hir-border text-hir-fg'
                }`}
              >
                {idx + 1}
              </span>
              <OrderStatusBadge status={o.status} />
              {o.vertical === 'pharma' ? <VerticalBadge vertical="pharma" /> : null}
              <span className="min-w-0 flex-1 truncate">
                {o.customer_first_name ?? o.dropoff_line1 ?? 'Comandă'}
              </span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-violet-300 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))}
          {activeOrders.length > 3 ? (
            <Link
              href="/dashboard/orders"
              className="group rounded-xl border border-hir-border bg-zinc-950/85 px-3 py-1.5 text-center text-[11px] font-medium text-hir-fg backdrop-blur transition-all hover:border-violet-500/40 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            >
              <span className="tabular-nums">+{activeOrders.length - 3}</span>
              <span className="mx-1 text-hir-muted-fg">·</span>
              vezi toate
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Multi-stop focus banner. Renders only when 2+ active orders so it
          doesn't clutter the common single-order case. Sits above the
          shift-control overlay so the courier always sees the next
          actionable instruction without scrolling. */}
      {activeOrders.length >= 2 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-[1199] px-3">
          <MultiStopFocus orders={activeOrders as FocusOrder[]} />
        </div>
      ) : null}

      {/* Idle-shift nudge — toasts once per hour if online > 30 min with
          zero active orders. Renders null. */}
      <IdleShiftNudge
        activeOrders={activeOrders.length}
        isOnline={isOnline}
        shiftStartedAt={shift?.started_at ?? null}
      />

      {/* Shift-control overlay. z-[1200] — above the bottom-nav (z-[1100])
          and above any Leaflet internal pane / control. Different copy +
          variant per state: offline → start (violet); online → stop
          (success green, surfaced only when no active orders so the courier
          doesn't accidentally go offline mid-delivery). */}
      {!isOnline ? (
        <div className="fixed inset-x-0 bottom-16 z-[1200] px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
            <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Ești offline
            </p>
            <SwipeButton
              label="→ Glisează pentru a porni tura"
              onConfirm={startShiftAction}
            />
            <div className="mt-2.5 flex items-center justify-center gap-3 text-[11px] text-zinc-500">
              <span>Glisează sau ține apăsat ~1 secundă.</span>
              <span aria-hidden className="text-zinc-700">·</span>
              <Link
                href="/dashboard/help"
                className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
              >
                Ghid rapid
              </Link>
            </div>
          </div>
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-[1200] px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur">
            <p className="mb-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
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
