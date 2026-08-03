'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { haversineKm, etaMinutesFromKm } from '@hir/ui';
import {
  DELIVERY_STEPS,
  PICKUP_STEPS,
  OrderTimeline,
} from '@/components/storefront/order-timeline';
import { CourierTrackView } from '@/components/storefront/courier-track-view';
import { useDemoCartHydrated, useDemoCartStore } from '@/lib/demo/demo-cart-store';
import { t, type Locale } from '@/lib/i18n';

// Simulated order tracking for the marketing demo.
//
// Everything visible here is the real product's component: `OrderTimeline` is
// the same timeline a customer sees on /track/[token], and `CourierTrackView`
// is the same courier panel — same avatar, same freshness line, same ETA pill,
// same OpenStreetMap map with the courier pin and the remaining leg. Only the
// *data* is fake, and it is labelled as fake.
//
// Written 2026-08-03 after Iulian asked for the courier map in the demo and
// added: "chiar totul trebuie sa coincida cu aplicatia reala". So it does not
// coincide by resemblance — it imports the same files. The previous version of
// this page was four invented stages and no map.
//
// Two things this deliberately does NOT fake: it never writes an order row and
// never contacts dispatch. There is no timer on a server anywhere.

/** Lipscani — matches the saved address in the simulated account (see
 *  demo-account-button.tsx), so the demo tells one consistent story. */
const RESTAURANT = { lat: 44.4318, lng: 26.1015 };
const CUSTOMER = { lat: 44.4405, lng: 26.0895 };

const COURIER = {
  name: 'Andrei',
  // Same shape a real courier_profiles.avatar_url takes. Stock portrait,
  // consistent with the demo menu's stock food photography.
  avatarUrl:
    'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=160&h=160&fit=crop&q=80',
  vehicleType: 'SCOOTER',
};

/**
 * How long each status is held, in ms. Real orders take ~35 minutes and a
 * visitor will not wait for that, so the demo runs the same statuses at a
 * watchable pace — but not a uniform one.
 *
 * DISPATCHED gets 5s and IN_DELIVERY 16s on purpose. Those are the two steps
 * where the map is on screen, and the map is the point of this page; a flat
 * 2.6s per step (the first version) had the Leaflet chunk still loading when
 * the order was already delivered. Measured against a production build: the
 * map is now up for ~21 of the demo's ~29 seconds.
 *
 * The ETA text in the timeline still comes from the real 35-minute default,
 * because that is what a real customer would actually be told.
 */
const STEP_HOLD_MS: Record<string, number> = {
  PENDING: 1800,
  CONFIRMED: 1800,
  PREPARING: 2400,
  READY: 1800,
  DISPATCHED: 5000,
  IN_DELIVERY: 16000,
};
/** Frames of the courier's approach, spread across the IN_DELIVERY hold. */
const COURIER_TICK_MS = 650;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function DemoTracking({ locale }: { locale: Locale }) {
  const hydrated = useDemoCartHydrated();
  const fulfillment = useDemoCartStore((s) => s.fulfillment);
  const isPickup = fulfillment === 'PICKUP';
  const steps = useMemo(
    () => (isPickup ? PICKUP_STEPS : DELIVERY_STEPS),
    [isPickup],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  // Fixed at mount so the timeline's elapsed-time maths has a stable origin.
  const [createdAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    let elapsed = 0;
    const timers = steps.slice(0, -1).map((step, i) => {
      elapsed += STEP_HOLD_MS[step] ?? 2000;
      return setTimeout(() => setStepIndex(i + 1), elapsed);
    });
    return () => timers.forEach(clearTimeout);
  }, [steps]);

  const status = steps[stepIndex];
  const onTheWay = status === 'IN_DELIVERY';
  const dispatched = status === 'DISPATCHED';

  // Walk the courier from the restaurant to the address while IN_DELIVERY.
  useEffect(() => {
    if (!onTheWay) return;
    setProgress(0);
    // Reach the address just as the IN_DELIVERY hold ends, so "Livrată" lands
    // at the same moment the pin arrives.
    const step = COURIER_TICK_MS / STEP_HOLD_MS.IN_DELIVERY;
    const id = setInterval(() => {
      setProgress((p) => Math.min(1, p + step));
    }, COURIER_TICK_MS);
    return () => clearInterval(id);
  }, [onTheWay]);

  const courierPos = useMemo(() => {
    if (dispatched) return { lat: RESTAURANT.lat - 0.0016, lng: RESTAURANT.lng + 0.0021 };
    if (!onTheWay) return null;
    return {
      lat: lerp(RESTAURANT.lat, CUSTOMER.lat, progress),
      lng: lerp(RESTAURANT.lng, CUSTOMER.lng, progress),
    };
  }, [dispatched, onTheWay, progress]);

  // Same two helpers the real panel uses, against the same target rule:
  // before pickup the courier is heading to the restaurant, after it to you.
  const eta = useMemo(() => {
    if (!courierPos) return null;
    const target = onTheWay ? CUSTOMER : RESTAURANT;
    const km = haversineKm(courierPos, target);
    return { minutes: etaMinutesFromKm(km), km };
  }, [courierPos, onTheWay]);

  // Until the persisted fulfilment is read back, server and client would
  // disagree about whether this is a five- or seven-step order.
  if (!hydrated) return <div className="min-h-[60vh]" aria-busy="true" />;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="text-center">
        <h1 className="text-lg font-bold text-zinc-900">
          {t(locale, 'track.demo_placed_title')}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{t(locale, 'track.demo_placed_body')}</p>
      </div>

      <div className="mt-7 flex flex-col gap-4">
        <OrderTimeline
          status={status}
          fulfillment={isPickup ? 'PICKUP' : 'DELIVERY'}
          createdAt={createdAt}
          updatedAt={createdAt}
          paymentStatus="PENDING"
          locale={locale}
          targetMinutes={null}
        />

        {courierPos && (
          <CourierTrackView
            locale={locale}
            courierName={COURIER.name}
            avatarUrl={COURIER.avatarUrl}
            vehicleType={COURIER.vehicleType}
            lastSeenLabel={t(locale, 'track.courier_seen_moments_ago')}
            stale={false}
            eta={eta}
            pickup={RESTAURANT}
            dropoff={CUSTOMER}
            courier={courierPos}
            // The courier order's own status, not the restaurant order's:
            // before the pickup the map draws the leg to the restaurant.
            status={onTheWay ? 'IN_TRANSIT' : 'ACCEPTED'}
            note={t(locale, 'track.demo_simulated_note')}
          />
        )}

        {isPickup && status === 'READY' && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {t(locale, 'track.demo_pickup_no_courier')}
          </p>
        )}
      </div>

      <div className="mt-9 text-center">
        <Link
          href="/demo-storefront"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-semibold text-zinc-700"
        >
          {t(locale, 'track.demo_retry')}
        </Link>
        <div className="mt-3">
          {/* 2026-08-01 — was /pricing (retired, 301s to `/`). This is someone
              who just finished the demo and said "I want this" — the right
              next step is a real conversation, not a pitch page. */}
          <Link
            href="/contact"
            className="text-xs font-semibold text-[var(--hir-brand)] underline"
          >
            {t(locale, 'track.demo_want_this')}
          </Link>
        </div>
      </div>
    </div>
  );
}
