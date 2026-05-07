// Lane WEATHER-SIGNAL-INGESTION: read-side helpers for the weather
// snapshot ingested by the `weather-snapshot` Edge Function (every 6h).
//
// Two callers exist today:
//   - Admin dashboard tile (`weather-tile.tsx`) reads
//     `getLatestWeather(citySlug)` for a one-glance status.
//   - Hepy `/vreme` intent reads `getLatestWeather` and `getWeatherTrend`
//     for context-aware replies.
//
// We deliberately do NOT compute forecasts here — OpenWeatherMap free
// tier is current-conditions only, and for the FOISORUL A pilot the
// "current + last 24h trend" view is enough. Forecasts move to the
// future Marketing agent (Sprint 14) once it pays for /onecall.

import { createAdminClient } from '@/lib/supabase/admin';

export type WeatherSnapshot = {
  city_id: string;
  snapshot_at: string;
  temp_c: number | null;
  feels_like_c: number | null;
  weather_code: number | null;
  weather_main: string | null;
  weather_desc: string | null;
  humidity_pct: number | null;
  wind_speed_ms: number | null;
  precipitation_1h_mm: number | null;
};

// Returns the most recent snapshot for the given city slug, or null if
// no snapshot exists yet (e.g. before Iulian provisions the API key).
export async function getLatestWeather(
  citySlug: string,
): Promise<WeatherSnapshot | null> {
  if (!citySlug) return null;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: city, error: cityErr } = await sb
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle();
  if (cityErr || !city?.id) return null;

  const { data, error } = await sb
    .from('weather_snapshots')
    .select(
      'city_id, snapshot_at, temp_c, feels_like_c, weather_code, weather_main, weather_desc, humidity_pct, wind_speed_ms, precipitation_1h_mm',
    )
    .eq('city_id', city.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[weather] getLatestWeather failed', error.message);
    return null;
  }
  return (data as WeatherSnapshot | null) ?? null;
}

// Returns the snapshot trend for the last `hours` hours, ordered ascending
// (oldest first). Used by the dashboard mini-chart and Hepy 24h summaries.
// Defaults to 24h. Caps at 7 days defensively.
export async function getWeatherTrend(
  citySlug: string,
  hours = 24,
): Promise<WeatherSnapshot[]> {
  if (!citySlug) return [];
  const safeHours = Math.max(1, Math.min(hours, 7 * 24));

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: city } = await sb
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle();
  if (!city?.id) return [];

  const since = new Date(Date.now() - safeHours * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from('weather_snapshots')
    .select(
      'city_id, snapshot_at, temp_c, feels_like_c, weather_code, weather_main, weather_desc, humidity_pct, wind_speed_ms, precipitation_1h_mm',
    )
    .eq('city_id', city.id)
    .gte('snapshot_at', since)
    .order('snapshot_at', { ascending: true });
  if (error) {
    console.error('[weather] getWeatherTrend failed', error.message);
    return [];
  }
  return (data ?? []) as WeatherSnapshot[];
}

// Formats a snapshot for human-readable single-line display.
// E.g. "8.2°C, ploaie ușoară, vânt 3.1 m/s".
export function formatWeatherLine(s: WeatherSnapshot | null): string | null {
  if (!s) return null;
  const parts: string[] = [];
  if (s.temp_c !== null) parts.push(`${s.temp_c.toFixed(1)}°C`);
  if (s.weather_desc) parts.push(s.weather_desc);
  else if (s.weather_main) parts.push(s.weather_main);
  if (s.wind_speed_ms !== null) parts.push(`vânt ${s.wind_speed_ms.toFixed(1)} m/s`);
  return parts.length > 0 ? parts.join(', ') : null;
}
