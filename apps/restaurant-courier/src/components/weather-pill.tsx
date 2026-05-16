'use client';

import { useEffect } from 'react';
import type { WeatherData, WeatherCondition } from '@/lib/weather';

type Props = {
  weather: WeatherData | null;
  /** When non-null, shown once as a browser toast on mount. */
  reminder: string | null;
};

const CONDITION_ICON: Record<WeatherCondition, string> = {
  clear: '☀',
  cloudy: '☁',
  rain: '🌧',
  snow: '❄',
  fog: '🌫',
  storm: '⛈',
  unknown: '—',
};

/**
 * Compact weather pill rendered inside the dashboard greeting card.
 * Server-fetched data is passed in as props (no client-side fetch).
 * The safety reminder toast is shown once on mount via the Web Notifications
 * API fallback (simple alert-style banner via the browser console is skipped
 * in favour of a non-blocking DOM toast injected directly into the page body
 * so it works in standalone PWA mode without a toast library dependency).
 */
export function WeatherPill({ weather, reminder }: Props) {
  useEffect(() => {
    if (!reminder) return;
    // Only fire on first render (component mounts once per shift-start
    // because dashboard/page.tsx is force-dynamic and the layout remounts
    // after the server action revalidates /dashboard). Use sessionStorage
    // to suppress the same reminder within the same browser session.
    const key = `hir_weather_reminder_${reminder.slice(0, 20)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    // Inject a non-blocking bottom banner — no library dependency.
    const div = document.createElement('div');
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    div.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:rgba(24,24,27,0.96);color:#f4f4f5;border:1px solid rgba(139,92,246,0.4);' +
      'border-radius:12px;padding:10px 18px;font-size:13px;font-weight:500;' +
      'max-width:calc(100vw - 32px);text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.4);';
    div.textContent = reminder;
    document.body.appendChild(div);
    const t = setTimeout(() => div.remove(), 6000);
    return () => {
      clearTimeout(t);
      div.remove();
    };
  }, [reminder]);

  if (!weather) return null;

  const icon = CONDITION_ICON[weather.condition] ?? '—';
  const label = weather.condition !== 'unknown'
    ? `${weather.tempC}°C`
    : null;

  return (
    <span
      aria-label={`Vreme: ${icon} ${label ?? ''}`}
      className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400"
    >
      <span aria-hidden>{icon}</span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
