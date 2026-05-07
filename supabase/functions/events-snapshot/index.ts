// HIR — events-snapshot Edge Function (Lane EVENTS-SIGNAL-INGESTION)
//
// Triggered once daily at 04:07 UTC by pg_cron (`events-snapshot-fetch` job
// in 20260508_002_city_events.sql). For each active city with non-null
// lat/lon, queries three external sources for upcoming events and persists
// rows to `public.city_events` (composite-unique on (source, source_event_id)
// so re-runs are idempotent).
//
// Sources (each independent; missing keys are handled per-source):
//   - Eventbrite Public Events API   `eventbrite_api_token`
//   - TicketMaster Discovery API     `ticketmaster_api_key`
//   - Google Places (text search)    `google_places_api_key`
//
// Auth: shared secret in `X-Cron-Token` header (pg_cron supplies it from
// the `events_cron_token` vault entry). Authorization Bearer is gateway
// plumbing only.
//
// SAFE-TO-DEPLOY-EARLY: each source's vault key is read independently; if a
// key is absent the function logs `event: events_api_key_missing_<src>` and
// skips that source. As long as ANY source has a key the run still produces
// rows. With NO keys at all, the run is a successful no-op.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type City = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lon: number;
};

type EventRow = {
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
  source_event_id: string;
  raw_payload: unknown;
};

type SourceResult = {
  source: 'eventbrite' | 'ticketmaster' | 'google_places';
  ok: boolean;
  skipped?: 'API_KEY_MISSING';
  cities_total: number;
  inserted: number;
  upserted: number;
  failed_cities: number;
  error?: string;
};

const HORIZON_DAYS = 60;       // upstream lookahead for daily ingest
const PER_CITY_RADIUS_KM = 30; // search radius for TicketMaster + Google

