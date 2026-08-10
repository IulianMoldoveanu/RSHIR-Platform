// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /jobs — courier-facing board: browse OPEN courier_job_listings filtered
// by city + employment_type. One row per listing → tap → /jobs/[id] detail.
//
// Per Layer 1 firewall (HIR4You + Dir UE 2024/2831): HIR hosts the listing
// only — the fleet contracts + pays the courier. We surface that boundary
// to the courier with a foot-note on each card.
//
// Auth: any logged-in user can read OPEN listings (policy
// `courier_reads_open_listings`). No fleet-context needed on this page.
//
// Filters are query-string driven (`?city=<uuid>&type=PFA|salariat|contractor`)
// so the courier can share a deep link and bookmarks survive.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Briefcase, ArrowRight, Banknote, ShieldAlert } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { JobStatusBadge } from '@/app/_components';
import { isJobBoardEnabled } from '@/lib/feature-flags';
import { PageHeader, Card, EmptyMarketplaceState, buttonClass } from '@/app/_marketplace-ui';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  fleet_id: string;
  city_id: string | null;
  position_title: string;
  description: string;
  employment_type: 'PFA' | 'salariat' | 'contractor';
  salary_range_min_ron: number | null;
  salary_range_max_ron: number | null;
  shift_pattern: string | null;
  vehicle_required: string | null;
  status: 'OPEN' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
  created_at: string;
  expires_at: string | null;
};

type CityRow = { id: string; name: string; county: string | null };
type FleetRow = { id: string; name: string; slug: string };

