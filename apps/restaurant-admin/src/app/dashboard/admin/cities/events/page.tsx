// Lane EVENTS-SIGNAL-INGESTION — operator surface for the city_events feed.
//
// Lists upcoming events grouped by city + exposes manual-entry form +
// CSV bulk import. All reads via service-role admin client; all writes go
// through ./actions.ts (platform-admin gated).

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { CitiesEventsClient } from './client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type CityRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
};

export type CityEventRow = {
  id: string;
  city_id: string;
  event_name: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  venue_name: string | null;
  expected_attendance: number | null;
  url: string | null;
  source: string;
  source_event_id: string;
  created_at: string;
};

const PAGE_LIMIT = 200;

export default async function AdminCitiesEventsPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/cities/events');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  // Loose admin client cast — `cities` and `city_events` may not be in the
  // generated supabase types until gen-types runs after merge. We keep the
  // PostgREST chain typed as `any` and validate the shape at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const citiesRes = await admin
    .from('cities')
    .select('id, slug, name, is_active')
    .order('name', { ascending: true })
    .limit(50);
  const allCities = (citiesRes.data ?? []) as CityRow[];
  const cities = allCities.filter((c) => c.is_active !== false);

  // Show events from now − 1 day forward (so post-event cleanup is visible).
  const since = new Date(Date.now() - 86400_000).toISOString();
  const eventsRes = await admin
    .from('city_events')
    .select(
      'id, city_id, event_name, event_type, start_at, end_at, venue_name, expected_attendance, url, source, source_event_id, created_at',
    )
    .gte('start_at', since)
    .order('start_at', { ascending: true })
    .limit(PAGE_LIMIT);

  const events = (eventsRes.data ?? []) as CityEventRow[];

  return <CitiesEventsClient cities={cities} events={events} />;
}
