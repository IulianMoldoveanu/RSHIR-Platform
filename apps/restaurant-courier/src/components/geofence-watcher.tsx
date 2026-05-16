'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@hir/ui';
import { useGpsTimestamp } from '@/lib/gps-timestamp-context';
import {
  GeofenceEvaluator,
  type GeofenceCoords,
  type GeofenceAlertType,
  markFired,
  wasRecentlyFired,
  haversineMeters,
} from '@/lib/geofence';
import * as haptics from '@/lib/haptics';
import { isVoiceNavEnabled, speak } from '@/lib/voice-nav';
import { logGeofenceAlertAction } from '@/app/dashboard/actions';

type Props = {
  orderId: string;
  pickup: GeofenceCoords;
  dropoff: GeofenceCoords;
  /** Current order status passed from the server-rendered page. */
  status: string;
};

const ALERT_MESSAGES: Record<GeofenceAlertType, string> = {
  NEAR_PICKUP: 'Aproape de restaurant. Pregateste-te pentru ridicare.',
  NEAR_DROPOFF: 'Ai ajuns. Marcheaza livrarea dupa predare.',
  LEFT_PICKUP_WITHOUT_MARK: 'Ai uitat sa marchezi ridicarea?',
};

/**
 * Invisible client component that fires toast + haptic alerts based on
 * the courier's proximity to pickup and dropoff zones.
 *
 * Taps into <GpsTimestampContext> (set by <LocationTrackerWired>) to detect
 * new GPS fixes without duplicating the watchPosition setup. On each new
 * fix timestamp, re-queries getCurrentPosition at low-accuracy (fast) to
 * get the actual coordinates and runs the geofence evaluator.
 *
 * Renders null — purely side-effect driven. Place inside the order detail
 * page so it unmounts when the courier leaves the page.
 */
export function GeofenceWatcher({ orderId, pickup, dropoff, status }: Props) {
  const { lastFixAt } = useGpsTimestamp();
  const evaluatorRef = useRef<GeofenceEvaluator | null>(null);
  const statusRef = useRef(status);

  // Keep statusRef fresh without recreating the evaluator (which would drop
  // dwell-state). The status prop changes when OrderDetailRealtime triggers
  // router.refresh() after a status transition.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Create a single evaluator per order that persists dwell-state across fixes.
  // Adding pickup/dropoff to deps would recreate the evaluator on every parent
  // re-render (objects are not ref-stable from server-rendered props), dropping
  // dwell-state mid-shift. Pickup/dropoff are stable for a given orderId, so
  // keying the effect on orderId alone is correct.
  useEffect(() => {
    evaluatorRef.current = new GeofenceEvaluator(pickup, dropoff);
    // The eslint-disable HAS to be on the deps line (not above the hook) for
    // react-hooks/exhaustive-deps to honor it — the rule reports against the
    // dep array's location, not the hook call site.
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-evaluate whenever a new GPS fix is recorded in the context.
  useEffect(() => {
    if (!lastFixAt) return;
    if (!evaluatorRef.current) return;

    const currentStatus = statusRef.current;
    // Only active for own ACCEPTED or PICKED_UP orders.
    if (currentStatus !== 'ACCEPTED' && currentStatus !== 'PICKED_UP') return;

    // getCurrentPosition at relaxed accuracy — we just need a fresh lat/lng
    // to evaluate zone entry. The high-accuracy watchPosition in
    // LocationTracker is the authoritative fix for server-side updates;
    // this second call is lightweight and fast (maximumAge allows a cache).
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const evaluator = evaluatorRef.current;
        if (!evaluator) return;

        const alert = evaluator.evaluate(lat, lng, statusRef.current);
        if (!alert) return;
        if (wasRecentlyFired(orderId, alert)) return;

        markFired(orderId, alert);

        // Double-pulse haptic: attention without emergency.
        haptics.warning();

        const message = ALERT_MESSAGES[alert];
        if (alert === 'LEFT_PICKUP_WITHOUT_MARK') {
          toast(message, { duration: 6_000 });
        } else {
          toast.success(message, { duration: 5_000 });
        }

        // Hands-free voice prompt when opt-in. Same RO message as the toast.
        if (isVoiceNavEnabled()) speak(message);

        // Distance from courier to the relevant zone centre for audit.
        const target = alert === 'NEAR_DROPOFF' ? dropoff : pickup;
        const distM = haversineMeters(lat, lng, target.lat, target.lng);
        void logGeofenceAlertAction(orderId, alert, distM);
      },
      () => {
        // GPS lookup failed — skip silently, retry on next fix.
      },
      { enableHighAccuracy: false, maximumAge: 8_000, timeout: 3_000 },
    );
  }, [lastFixAt, orderId, pickup, dropoff]);

  return null;
}
