'use client';

import { useEffect } from 'react';
import type { WeatherData, WeatherCondition } from '@/lib/weather';
import { Sun, Cloud, CloudRain, CloudSnow, CloudFog, CloudLightning } from 'lucide-react';

type Props = {
  weather: WeatherData | null;
  /** When non-null, shown once as a browser toast on mount. */
  reminder: string | null;
};

// Lucide vector icons (not emoji): emoji glyphs render as a blank white box
// (tofu) in some Android WebViews — the source of the "weather shows white"
// complaint. Vector icons inherit the tone colour and render consistently.
const CONDITION_ICON: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  fog: CloudFog,
  storm: CloudLightning,
  unknown: Cloud,
};

/**
 * Compact weather pill rendered inside the dashboard greeting card.
 * Server-fetched data is passed in as props (no client-side fetch).
 * The safety reminder toast is shown once on mount via a non-blocking DOM
 * toast injected directly into the page body so it works in standalone PWA
 * mode without a toast library dependency.
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

  const Icon = CONDITION_ICON[weather.condition] ?? Cloud;
  const label = weather.condition !== 'unknown' ? `${weather.tempC}°C` : null;

  // Tone tinting per condition so the pill carries a hint of the weather
  // mood (sunny=amber, rain/snow/fog=sky, storm=rose, cloudy=neutral). The
  // -200 shades meet AA contrast on the /10 tinted bg used across the chips.
  const tone =
    weather.condition === 'clear'
      ? { text: 'text-amber-200', ring: 'ring-amber-500/20' }
      : weather.condition === 'storm'
        ? { text: 'text-rose-200', ring: 'ring-rose-500/20' }
        : weather.condition === 'rain' ||
            weather.condition === 'snow' ||
            weather.condition === 'fog'
          ? { text: 'text-sky-200', ring: 'ring-sky-500/20' }
          : { text: 'text-hir-fg', ring: 'ring-hir-border/60' };

  return (
    <span
      aria-label={`Vreme: ${label ?? 'indisponibilă'}`}
      className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-hir-surface/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${tone.text} ${tone.ring}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.25} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
