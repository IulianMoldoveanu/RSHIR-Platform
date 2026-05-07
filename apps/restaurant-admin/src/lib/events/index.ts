// Lane EVENTS-SIGNAL-INGESTION: read-side helpers for the city_events
// snapshot ingested by the `events-snapshot` Edge Function (daily 04:07).
//
// Callers:
//   - Admin dashboard tile (`events-tile.tsx`) — next 3 events for the
//     tenant's bound city.
//   - Hepy `/evenimente` intent — same shape.
//   - Marketing Agent skeleton (`marketing/events-suggest.ts`) — derives
//     promo suggestions from upcoming events.
//
// Forecasts not computed here. We expose what the table holds and let
// callers compose.

import { createAdminClient } from '@/lib/supabase/admin';

export type CityEvent = {
  id: string;
  city_id: string;
  event_name: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  venue_name: string | null;
  venue_lat: number | null;
  venue_lon: number | null;
  expected_attendance: number | null;
  url: string | null;
  source: 'eventbrite' | 'ticketmaster' | 'google_places' | 'manual';
};

const DEFAULT_HORIZON_DAYS = 14;
const MAX_LIMIT = 50;

export async function getUpcomingEvents(
  citySlug: string,
  opts: { horizonDays?: number; limit?: number } = {},
): Promise<CityEvent[]> {
  if (!citySlug) return [];
  const horizonDays = Math.max(1, Math.min(opts.horizonDays ?? DEFAULT_HORIZON_DAYS, 90));
  const limit = Math.max(1, Math.min(opts.limit ?? 5, MAX_LIMIT));

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: city, error: cityErr } = await sb
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle();
  if (cityErr || !city?.id) return [];

  const horizonIso = new Date(Date.now() + horizonDays * 86400_000).toISOString();
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from('city_events')
    .select(
      'id, city_id, event_name, event_type, start_at, end_at, venue_name, venue_lat, venue_lon, expected_attendance, url, source',
    )
    .eq('city_id', city.id)
    .gte('start_at', nowIso)
    .lte('start_at', horizonIso)
    .order('start_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[events] getUpcomingEvents failed', error.message);
    return [];
  }
  return (data ?? []) as CityEvent[];
}

// Format an event for compact UI display:
//   "Sâmb. 10 mai · 20:00 — Stadion · Concert ABBA"
export function formatEventLine(e: CityEvent): string {
  const start = new Date(e.start_at);
  const dayLabel = start.toLocaleDateString('ro-RO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = start.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const head = `${dayLabel} · ${timeLabel}`;
  const venue = e.venue_name ? ` — ${e.venue_name}` : '';
  return `${head}${venue}`;
}
