// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /fleet/jobs — fleet manager dashboard for their job listings.
//
// What the manager sees:
//   • "Postare nouă" CTA → /fleet/jobs/new
//   • Table of own listings (any status — RLS policy `fleet_reads_own_listings`)
//     with active-application count badges
//   • Per row: open/pause/close quick-actions (transitions OPEN<->PAUSED<->CLOSED;
//     EXPIRED is cron-set and not user-toggleable)
//   • Click row → /fleet/jobs/[id]/applications (kanban)

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Plus, ArrowRight, MapPin, Users } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { JobStatusBadge } from '@/app/_components';
import { isJobBoardEnabled } from '@/lib/feature-flags';
import { updateJobListingStatusAction } from './actions';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  city_id: string | null;
  position_title: string;
  employment_type: 'PFA' | 'salariat' | 'contractor';
  status: 'OPEN' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
  created_at: string;
  expires_at: string | null;
};

type CityRow = { id: string; name: string };
type AppCountRow = { job_listing_id: string; status: string };

const EMPLOYMENT_LABEL: Record<ListingRow['employment_type'], string> = {
  PFA: 'PFA',
  salariat: 'Salariat',
  contractor: 'Contractor',
};

async function statusTransitionAction(formData: FormData): Promise<void> {
  'use server';
  const id = (formData.get('listing_id') as string | null)?.trim() ?? '';
  const status = (formData.get('next_status') as string | null)?.trim() ?? '';
  const result = await updateJobListingStatusAction(id, status);
  if (!result.ok) {
    redirect(`/fleet/jobs?error=${encodeURIComponent(result.error)}`);
  }
  redirect('/fleet/jobs');
}

export default async function FleetJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isJobBoardEnabled()) notFound();

  const fleet = await requireFleetManager();
  const { error: errorParam } = await searchParams;

  const admin = createAdminClientUntyped();
  const { data: listingsData } = await admin
    .from('courier_job_listings')
    .select('id, city_id, position_title, employment_type, status, created_at, expires_at')
    .eq('fleet_id', fleet.fleetId)
    .order('created_at', { ascending: false })
    .limit(100);

  const listings = (listingsData ?? []) as ListingRow[];

  // City names + application counts in parallel.
  const cityIds = [...new Set(listings.map((l) => l.city_id).filter(Boolean))] as string[];
  const listingIds = listings.map((l) => l.id);

  const [{ data: citiesData }, { data: appsData }] = await Promise.all([
    cityIds.length > 0
      ? admin.from('cities').select('id, name').in('id', cityIds)
      : Promise.resolve({ data: [] }),
    listingIds.length > 0
      ? admin
          .from('courier_job_applications')
          .select('job_listing_id, status')
          .in('job_listing_id', listingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const cityById = new Map(((citiesData ?? []) as CityRow[]).map((c) => [c.id, c]));
  const apps = (appsData ?? []) as AppCountRow[];

  // Counts per listing — "active" = PENDING + REVIEWING + INTERVIEWED.
  const countsByListing = new Map<string, { total: number; active: number }>();
  for (const a of apps) {
    const row = countsByListing.get(a.job_listing_id) ?? { total: 0, active: 0 };
    row.total += 1;
    if (['PENDING', 'REVIEWING', 'INTERVIEWED'].includes(a.status)) row.active += 1;
    countsByListing.set(a.job_listing_id, row);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-hir-fg">Joburi flotă</h1>
          <p className="mt-0.5 text-sm text-hir-muted-fg">
            Postează posturi deschise, vezi curierii care aplică.
          </p>
        </div>
        <Link
          href="/fleet/jobs/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Postare nouă
        </Link>
      </div>

      {errorParam ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {errorParam}
        </div>
      ) : null}

      {/* Listings list */}
      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hir-border bg-hir-surface px-4 py-8 text-center text-sm text-hir-muted-fg">
          Nu ai joburi postate. Începe cu o postare nouă.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((l) => {
            const city = l.city_id ? cityById.get(l.city_id) : null;
            const counts = countsByListing.get(l.id) ?? { total: 0, active: 0 };
            return (
              <li
                key={l.id}
                className="rounded-2xl border border-hir-border bg-hir-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/fleet/jobs/${l.id}/applications`}
                    className="min-w-0 flex-1 hover:text-violet-200"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-hir-fg">
                        {l.position_title}
                      </p>
                      <JobStatusBadge status={l.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-hir-muted-fg">
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 font-medium text-violet-300">
                        {EMPLOYMENT_LABEL[l.employment_type]}
                      </span>
                      {city ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5">
                          <MapPin className="h-3 w-3" aria-hidden />
                          {city.name}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5">
                        <Users className="h-3 w-3" aria-hidden />
                        {counts.active} active / {counts.total} total
                      </span>
                    </div>
                  </Link>
                  <Link
                    href={`/fleet/jobs/${l.id}/applications`}
                    className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/25"
                  >
                    Aplicații
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>

                {/* Quick status toggles. EXPIRED is read-only (cron-set) so
                    we hide the toggle row when the listing is expired. */}
                {l.status !== 'EXPIRED' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hir-border pt-3">
                    {l.status === 'OPEN' ? (
                      <form action={statusTransitionAction}>
                        <input type="hidden" name="listing_id" value={l.id} />
                        <input type="hidden" name="next_status" value="PAUSED" />
                        <button
                          type="submit"
                          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
                        >
                          Pune pe pauză
                        </button>
                      </form>
                    ) : null}
                    {l.status === 'PAUSED' ? (
                      <form action={statusTransitionAction}>
                        <input type="hidden" name="listing_id" value={l.id} />
                        <input type="hidden" name="next_status" value="OPEN" />
                        <button
                          type="submit"
                          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
                        >
                          Redeschide
                        </button>
                      </form>
                    ) : null}
                    {l.status !== 'CLOSED' ? (
                      <form action={statusTransitionAction}>
                        <input type="hidden" name="listing_id" value={l.id} />
                        <input type="hidden" name="next_status" value="CLOSED" />
                        <button
                          type="submit"
                          className="rounded-md border border-hir-border bg-hir-bg px-2 py-1 text-[11px] font-medium text-hir-muted-fg hover:text-rose-200 hover:border-rose-500/40"
                        >
                          Închide definitiv
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] leading-relaxed text-hir-muted-fg">
        HIR găzduiește anunțurile. Tu, ca flotă, decizi cu cine semnezi contractul
        și cum îl plătești pe curier.
      </p>
    </div>
  );
}
