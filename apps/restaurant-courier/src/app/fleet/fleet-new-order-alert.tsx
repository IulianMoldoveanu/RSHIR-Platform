'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

const STORAGE_KEY = 'hir.fleet.alert-on-new-order';

// Pure data-URI WAV — short ~150ms beep at 880Hz. Inlining keeps the
// component fully self-contained: no public/ asset to add, no extra
// fetch on first ping. Encoded once with `ffmpeg -f lavfi -i sine=880:0.15`
// then base64 → trimmed silence at end. Volume kept low (0.3) since this
// fires on every new-order toast.
const BEEP_DATA_URI =
  'data:audio/wav;base64,UklGRkQGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSAGAAAAAJYS+R6/JL4j2hwxECMAdvBu4kfYG9MZ08vXpd8q6frzXP1RBL4HmwfDA0n9Hva77/zqzeg262ftrPI1+SQApwY3DNoP9hCcD+oLJgYx/x/4VPL07krQ7uX76MHsAfH69Yj7VAGABuwKAQ7vDtgNLgssBzgC1Pyw9zXzmO/27NDrTutv7DTus/H+9Jr5dP/EBgkOqxOiFnsW+xKCDFkE+/oP8ovqhOXJ44Hl1Ohe7Rfz+vrCBN4PHRpAIvonfik/JtMfnRY/DGAB1vYO7TXkxNxv2C7XCNkA3vTl++/M+t0DZQp8DcQMpgi4ALL0Yedg2vbPlMo/yrXNs9PA2fDeuOH04A3eBdvL2X3ay9w43kfdtNns1IrSGdQa2LDajdcZ0NfHusEIv8q+u73XukS3dbVHt1S8osRb0aLh+vHB/jcGtgnZCkAJfgUYAVj+lP6kAOMC8gPUAlABIAEjA7QGSAt9DwwTdRZyGsYeHCKDIvIemBdRDqUEFvy886r2HfwlA7AGYwQR/Iby9eyW7gv1qP25ATf+i/be7nPpaeac5o3rHvVcANUHgAjkA8H8L/ds89vyOPWa+ED7Pf7SAtgIOA9OFKgWwxbEFlIYpRomG3sXxA0jALjz1+rW5Sjj9N9j2zPYJtsT5VTzVgGTC+APbg4WCYACSPxd9970JfPa8NTuQ+9c8gv2afgo+nz9bAJUBvkGzwS0AdL+v/0L/3IBUAIB/+H4XPNb8a3yefRA9Bfx+OvB5fzfL94O44jsovWp+x4Bwwd6DgYRwQ/3DOoIzwK6+Vbw4ulU6TvqFOiq4mHcL9eu0bbJTcPEw1XLY9SE2RDXRtAyzMrPXtQQ0nrJZ8KCwxXJYM1xy57FA8Mhx+TPxNiV3wbhEN5L3Mfeq+B73iPaOdpW39PiPN7t1f7VBOPL9JL/SQTBCisVxx7fIXQfFR5qHzMfFhwnGdAYdRgUFb0Mk//e8B7n9OLT4hHi1d7+2sjaFt+25Wzs1PCZ8aXwePHL9JT5o/zg+vP0F+607CTwAvNI7nflIuD05RH3Fwr3FhwYUg8DApn5Qfqo/AT7DPgD+e3+ywKYAccA6gbiEd0clyBSGfQNGwNu/JX52Pgg+i37mfbV6yDl1ej68/EAYwsWEWQRiAxdAyD3Q+pE3i7TWMkTwGu5lLn2wXrM4tAvz1fOptNI20zg2N+I3LbX5dPV05/bIu9+Cj4hUiw7L4gp7BobBnTwq97J0Z/JV8ULxYfHcsm5x2bDDsAWwa3Hl9DI1dvUv9Hj0gjawOOH6PrlIuOI7QAGUSF+M0c4WjC/HQAFi+t/1tHJI8aWxoXFjMUNyzDXp+aD8Ub1UvXg9Cb02PUM/Y4HoQ/HEXIO/AlOCMUInQYuAJ74m/eU/+oPyB+8KIInpx5SDjP8Lu6e4mTYMNFLz63R6dKy0vrR9c8czVTKgsdNw53AS8X41HToQfZ4+Cb0g/E59c39CwUsB7AC5fzj+rj+oQU8DUYUbBe6FkUVQRSJEeoJiP0J7yLh19eo0g3PQctNyHHJqs7l1WjcweAd5XHsQfaYAFcLbBfsITUmRyL/F8YK8/wK8MPj8Nho0Mvocg==';

/**
 * Fleet manager browser alert: plays a short beep + Notification API toast
 * when a new courier_orders row appears for this fleet. The user can
 * toggle it from the floating button — preference is persisted in
 * localStorage so it survives a refresh.
 *
 * No-op on first render: only orders that arrive AFTER the subscription
 * is established trigger an alert. We deliberately do NOT replay missed
 * orders; that's what the dispatcher's eyes are for once they're back at
 * the screen.
 */
export function FleetNewOrderAlert({ fleetId }: { fleetId: string }) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Restore preference on mount (after hydration, so SSR matches client).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'on') setEnabled(true);
    } catch {
      /* localStorage may be blocked in private mode — ignore. */
    }
  }, []);

  function persist(next: boolean) {
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      // Politely ask once on enable. Denial doesn't disable the audio path.
      Notification.requestPermission().catch(() => {});
    }
  }

  useEffect(() => {
    const supabase = getBrowserSupabase();

    function handleNewOrder(payload: { new?: { id?: string; status?: string } }) {
      if (!enabledRef.current) return;
      const status = payload.new?.status;
      // Only chime on truly fresh inbound orders — INSERTs that arrive
      // already in ACCEPTED state are the manager's own assignment echo
      // and don't need an audible toast.
      if (status !== 'CREATED' && status !== 'OFFERED') return;

      // Audio: lazy-init the element + best-effort play. Browsers block
      // sound until first user gesture; we just swallow the rejection.
      try {
        if (!audioRef.current) {
          const a = new Audio(BEEP_DATA_URI);
          a.volume = 0.3;
          audioRef.current = a;
        }
        const a = audioRef.current;
        a.currentTime = 0;
        void a.play().catch(() => {
          /* Autoplay blocked — Notification API still fires. */
        });
      } catch {
        /* ignore */
      }

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('Comandă nouă', {
            body: 'Asignează un curier din pagina Comenzi.',
            tag: `fleet-${fleetId}-new-order`,
            renotify: true,
          });
        } catch {
          /* Some browsers throw when the page is hidden; ignore. */
        }
      }
    }

    const channel = supabase
      .channel(`fleet:orders:alert:${fleetId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'courier_orders',
          filter: `fleet_id=eq.${fleetId}`,
        },
        handleNewOrder,
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fleetId]);

  return (
    <button
      type="button"
      onClick={() => persist(!enabled)}
      aria-pressed={enabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        enabled
          ? 'border-emerald-700/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
      }`}
    >
      {enabled ? (
        <Bell className="h-3 w-3" aria-hidden />
      ) : (
        <BellOff className="h-3 w-3" aria-hidden />
      )}
      {enabled ? 'Alerte pornite' : 'Alerte oprite'}
    </button>
  );
}
