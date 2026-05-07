// Lane EVENTS-SIGNAL-INGESTION: dashboard tile.
//
// Compact "next 3 events" card for the OWNER's home screen. Reads
// `city_events` for the tenant's bound city and renders 0-3 upcoming
// events plus 0-3 marketing suggestions derived from them.
//
// Resolution mirrors WeatherTile:
//   1. tenant.city_id (canonical FK from Lane MULTI-CITY) → cities.slug
//   2. tenant.settings.city free-text fallback (legacy/unmigrated)
//   3. If neither resolves OR no upcoming events → render nothing.
//
// We render `null` rather than a placeholder before any source key is
// provisioned, so the dashboard stays unchanged pre-API-keys.

import { CalendarDays } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUpcomingEvents, formatEventLine, type CityEvent } from '@/lib/events';
import { suggestForEvents } from '@/lib/marketing/events-suggest';

type Props = {
  tenantId: string;
};

async function resolveTenantCitySlug(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Same anti-footgun as weather-tile.tsx — two cheap queries instead of
  // a PostgREST `cities:city_id(slug)` embed alias that would silently
  // fail relation auto-detection.
  const { data: trow, error: trowErr } = await sb
    .from('tenants')
    .select('city_id, settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (trowErr || !trow) return null;

  if (trow.city_id) {
    const { data: city } = await sb
      .from('cities')
      .select('slug')
      .eq('id', trow.city_id)
      .maybeSingle();
    if (city?.slug) return city.slug as string;
  }

  const free = (trow.settings as { city?: unknown } | null)?.city;
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

export async function EventsTile({ tenantId }: Props) {
  const citySlug = await resolveTenantCitySlug(tenantId);
  if (!citySlug) return null;

  const events: CityEvent[] = await getUpcomingEvents(citySlug, { horizonDays: 14, limit: 3 });
  if (events.length === 0) return null;

  const cityName = (await resolveTenantCityName(citySlug)) ?? citySlug;
  const suggestions = suggestForEvents(events);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h2 className="text-sm font-medium text-zinc-900">
            Evenimente în {cityName}
          </h2>
        </div>
        <span className="text-xs text-zinc-500">{events.length} apropiate</span>
      </div>

      <ul className="mt-2 space-y-1.5">
        {events.map((e) => (
          <li key={e.id} className="text-sm text-zinc-800">
            <span className="block font-medium">{e.event_name}</span>
            <span className="block text-xs text-zinc-600">{formatEventLine(e)}</span>
          </li>
        ))}
      </ul>

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
