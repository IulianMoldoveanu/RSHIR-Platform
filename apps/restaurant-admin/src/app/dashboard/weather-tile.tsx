// Lane WEATHER-SIGNAL-INGESTION: dashboard tile.
//
// Compact one-glance weather card for the OWNER's home screen. Reads the
// most recent `weather_snapshots` row for the tenant's bound city.
//
// Resolution:
//   1. tenant.city_id (canonical FK from Lane MULTI-CITY) → cities.slug
//   2. tenant.settings.city free-text fallback (legacy/unmigrated)
//   3. If neither resolves OR no snapshot exists yet → render nothing
//      (the tile is non-essential; we never noise up the dashboard with
//      "weather unavailable" cards).
//
// The empty-state intentionally renders `null` rather than a placeholder
// so before Iulian provisions the OpenWeatherMap key the dashboard looks
// identical to today.

import { Cloud } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestWeather, formatWeatherLine } from '@/lib/weather';
import { suggestForWeather } from '@/lib/marketing/weather-suggest';

type Props = {
  tenantId: string;
};

async function resolveTenantCitySlug(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenants')
    .select('city_id, settings, cities:city_id(slug)')
    .eq('id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  // Prefer the FK-joined city slug when present.
  const fkSlug = (data.cities as { slug?: string } | null)?.slug;
  if (fkSlug) return fkSlug;
  // Fall back to free-text settings.city normalized to a slug-ish key.
  const free = (data.settings as { city?: unknown } | null)?.city;
  if (typeof free === 'string' && free.trim()) {
    return free
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-');
  }
  return null;
}

async function resolveTenantCityName(citySlug: string): Promise<string | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data } = await sb
    .from('cities')
    .select('name')
    .eq('slug', citySlug)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export async function WeatherTile({ tenantId }: Props) {
  const citySlug = await resolveTenantCitySlug(tenantId);
  if (!citySlug) return null;

  const snapshot = await getLatestWeather(citySlug);
  if (!snapshot) return null;

  const cityName = (await resolveTenantCityName(citySlug)) ?? citySlug;
  const line = formatWeatherLine(snapshot);
  const suggestions = suggestForWeather(snapshot);
  const ts = new Date(snapshot.snapshot_at);
  const tsLabel = ts.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h2 className="text-sm font-medium text-zinc-900">
            Vremea în {cityName}
          </h2>
        </div>
        <span className="text-xs text-zinc-500">actualizat {tsLabel}</span>
      </div>

      <p className="mt-2 text-base text-zinc-800">{line ?? '—'}</p>

      {suggestions.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {suggestions.map((s, i) => (
            <li key={i} className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <span className="font-medium text-zinc-900">{s.title_ro}</span>
              <span className="block text-zinc-600">{s.rationale_ro}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
