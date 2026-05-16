'use client';

import { useEffect, useRef } from 'react';
import { isVoiceNavEnabled, speak } from '@/lib/voice-nav';

type Props = {
  status: string;
};

/**
 * Speaks a short RO phrase whenever the order status crosses a meaningful
 * transition (CREATED/OFFERED → ACCEPTED → PICKED_UP → DELIVERED/FAILED).
 *
 * Renders null. Mounted on the order detail page; unmounts when the courier
 * leaves the page, so no stale TTS plays in the background.
 *
 * Companion to <GeofenceWatcher>: that one fires on location events, this
 * one fires on state transitions. Both gated on `isVoiceNavEnabled()`.
 */
const TRANSITION_PHRASES: Record<string, string> = {
  ACCEPTED: 'Comandă acceptată. Pornește către punctul de preluare.',
  PICKED_UP: 'Comandă ridicată. Pornește către client.',
  DELIVERED: 'Livrare finalizată. Mulțumim!',
  FAILED: 'Livrare marcată eșuată.',
  CANCELLED: 'Comandă anulată.',
};

export function VoiceStatusAnnouncer({ status }: Props) {
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    // First mount: just snapshot, don't announce (avoids speaking on page reload).
    if (prev === null) {
      prevRef.current = status;
      return;
    }
    if (prev === status) return;
    prevRef.current = status;

    if (!isVoiceNavEnabled()) return;
    const phrase = TRANSITION_PHRASES[status];
    if (phrase) speak(phrase);
  }, [status]);

  return null;
}
