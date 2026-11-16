'use client';

import dynamic from 'next/dynamic';
import { Bike, Clock, MapPin } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

const CourierMap = dynamic(() => import('./courier-map').then((m) => m.CourierMap), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-md bg-zinc-100" />,
});

type MaybeLatLng = { lat: number | null; lng: number | null };
type LatLng = { lat: number; lng: number };

export type CourierTrackViewProps = {
  locale: Locale;
  /** First name only — this is what the customer is shown. */
  courierName: string;
  avatarUrl: string | null;
  /** courier_profiles.vehicle_type, uppercase ('BIKE' | 'SCOOTER' | 'CAR'). */
  vehicleType: string | null;
  /** "acum 12s" style freshness line. Null hides it. */
  lastSeenLabel: string | null;
  /** Position too old to trust — swaps the freshness line for a soft notice
   *  and (via a null `courier`) can drop the pin entirely. */
  stale: boolean;
  eta: { minutes: number; km: number } | null;
  pickup: MaybeLatLng;
  dropoff: MaybeLatLng;
  courier: LatLng | null;
  /** courier_orders.status — the map uses it to decide which leg to draw. */
  status: string;
  /** Small caption under the map. The marketing demo uses it to say the data
   *  is simulated; a real order passes nothing. */
  note?: string;
};

// The customer-facing "your courier is on the way" panel: avatar, name, live
// position freshness, ETA pill, OpenStreetMap map with the courier pin and the
// remaining leg drawn to the target.
//
// Presentational only, extracted 2026-08-03 from `app/track/[token]/
// CourierTrackPanel.tsx`, which keeps all of the data work — the polled
// `/api/courier-track/[ctoken]` fetch, the Supabase realtime subscription, the
// staleness thresholds and the haversine ETA.
//
// It was extracted so the marketing demo can render *this* panel rather than a
// picture of it. Iulian, 2026-08-03: "chiar totul trebuie sa coincida cu
// aplicatia reala ... vreau sa te asiguri ca ceea ce apare in demo este
// conform cu ceea ce au tenantii si viceversa". A mock would have started
// drifting the first time this panel changed; the category tiles had already
// done exactly that once.
export function CourierTrackView({
  locale,
  courierName,
  avatarUrl,
  vehicleType,
  lastSeenLabel,
  stale,
  eta,
  pickup,
  dropoff,
  courier,
  status,
  note,
}: CourierTrackViewProps) {
  const isAfterPickup = status === 'PICKED_UP' || status === 'IN_TRANSIT';
  return (
    <section className="overflow-hidden rounded-xl border border-purple-200 bg-purple-50/40 text-left">
      <header className="flex items-baseline justify-between gap-3 border-b border-purple-200/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-purple-200"
              width={36}
              height={36}
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
              <Bike className="h-5 w-5" aria-hidden />
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {t(locale, 'track.courier_on_the_way_template', { name: courierName })}
            </p>
            {stale ? (
              <p className="text-[11px] text-amber-600">
                {t(locale, 'track.courier_position_updating')}
              </p>
            ) : (
              lastSeenLabel && (
                <p className="text-[11px] text-zinc-500">
                  {t(locale, 'track.courier_last_seen_template', { when: lastSeenLabel })}
                </p>
              )
            )}
          </div>
        </div>
        {eta && (
          <div className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-purple-800 shadow-sm">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span>~{eta.minutes} min</span>
          </div>
        )}
      </header>

      <CourierMap
        pickup={pickup}
        dropoff={dropoff}
        courier={courier}
        status={status}
        vehicleType={vehicleType}
      />

      {eta && (
        <p className="px-4 py-2 text-xs text-purple-900/80">
          <MapPin className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
          {eta.km < 1
            ? t(locale, 'track.courier_distance_near')
            : t(
                locale,
                isAfterPickup
                  ? 'track.courier_distance_to_you_template'
                  : 'track.courier_distance_to_restaurant_template',
                { km: eta.km.toFixed(1) },
              )}
        </p>
      )}

      {note && (
        <p className="border-t border-purple-200/60 px-4 py-2 text-[11px] text-purple-900/60">
          {note}
        </p>
      )}
    </section>
  );
}
