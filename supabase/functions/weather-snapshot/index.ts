// HIR — weather-snapshot Edge Function (Lane WEATHER-SIGNAL-INGESTION)
//
// Triggered every 6h by pg_cron (`weather-snapshot-fetch` job in
// 20260508_001_weather_snapshots.sql). For each active city with non-null
// lat/lon, fetches current conditions from OpenWeatherMap and persists a
// row to `public.weather_snapshots`. Used by the admin dashboard tile,
// Hepy `/vreme` intent, and weather-correlated marketing suggestions.
//
// Auth: shared secret in `X-Cron-Token` header (pg_cron supplies it from
// the `weather_cron_token` vault entry). The Authorization Bearer is
// gateway plumbing only.
//
// Required Edge Function secrets:
//   WEATHER_CRON_TOKEN          shared secret with pg_cron
// Auto-injected:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Vault-stored (read via hir_read_vault_secret):
//   openweathermap_api_key      OpenWeatherMap free-tier API key
//
// SAFE-TO-DEPLOY-EARLY: if the vault secret is absent, the function logs
// `event: weather_api_key_missing` to function_runs and returns 200 with
// `{ ok: true, skipped: 'API_KEY_MISSING' }`. The cron job records SUCCESS
// and the table simply doesn't accumulate rows — no error path. Once Iulian
// writes the secret, fetches start on the next cron tick.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withRunLog } from '../_shared/log.ts';

const OWM_BASE = 'https://api.openweathermap.org/data/2.5/weather';

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

type OwmResponse = {
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
  };
  weather?: Array<{
    id?: number;
    main?: string;
    description?: string;
  }>;
  wind?: {
    speed?: number;
  };
  rain?: { '1h'?: number };
  snow?: { '1h'?: number };
};

type FetchResult = {
  city: City;
  ok: boolean;
  error?: string;
  inserted?: boolean;
};

Deno.serve(async (req) => {
  return withRunLog('weather-snapshot', async ({ setMetadata }) => {
    if (req.method !== 'POST') {
      setMetadata({ event: 'weather_method_not_allowed' });
      return json(405, { ok: false, error: 'method_not_allowed' });
    }

    const expectedToken = Deno.env.get('WEATHER_CRON_TOKEN');
    const presented = req.headers.get('X-Cron-Token');
    if (!expectedToken || presented !== expectedToken) {
      setMetadata({ event: 'weather_unauthorized' });
      return json(401, { ok: false, error: 'unauthorized' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      setMetadata({ event: 'weather_env_missing' });
      return json(500, { ok: false, error: 'env_missing' });
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Read API key from vault. If absent, skip fetch (safe-to-deploy-early).
    const { data: apiKey, error: vaultErr } = await supabase.rpc(
      'hir_read_vault_secret',
      { secret_name: 'openweathermap_api_key' },
    );
    if (vaultErr) {
      setMetadata({ event: 'weather_vault_error', detail: vaultErr.message });
      return json(500, { ok: false, error: 'vault_read_failed' });
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      setMetadata({ event: 'weather_api_key_missing' });
      // 200 OK on purpose — cron logs SUCCESS and we wait for the operator.
      return json(200, { ok: true, skipped: 'API_KEY_MISSING' });
    }

    // Fetch all active cities with non-null lat/lon.
    const { data: cities, error: citiesErr } = await supabase
      .from('cities')
      .select('id, slug, name, lat, lon')
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lon', 'is', null);
    if (citiesErr) {
      setMetadata({ event: 'weather_cities_query_failed', detail: citiesErr.message });
      return json(500, { ok: false, error: 'cities_query_failed' });
    }
    if (!cities || cities.length === 0) {
      setMetadata({ event: 'weather_no_cities' });
      return json(200, { ok: true, snapshots: 0 });
    }

    const results: FetchResult[] = [];
    for (const city of cities as City[]) {
      try {
        const res = await fetchAndPersist(supabase, city, apiKey);
        results.push(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ city, ok: false, error: msg });
      }
    }

    const inserted = results.filter((r) => r.inserted).length;
    const failed = results.filter((r) => !r.ok).length;

    setMetadata({
      event: failed === 0 ? 'weather_snapshot_fetched' : 'weather_api_error',
      cities_total: results.length,
      inserted,
      failed,
      // Per-city breakdown is small enough (~13 entries) to embed.
      per_city: results.map((r) => ({
        slug: r.city.slug,
        ok: r.ok,
        inserted: r.inserted ?? false,
        error: r.error ?? null,
      })),
    });

    return json(200, { ok: true, inserted, failed });
  });
});

async function fetchAndPersist(
  supabase: ReturnType<typeof createClient>,
  city: City,
  apiKey: string,
): Promise<FetchResult> {
  const url = `${OWM_BASE}?lat=${city.lat}&lon=${city.lon}&appid=${encodeURIComponent(apiKey)}&units=metric&lang=ro`;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 8000);
  let payload: OwmResponse;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return {
        city,
        ok: false,
        error: `owm_http_${r.status}:${body.slice(0, 120)}`,
      };
    }
    payload = (await r.json()) as OwmResponse;
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    return { city, ok: false, error: `owm_fetch_failed:${msg.slice(0, 120)}` };
  }

  const w0 = payload.weather?.[0] ?? {};
  const precipitation =
    payload.rain?.['1h'] ??
    payload.snow?.['1h'] ??
    null;

  const row = {
    city_id: city.id,
    snapshot_at: new Date().toISOString(),
    temp_c: round2(payload.main?.temp ?? null),
    feels_like_c: round2(payload.main?.feels_like ?? null),
    weather_code: typeof w0.id === 'number' ? w0.id : null,
    weather_main: typeof w0.main === 'string' ? w0.main : null,
    weather_desc: typeof w0.description === 'string' ? w0.description : null,
    humidity_pct: clampInt(payload.main?.humidity ?? null, 0, 100),
    wind_speed_ms: round2(payload.wind?.speed ?? null),
    precipitation_1h_mm: round2(precipitation),
    raw_payload: payload,
  };

  const { error: insertErr } = await supabase
    .from('weather_snapshots')
    .insert(row);
  if (insertErr) {
    return { city, ok: false, error: `insert_failed:${insertErr.message.slice(0, 120)}` };
  }
  return { city, ok: true, inserted: true };
}

function round2(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

function clampInt(v: number | null | undefined, min: number, max: number): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < min || i > max) return null;
  return i;
}
