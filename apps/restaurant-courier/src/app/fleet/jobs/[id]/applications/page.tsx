// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /fleet/jobs/[id]/applications — kanban-style review of applicants.
//
// Five visible columns (per task spec): PENDING REVIEWING INTERVIEWED HIRED
// REJECTED. WITHDRAWN is filtered out by default (courier-side terminal) but
// still surfaced under a small "Retrase" sub-list at the bottom so the fleet
// can see who pulled out.
//
// Transitions allowed (matches RLS `fleet_updates_applications_on_own_listings`):
//   PENDING   → REVIEWING / REJECTED
//   REVIEWING → INTERVIEWED / REJECTED
//   INTERVIEWED → HIRED / REJECTED
// HIRED + REJECTED are terminal; no further transitions surfaced.
//
// Each card is a server-rendered form submitting to `updateApplicationStatusAction`.
// Mobile-first: on narrow screens columns stack vertically with sticky headers.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, User } from 'lucide-react';
import { requireFleetManager } from '@/lib/fleet-manager';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import {
  APPLICATION_KANBAN_ORDER,
  JobStatusBadge,
  type CourierJobApplicationStatus,
} from '@/app/_components';
import { isJobBoardEnabled } from '@/lib/feature-flags';
import { PageHeader, Card } from '@/app/_marketplace-ui';
import { updateApplicationStatusAction } from '../../actions';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  position_title: string;
  status: 'OPEN' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
};

type ApplicationRow = {
  id: string;
  courier_user_id: string;
  status: CourierJobApplicationStatus;
  message: string | null;
  cv_doc_url: string | null;
  applied_at: string;
  reviewed_at: string | null;
};

type CourierProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

