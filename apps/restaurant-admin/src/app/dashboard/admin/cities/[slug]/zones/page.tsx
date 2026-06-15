// Per-city pricing_zones manager (platform admin only).
// 2026-06-15 — first iteration: read + toggle active + delete + fee edit.
// Adding new zones via UI requires the geometry picker (polygon/ring on a
// map) which is multi-day work; for now operators add new rings via the
// seed migration pattern (e.g. 20260615_003_pricing_zones_bucuresti.sql).

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { ZonesClient, type ZoneRow } from './zones-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Zone preț — pe oraș',
  robots: 'noindex,nofollow',
};

export default async function CityZonesPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/login?next=/dashboard/admin/cities/${slug}/zones`);
  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-slate-100">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Acces interzis: rezervat administratorilor de platforma HIR.
        </div>
      </main>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: city } = await admin
    .from('cities')
    .select('id, name, slug, county, is_active')
    .eq('slug', slug)
    .maybeSingle();
  if (!city) notFound();

  const { data: zones } = await admin
    .from('pricing_zones')
    .select('id, name, zone_type, max_distance_km, restaurant_fee_cents, courier_payout_cents, active, localities, geometry')
    .eq('city_id', city.id)
    .order('max_distance_km', { ascending: true });

  const fleetCount = (
    await admin
      .from('courier_fleets')
      .select('id', { count: 'exact', head: true })
      .eq('primary_city_id', city.id)
      .eq('is_active', true)
  ).count ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold">
              {city.name as string} — zone preț
            </h1>
            <p className="text-xs text-slate-500">
              {city.county ? `Județ: ${city.county as string} · ` : ''}
              Slug: {slug} · Active fleets: {fleetCount}
            </p>
          </div>
          <Link href="/dashboard/admin/cities" className="text-sm text-slate-400 hover:text-slate-200">
            ← Toate orașele
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-6">
        <ZonesClient
          cityId={city.id as string}
          citySlug={slug}
          cityName={city.name as string}
          fleetCount={fleetCount}
          zones={(zones ?? []) as ZoneRow[]}
        />
      </div>
    </main>
  );
}
