'use client';

import { useCallback } from 'react';
import { LocationTracker } from './location-tracker';
import { useGpsTimestamp } from '@/lib/gps-timestamp-context';

type Props = {
  enabled: boolean;
  intervalMs?: number;
  onFix: (lat: number, lng: number) => Promise<void> | void;
};

// Thin wrapper around <LocationTracker> that intercepts each GPS fix to
// record its timestamp into <GpsTimestampContext> before delegating to the
// real onFix handler (the server action). This allows <GpsStalnessPill>
// to read the last-fix time without LocationTracker needing to know about
// the context.
//
// Must be a client component because useGpsTimestamp reads a React context.
export function LocationTrackerWired({ enabled, intervalMs, onFix }: Props) {
  const { recordFix } = useGpsTimestamp();

  const wiredOnFix = useCallback(
    async (lat: number, lng: number) => {
      recordFix();
      return onFix(lat, lng);
    },
    [recordFix, onFix],
  );

  return <LocationTracker enabled={enabled} intervalMs={intervalMs} onFix={wiredOnFix} />;
}