Deno.serve(async (req) => {
  return withRunLog('events-snapshot', async ({ setMetadata }) => {
    if (req.method !== 'POST') {
      setMetadata({ event: 'events_method_not_allowed' });
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const expectedToken = Deno.env.get('EVENTS_CRON_TOKEN');
    const presented = req.headers.get('X-Cron-Token');
    if (!expectedToken || presented !== expectedToken) {
      setMetadata({ event: 'events_unauthorized' });
      return json(401, { ok: false, error: 'unauthorized' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      setMetadata({ event: 'events_env_missing' });
      return json(500, { ok: false, error: 'env_missing' });
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Read all three API keys from vault. Missing keys are tolerated
    // per-source — we still run the others.
    const [ebTokenRes, tmKeyRes, gpKeyRes] = await Promise.all([
      supabase.rpc('hir_read_vault_secret', { secret_name: 'eventbrite_api_token' }),
      supabase.rpc('hir_read_vault_secret', { secret_name: 'ticketmaster_api_key' }),
      supabase.rpc('hir_read_vault_secret', { secret_name: 'google_places_api_key' }),
    ]);
    const eventbriteToken = nonEmptyString(ebTokenRes.data) ? String(ebTokenRes.data) : null;
    const ticketmasterKey = nonEmptyString(tmKeyRes.data) ? String(tmKeyRes.data) : null;
    const googlePlacesKey = nonEmptyString(gpKeyRes.data) ? String(gpKeyRes.data) : null;

    const missing: string[] = [];
    if (!eventbriteToken) missing.push('API_KEY_MISSING_EVENTBRITE');
    if (!ticketmasterKey) missing.push('API_KEY_MISSING_TICKETMASTER');
    if (!googlePlacesKey) missing.push('API_KEY_MISSING_GOOGLE_PLACES');

    if (missing.length === 3) {
      setMetadata({ event: 'events_all_keys_missing', missing });
      return json(200, { ok: true, skipped: 'ALL_KEYS_MISSING' });
    }

    // Fetch active cities with coordinates (same pattern as weather).
    const { data: cities, error: citiesErr } = await supabase
      .from('cities')
      .select('id, slug, name, lat, lon')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lon', 'is', null);
    if (citiesErr) {
      setMetadata({ event: 'events_cities_query_failed', detail: citiesErr.message });
      return json(500, { ok: false, error: 'cities_query_failed' });
    }
    const cityList = (cities ?? []) as City[];
    if (cityList.length === 0) {
      setMetadata({ event: 'events_no_cities' });
      return json(200, { ok: true, snapshots: 0 });
    }

    const horizonIso = new Date(Date.now() + HORIZON_DAYS * 86400_000).toISOString();
    const nowIso = new Date().toISOString();

    const sources: SourceResult[] = [];

    if (eventbriteToken) {
      sources.push(await runEventbrite(supabase, cityList, eventbriteToken, nowIso, horizonIso));
    } else {
      sources.push({ source: 'eventbrite', ok: true, skipped: 'API_KEY_MISSING', cities_total: 0, inserted: 0, upserted: 0, failed_cities: 0 });
    }

    if (ticketmasterKey) {
      sources.push(await runTicketmaster(supabase, cityList, ticketmasterKey, nowIso, horizonIso));
    } else {
      sources.push({ source: 'ticketmaster', ok: true, skipped: 'API_KEY_MISSING', cities_total: 0, inserted: 0, upserted: 0, failed_cities: 0 });
    }

    if (googlePlacesKey) {
      sources.push(await runGooglePlaces(supabase, cityList, googlePlacesKey));
    } else {
      sources.push({ source: 'google_places', ok: true, skipped: 'API_KEY_MISSING', cities_total: 0, inserted: 0, upserted: 0, failed_cities: 0 });
    }

    const totalUpserted = sources.reduce((a, r) => a + r.upserted, 0);
    const anyError = sources.some((r) => !r.ok);

    setMetadata({
      event: anyError ? 'events_partial_error' : 'events_snapshot_fetched',
      cities_total: cityList.length,
      sources: sources.map((r) => ({
        source: r.source,
        ok: r.ok,
        skipped: r.skipped ?? null,
        upserted: r.upserted,
        failed_cities: r.failed_cities,
        error: r.error ?? null,
      })),
      missing_keys: missing,
    });

    return json(200, { ok: true, upserted: totalUpserted, sources });
  });
});

// =====================================================================
// Eventbrite — public events search by lat/lon. Free tier: 40 req/h.
// =====================================================================
async function runEventbrite(
  supabase: ReturnType<typeof createClient>,
  cities: City[],
  token: string,
  startIso: string,
  endIso: string,
): Promise<SourceResult> {
  let inserted = 0;
  let upserted = 0;
  let failed = 0;
  for (const city of cities) {
    try {
      const url = new URL('https://www.eventbriteapi.com/v3/events/search/');
      url.searchParams.set('location.latitude', String(city.lat));
      url.searchParams.set('location.longitude', String(city.lon));
      url.searchParams.set('location.within', `${PER_CITY_RADIUS_KM}km`);
      url.searchParams.set('start_date.range_start', startIso);
      url.searchParams.set('start_date.range_end', endIso);
      url.searchParams.set('expand', 'venue');

      const r = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        failed++;
        continue;
      }
      const j = await r.json() as { events?: Array<Record<string, unknown>> };
      const evs = Array.isArray(j.events) ? j.events : [];
      const rows = evs.map((e) => mapEventbrite(city, e)).filter((r): r is EventRow => r !== null);
      const u = await upsertRows(supabase, rows);
      inserted += rows.length;
      upserted += u;
    } catch {
      failed++;
    }
  }
  return { source: 'eventbrite', ok: failed < cities.length, cities_total: cities.length, inserted, upserted, failed_cities: failed };
}

function mapEventbrite(city: City, e: Record<string, unknown>): EventRow | null {
  const id = typeof e.id === 'string' ? e.id : null;
  const name = (e.name as { text?: string } | null)?.text ?? null;
  const startObj = e.start as { utc?: string } | null;
  const endObj = e.end as { utc?: string } | null;
  const venue = e.venue as Record<string, unknown> | null;
  if (!id || !name || !startObj?.utc) return null;
  const url = typeof e.url === 'string' ? e.url : null;
  const venueName = (venue?.name as string | null) ?? null;
  const lat = parseNum(venue?.latitude);
  const lon = parseNum(venue?.longitude);
  return {
    city_id: city.id,
    event_name: clip(name, 500),
    event_type: 'other',
    start_at: startObj.utc,
    end_at: endObj?.utc ?? null,
    venue_name: venueName,
    venue_lat: lat,
    venue_lon: lon,
    expected_attendance: null,
    url,
    source: 'eventbrite',
    source_event_id: id,
    raw_payload: e,
  };
}

// =====================================================================
// TicketMaster Discovery API — geo-radius + classification. 5k req/day.
// =====================================================================
async function runTicketmaster(
  supabase: ReturnType<typeof createClient>,
  cities: City[],
  apiKey: string,
  startIso: string,
  endIso: string,
): Promise<SourceResult> {
  let inserted = 0;
  let upserted = 0;
  let failed = 0;
  for (const city of cities) {
    try {
      const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('latlong', `${city.lat},${city.lon}`);
      url.searchParams.set('radius', String(PER_CITY_RADIUS_KM));
      url.searchParams.set('unit', 'km');
      url.searchParams.set('startDateTime', startIso.split('.')[0] + 'Z');
      url.searchParams.set('endDateTime', endIso.split('.')[0] + 'Z');
      url.searchParams.set('size', '50');

      const r = await fetchWithTimeout(url.toString());
      if (!r.ok) {
        failed++;
        continue;
      }
      const j = await r.json() as { _embedded?: { events?: Array<Record<string, unknown>> } };
      const evs = j._embedded?.events ?? [];
      const rows = evs.map((e) => mapTicketmaster(city, e)).filter((r): r is EventRow => r !== null);
      const u = await upsertRows(supabase, rows);
      inserted += rows.length;
      upserted += u;
    } catch {
      failed++;
    }
  }
  return { source: 'ticketmaster', ok: failed < cities.length, cities_total: cities.length, inserted, upserted, failed_cities: failed };
}

function mapTicketmaster(city: City, e: Record<string, unknown>): EventRow | null {
  const id = typeof e.id === 'string' ? e.id : null;
  const name = typeof e.name === 'string' ? e.name : null;
  if (!id || !name) return null;

  const dates = e.dates as Record<string, unknown> | null;
  const startBlock = dates?.start as Record<string, unknown> | null;
  const startUtc = typeof startBlock?.dateTime === 'string' ? startBlock.dateTime as string : null;
  if (!startUtc) return null;

  const cls = (e.classifications as Array<Record<string, unknown>> | null)?.[0];
  const segName = (cls?.segment as { name?: string } | null)?.name ?? '';
  const eventType = mapClassificationToType(segName);

  const embedded = e._embedded as Record<string, unknown> | null;
  const venues = embedded?.venues as Array<Record<string, unknown>> | null;
  const v0 = venues?.[0];
  const venueName = (v0?.name as string | null) ?? null;
  const loc = v0?.location as { latitude?: string; longitude?: string } | null;
  const url = typeof e.url === 'string' ? e.url : null;

  return {
    city_id: city.id,
    event_name: clip(name, 500),
    event_type: eventType,
    start_at: startUtc,
    end_at: null,
    venue_name: venueName,
    venue_lat: parseNum(loc?.latitude),
    venue_lon: parseNum(loc?.longitude),
    expected_attendance: null,
    url,
    source: 'ticketmaster',
    source_event_id: id,
    raw_payload: e,
  };
}

function mapClassificationToType(segment: string): string {
  const s = segment.toLowerCase();
  if (s.includes('music')) return 'concert';
  if (s.includes('sport')) return 'sport';
  if (s.includes('arts') || s.includes('theatre')) return 'theatre';
  if (s.includes('film')) return 'other';
  return 'other';
}

// =====================================================================
// Google Places (Text Search) — discovers venues with active events.
// We map results to venues with future opening hours / event keywords.
// Free $200 credit / mo (~17k Text Searches).
// =====================================================================
async function runGooglePlaces(
  supabase: ReturnType<typeof createClient>,
  cities: City[],
  apiKey: string,
): Promise<SourceResult> {
  // Google Places Text Search returns *places*, not events. We use it to
  // discover concert / festival venues whose name contains a keyword and
  // store them as type=other with start_at = now() + 1d (placeholder).
  // The richer Eventbrite + TicketMaster paths are the primary sources;
  // Google is the "long-tail discovery" sweep. The Marketing Agent picks
  // them up only when a tenant is in the same city as the venue.
  let inserted = 0;
  let upserted = 0;
  let failed = 0;
  const queries = ['festival', 'concert', 'targ'];
  for (const city of cities) {
    for (const q of queries) {
      try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
        url.searchParams.set('query', `${q} in ${city.name}`);
        url.searchParams.set('location', `${city.lat},${city.lon}`);
        url.searchParams.set('radius', String(PER_CITY_RADIUS_KM * 1000));
        url.searchParams.set('key', apiKey);

        const r = await fetchWithTimeout(url.toString());
        if (!r.ok) {
          failed++;
          continue;
        }
        const j = await r.json() as { results?: Array<Record<string, unknown>>; status?: string };
        if (j.status && j.status !== 'OK' && j.status !== 'ZERO_RESULTS') {
          failed++;
          continue;
        }
        const rows = (j.results ?? [])
          .map((p) => mapGooglePlaces(city, p, q))
          .filter((r): r is EventRow => r !== null);
        const u = await upsertRows(supabase, rows);
        inserted += rows.length;
        upserted += u;
      } catch {
        failed++;
      }
    }
  }
  return { source: 'google_places', ok: failed < cities.length, cities_total: cities.length, inserted, upserted, failed_cities: failed };
}

function mapGooglePlaces(city: City, p: Record<string, unknown>, _query: string): EventRow | null {
  const id = typeof p.place_id === 'string' ? p.place_id : null;
  const name = typeof p.name === 'string' ? p.name : null;
  if (!id || !name) return null;
  const geometry = p.geometry as { location?: { lat?: number; lng?: number } } | null;
  const loc = geometry?.location;
  // Google Places Text Search has no event time; we anchor at "tomorrow"
  // so prune still works and the row sorts after authoritative events.
  const start = new Date(Date.now() + 86400_000).toISOString();
  return {
    city_id: city.id,
    event_name: clip(name, 500),
    event_type: 'other',
    start_at: start,
    end_at: null,
    venue_name: typeof p.formatted_address === 'string' ? p.formatted_address as string : null,
    venue_lat: typeof loc?.lat === 'number' ? loc.lat : null,
    venue_lon: typeof loc?.lng === 'number' ? loc.lng : null,
    expected_attendance: null,
    url: null,
    source: 'google_places',
    source_event_id: id,
    raw_payload: p,
  };
}

// =====================================================================
// Helpers
// =====================================================================
async function upsertRows(
  supabase: ReturnType<typeof createClient>,
  rows: EventRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  // Idempotent UPSERT on the composite unique (source, source_event_id).
  // Existing rows get start/end/venue/raw_payload refreshed; created_at
  // stays. updated_at is bumped by the trigger.
  const { error, count } = await supabase
    .from('city_events')
    .upsert(rows, { onConflict: 'source,source_event_id', count: 'exact' });
  if (error) {
    console.warn('[events-snapshot] upsert error:', error.message);
    return 0;
  }
  return count ?? rows.length;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