const EMPLOYMENT_LABEL: Record<ListingRow['employment_type'], string> = {
  PFA: 'PFA',
  salariat: 'Salariat',
  contractor: 'Contractor',
};

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} RON`;
  if (min != null) return `de la ${min} RON`;
  if (max != null) return `până la ${max} RON`;
  return null;
}

export default async function CourierJobBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; type?: string }>;
}) {
  if (!isJobBoardEnabled()) notFound();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const params = await searchParams;
  const cityFilter = (params.city ?? '').trim();
  const typeFilter = (params.type ?? '').trim();

  const admin = createAdminClientUntyped();

  // Listings query — OPEN only (RLS would scope this too, but we filter
  // server-side as well so PAUSED/CLOSED/EXPIRED never leak even with a
  // misconfigured RLS in the future).
  let listingsQuery = admin
    .from('courier_job_listings')
    .select(
      'id, fleet_id, city_id, position_title, description, employment_type, salary_range_min_ron, salary_range_max_ron, shift_pattern, vehicle_required, status, created_at, expires_at',
    )
    .eq('status', 'OPEN');
  if (cityFilter) listingsQuery = listingsQuery.eq('city_id', cityFilter);
  if (typeFilter && ['PFA', 'salariat', 'contractor'].includes(typeFilter)) {
    listingsQuery = listingsQuery.eq('employment_type', typeFilter);
  }

  // Fan-out: listings + cities for filter dropdown + my-applications to
  // show "Aplicat" badge instead of "Aplică" CTA.
  const [{ data: listingsData }, { data: citiesData }, { data: myApplicationsData }] =
    await Promise.all([
      listingsQuery.order('created_at', { ascending: false }).limit(100),
      admin.from('cities').select('id, name, county').order('name', { ascending: true }),
      admin
        .from('courier_job_applications')
        .select('job_listing_id, status')
        .eq('courier_user_id', user.id),
    ]);

  const listings = (listingsData ?? []) as ListingRow[];
  const cities = (citiesData ?? []) as CityRow[];
  const myApplications = (myApplicationsData ?? []) as Array<{
    job_listing_id: string;
    status: string;
  }>;
  const myAppByListing = new Map(myApplications.map((a) => [a.job_listing_id, a.status]));

  // Hydrate fleet names — small enough to fetch in a single IN clause.
  const fleetIds = [...new Set(listings.map((l) => l.fleet_id))];
  let fleetById = new Map<string, FleetRow>();
  if (fleetIds.length > 0) {
    const { data: fleetsData } = await admin
      .from('courier_fleets')
      .select('id, name, slug')
      .in('id', fleetIds);
    fleetById = new Map(((fleetsData ?? []) as FleetRow[]).map((f) => [f.id, f]));
  }

  const cityById = new Map(cities.map((c) => [c.id, c]));

  // Active applications count for the "x / 5 active" badge (rate limit lives
  // in the DB trigger, but the UI surfaces the cap so the courier doesn't
  // hit the wall blind).
  const activeAppCount = myApplications.filter((a) =>
    ['PENDING', 'REVIEWING', 'INTERVIEWED'].includes(a.status),
  ).length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-24 pt-6">
      <PageHeader
        variant="hero"
        eyebrow="HIR · JOBURI CURIER"
        title="Joburi curier"
        description="Flotele caută curieri. HIR găzduiește anunțul — angajatorul tău rămâne flota."
      />

      {/* Active-applications counter */}
      <div className="flex items-center gap-2 rounded-xl border border-hir-border bg-hir-surface px-3 py-2 text-xs text-hir-muted-fg">
        <Briefcase className="h-3.5 w-3.5 text-violet-300" aria-hidden />
        Aplicări active: <span className="font-semibold tabular-nums text-hir-fg">{activeAppCount}</span> / 5
        {activeAppCount >= 5 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-amber-300">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            Limită atinsă
          </span>
        ) : null}
      </div>

      {/* Filter form — GET so the URL carries the state and the manager can
          share a link with the city already selected. */}
      <form
        action="/jobs"
        method="get"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-hir-border bg-hir-surface p-3 sm:grid-cols-3"
      >
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-hir-muted-fg">
          Oraș
          <select
            name="city"
            defaultValue={cityFilter}
            className="rounded-lg border border-hir-border bg-hir-bg px-2 py-1.5 text-sm text-hir-fg"
          >
            <option value="">Toate</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.county ? `, ${c.county}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-hir-muted-fg">
          Tip contract
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-hir-border bg-hir-bg px-2 py-1.5 text-sm text-hir-fg"
          >
            <option value="">Toate</option>
            <option value="PFA">PFA</option>
            <option value="salariat">Salariat</option>
            <option value="contractor">Contractor</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonClass('primary', 'sm', 'flex-1')}>
            Filtrează
          </button>
          {cityFilter || typeFilter ? (
            <Link href="/jobs" className={buttonClass('secondary', 'sm')}>
              Reset
            </Link>
          ) : null}
        </div>
      </form>

      {/* Listing rows */}
      {listings.length === 0 ? (
        <EmptyMarketplaceState
          title="Niciun job deschis."
          description="Nu sunt joburi deschise care să corespundă filtrelor."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((l) => {
            const city = l.city_id ? cityById.get(l.city_id) : null;
            const fleet = fleetById.get(l.fleet_id);
            const myStatus = myAppByListing.get(l.id);
            const salary = formatSalary(l.salary_range_min_ron, l.salary_range_max_ron);
            return (
              <Card key={l.id} as="li" accent interactive href={`/jobs/${l.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-hir-fg">
                      {l.position_title}
                    </p>
                    {fleet ? (
                      <p className="mt-0.5 truncate text-xs text-hir-muted-fg">
                        {fleet.name}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-hir-muted-fg">
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
                        <Briefcase className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                        {EMPLOYMENT_LABEL[l.employment_type]}
                      </span>
                      {city ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 ring-1 ring-inset ring-hir-border">
                          <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                          {city.name}
                        </span>
                      ) : null}
                      {salary ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 tabular-nums ring-1 ring-inset ring-hir-border">
                          <Banknote className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                          {salary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {myStatus ? (
                    <JobStatusBadge
                      status={
                        myStatus as
                          | 'PENDING'
                          | 'REVIEWING'
                          | 'INTERVIEWED'
                          | 'HIRED'
                          | 'REJECTED'
                          | 'WITHDRAWN'
                      }
                    />
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200 ring-1 ring-inset ring-violet-500/30">
                      Aplică
                      <ArrowRight className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] leading-relaxed text-hir-muted-fg">
        HIR găzduiește anunțurile dar nu este angajatorul. Contractul, salariul și
        condițiile de muncă sunt între tine și flota care publică jobul.
      </p>
    </div>
  );
}