// Mapping of which transitions a card in column X shows. Mirrors the RLS
// WITH CHECK clause.
const ALLOWED_NEXT: Record<CourierJobApplicationStatus, CourierJobApplicationStatus[]> = {
  PENDING: ['REVIEWING', 'REJECTED'],
  REVIEWING: ['INTERVIEWED', 'REJECTED'],
  INTERVIEWED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

// Display order of column headers — matches the spec.
const COLUMN_LABEL: Record<CourierJobApplicationStatus, string> = {
  PENDING: 'În așteptare',
  REVIEWING: 'În analiză',
  INTERVIEWED: 'Interviu',
  HIRED: 'Angajat',
  REJECTED: 'Respins',
  WITHDRAWN: 'Retras',
};

const TRANSITION_TONE: Record<CourierJobApplicationStatus, string> = {
  PENDING: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-200 hover:bg-zinc-500/20',
  REVIEWING: 'border-blue-500/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20',
  INTERVIEWED:
    'border-purple-500/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20',
  HIRED:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
  REJECTED: 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  WITHDRAWN: 'border-hir-border bg-hir-surface text-hir-muted-fg',
};

async function transitionFormAction(formData: FormData): Promise<void> {
  'use server';
  const id = (formData.get('application_id') as string | null)?.trim() ?? '';
  const status = (formData.get('next_status') as string | null)?.trim() ?? '';
  const listingId = (formData.get('listing_id') as string | null)?.trim() ?? '';
  const result = await updateApplicationStatusAction(id, status);
  if (!result.ok) {
    redirect(
      `/fleet/jobs/${listingId}/applications?error=${encodeURIComponent(result.error)}`,
    );
  }
  redirect(`/fleet/jobs/${listingId}/applications`);
}

export default async function FleetJobApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isJobBoardEnabled()) notFound();

  const fleet = await requireFleetManager();
  const { id } = await params;
  const { error: errorParam } = await searchParams;

  const admin = createAdminClientUntyped();

  // Verify the listing belongs to this fleet — surface a friendly 404 if
  // the manager tries to peek at someone else's. RLS would also block, but
  // the explicit check gives a cleaner error.
  const { data: listingRow } = await admin
    .from('courier_job_listings')
    .select('id, position_title, status')
    .eq('id', id)
    .eq('fleet_id', fleet.fleetId)
    .maybeSingle();
  const listing = listingRow as ListingRow | null;
  if (!listing) notFound();

  const { data: appsData } = await admin
    .from('courier_job_applications')
    .select('id, courier_user_id, status, message, cv_doc_url, applied_at, reviewed_at')
    .eq('job_listing_id', listing.id)
    .order('applied_at', { ascending: false })
    .limit(500);
  const apps = (appsData ?? []) as ApplicationRow[];

  // Hydrate courier names + avatars.
  const courierIds = [...new Set(apps.map((a) => a.courier_user_id))];
  let profileById = new Map<string, CourierProfileRow>();
  if (courierIds.length > 0) {
    const { data: profsData } = await admin
      .from('courier_profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', courierIds);
    profileById = new Map(
      ((profsData ?? []) as CourierProfileRow[]).map((p) => [p.user_id, p]),
    );
  }

  const groupedActive = new Map<CourierJobApplicationStatus, ApplicationRow[]>();
  for (const s of APPLICATION_KANBAN_ORDER) groupedActive.set(s, []);
  const withdrawnRows: ApplicationRow[] = [];

  for (const a of apps) {
    if (a.status === 'WITHDRAWN') {
      withdrawnRows.push(a);
      continue;
    }
    const arr = groupedActive.get(a.status);
    if (arr) arr.push(a);
  }

  const backLink = (
    <Link
      href="/fleet/jobs"
      className="inline-flex items-center gap-1 text-xs font-medium text-hir-muted-fg hover:text-hir-fg"
    >
      <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      Înapoi la joburi
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        variant="shell"
        breadcrumb={backLink}
        title={listing.position_title}
        actions={<JobStatusBadge status={listing.status} />}
      />
      <p className="-mt-2 text-sm text-hir-muted-fg">
        Aplicații: <span className="tabular-nums">{apps.length}</span> (
        <span className="tabular-nums">{withdrawnRows.length}</span> retrase)
      </p>

      {errorParam ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {errorParam}
        </div>
      ) : null}

      {/* Kanban grid — 5 columns on desktop, stacked on mobile. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {APPLICATION_KANBAN_ORDER.map((col) => {
          const rows = groupedActive.get(col) ?? [];
          return (
            <section
              key={col}
              className="flex flex-col gap-2 rounded-2xl border border-hir-border bg-hir-surface p-3"
            >
              <header className="sticky top-0 z-10 -mx-3 -mt-3 mb-1 flex items-center justify-between rounded-t-2xl bg-hir-surface px-3 pb-2 pt-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-hir-fg">
                  {COLUMN_LABEL[col]}
                </h2>
                <span className="text-[11px] tabular-nums text-hir-muted-fg">
                  {rows.length}
                </span>
              </header>

              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-hir-border px-2 py-3 text-center text-[11px] text-hir-muted-fg">
                  —
                </p>
              ) : (
                rows.map((a) => {
                  const profile = profileById.get(a.courier_user_id);
                  const displayName = profile?.full_name ?? 'Curier';
                  const transitions = ALLOWED_NEXT[col];
                  return (
                    <article
                      key={a.id}
                      className="rounded-xl border border-hir-border bg-hir-bg p-3"
                    >
                      <div className="flex items-center gap-2">
                        {profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={profile.avatar_url}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-500/20">
                            <User className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                          </span>
                        )}
                        <p className="min-w-0 truncate text-xs font-medium text-hir-fg">
                          {displayName}
                        </p>
                      </div>
                      <p className="mt-1 text-[10px] text-hir-muted-fg">
                        Aplicat{' '}
                        {new Intl.DateTimeFormat('ro-RO', {
                          day: '2-digit',
                          month: 'short',
                        }).format(new Date(a.applied_at))}
                      </p>
                      {a.message ? (
                        <p className="mt-2 line-clamp-4 whitespace-pre-line text-[11px] text-hir-muted-fg">
                          {a.message}
                        </p>
                      ) : null}
                      {a.cv_doc_url ? (
                        <a
                          href={a.cv_doc_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-block text-[11px] font-medium text-violet-300 underline hover:text-violet-200"
                        >
                          Vezi CV
                        </a>
                      ) : null}

                      {transitions.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hir-border pt-2">
                          {transitions.map((next) => (
                            <form key={next} action={transitionFormAction}>
                              <input
                                type="hidden"
                                name="application_id"
                                value={a.id}
                              />
                              <input
                                type="hidden"
                                name="listing_id"
                                value={listing.id}
                              />
                              <input
                                type="hidden"
                                name="next_status"
                                value={next}
                              />
                              <button
                                type="submit"
                                className={`rounded-md border px-2 py-1 text-[11px] font-medium ${TRANSITION_TONE[next]}`}
                              >
                                {COLUMN_LABEL[next]}
                              </button>
                            </form>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </section>
          );
        })}
      </div>

      {/* Withdrawn footer — courier-side terminal, no actions. */}
      {withdrawnRows.length > 0 ? (
        <Card>
          <h2 className="text-sm font-bold text-hir-fg">Retrase</h2>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            Curierii care și-au retras aplicația.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {withdrawnRows.map((a) => {
              const profile = profileById.get(a.courier_user_id);
              return (
                <li
                  key={a.id}
                  className="inline-flex items-center gap-2 rounded-full border border-hir-border bg-hir-bg px-3 py-1 text-[11px] text-hir-muted-fg"
                >
                  <User className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  {profile?.full_name ?? 'Curier'}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
