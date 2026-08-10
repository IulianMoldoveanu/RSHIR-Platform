// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// /jobs/[id] — courier-facing listing detail + apply form.
//
// What the courier sees:
//   • Position + fleet name + city + employment_type badge
//   • Description + requirements (text rendered with whitespace preserved)
//   • Salary range + shift pattern + vehicle requirement (when set)
//   • Languages required (chips)
//   • Apply form (message + optional CV URL) — only when status=OPEN AND
//     courier has not already applied
//   • Existing application status (if any) with Withdraw CTA where allowed
//
// Server actions live in ../actions.ts; this page is mostly a fetch + form
// render. Errors from the action surface via search-param `?error=...` to
// keep the page server-rendered (no client state).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Banknote,
  Clock,
  Car,
  Languages,
  AlertCircle,
} from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { JobStatusBadge } from '@/app/_components';
import { isJobBoardEnabled } from '@/lib/feature-flags';
import { PageHeader, Card, buttonClass } from '@/app/_marketplace-ui';
import { applyToJobAction, withdrawApplicationAction } from '../actions';

export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  fleet_id: string;
  city_id: string | null;
  position_title: string;
  description: string;
  requirements: string | null;
  salary_range_min_ron: number | null;
  salary_range_max_ron: number | null;
  employment_type: 'PFA' | 'salariat' | 'contractor';
  shift_pattern: string | null;
  vehicle_required: string | null;
  languages_required: string[];
  status: 'OPEN' | 'PAUSED' | 'CLOSED' | 'EXPIRED';
  created_at: string;
  expires_at: string | null;
};

type ApplicationRow = {
  id: string;
  status: 'PENDING' | 'REVIEWING' | 'INTERVIEWED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  applied_at: string;
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

// Server action wrappers to satisfy the <form action={...}> signature.
async function applyFormAction(formData: FormData): Promise<void> {
  'use server';
  const result = await applyToJobAction(formData);
  const listingId = (formData.get('job_listing_id') as string | null)?.trim() ?? '';
  if (!result.ok) {
    redirect(`/jobs/${listingId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/jobs/${listingId}?applied=1`);
}

async function withdrawFormAction(formData: FormData): Promise<void> {
  'use server';
  const id = (formData.get('application_id') as string | null)?.trim() ?? '';
  const listingId = (formData.get('job_listing_id') as string | null)?.trim() ?? '';
  const result = await withdrawApplicationAction(id);
  if (!result.ok) {
    redirect(`/jobs/${listingId}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/jobs/${listingId}?withdrawn=1`);
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; applied?: string; withdrawn?: string }>;
}) {
  if (!isJobBoardEnabled()) notFound();

  const { id } = await params;
  const { error: errorParam, applied, withdrawn } = await searchParams;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClientUntyped();

  const { data: listingRow } = await admin
    .from('courier_job_listings')
    .select(
      'id, fleet_id, city_id, position_title, description, requirements, salary_range_min_ron, salary_range_max_ron, employment_type, shift_pattern, vehicle_required, languages_required, status, created_at, expires_at',
    )
    .eq('id', id)
    .maybeSingle();

  const listing = listingRow as ListingRow | null;
  if (!listing) notFound();

  // Hydrate fleet name + city + my-application (if any) in parallel.
  const [{ data: fleetRow }, { data: cityRow }, { data: appRow }] = await Promise.all([
    admin.from('courier_fleets').select('id, name, slug').eq('id', listing.fleet_id).maybeSingle(),
    listing.city_id
      ? admin
          .from('cities')
          .select('id, name, county')
          .eq('id', listing.city_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('courier_job_applications')
      .select('id, status, applied_at')
      .eq('job_listing_id', listing.id)
      .eq('courier_user_id', user.id)
      .maybeSingle(),
  ]);

  const fleet = fleetRow as FleetRow | null;
  const city = cityRow as CityRow | null;
  const application = appRow as ApplicationRow | null;

  const salary = formatSalary(listing.salary_range_min_ron, listing.salary_range_max_ron);
  const canApply = listing.status === 'OPEN' && !application;
  const canWithdraw =
    application != null && ['PENDING', 'REVIEWING', 'INTERVIEWED'].includes(application.status);

  const backLink = (
    <Link
      href="/jobs"
      className="inline-flex items-center gap-1 text-xs font-medium text-hir-muted-fg hover:text-hir-fg"
    >
      <ArrowLeft className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      Înapoi la joburi
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-24 pt-6">
      {/* Status banners */}
      {errorParam ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-300" strokeWidth={1.75} aria-hidden />
          {errorParam}
        </div>
      ) : null}
      {applied ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Aplicația ta a fost trimisă. Flota îți va răspunde aici.
        </div>
      ) : null}
      {withdrawn ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Ai retras aplicația.
        </div>
      ) : null}

      {/* Listing header */}
      <PageHeader
        variant="shell"
        breadcrumb={backLink}
        title={listing.position_title}
        description={fleet ? `Publicat de ${fleet.name}` : undefined}
        actions={<JobStatusBadge status={listing.status} />}
      />

      {/* Chip row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-hir-muted-fg">
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
          <Briefcase className="h-3 w-3" strokeWidth={1.75} aria-hidden />
          {EMPLOYMENT_LABEL[listing.employment_type]}
        </span>
        {city ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 ring-1 ring-inset ring-hir-border">
            <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {city.name}
            {city.county ? `, ${city.county}` : ''}
          </span>
        ) : null}
        {salary ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 tabular-nums ring-1 ring-inset ring-hir-border">
            <Banknote className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {salary}
          </span>
        ) : null}
        {listing.shift_pattern ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 ring-1 ring-inset ring-hir-border">
            <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {listing.shift_pattern}
          </span>
        ) : null}
        {listing.vehicle_required ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-hir-bg px-2 py-0.5 ring-1 ring-inset ring-hir-border">
            <Car className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {listing.vehicle_required}
          </span>
        ) : null}
      </div>

      {/* Description */}
      <Card>
        <h2 className="text-sm font-bold text-hir-fg">Descriere</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-hir-muted-fg">
          {listing.description}
        </p>
      </Card>

      {/* Requirements */}
      {listing.requirements ? (
        <Card>
          <h2 className="text-sm font-bold text-hir-fg">Cerințe</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-hir-muted-fg">
            {listing.requirements}
          </p>
        </Card>
      ) : null}

      {/* Languages */}
      {listing.languages_required && listing.languages_required.length > 0 ? (
        <Card>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-hir-fg">
            <Languages className="h-4 w-4 text-violet-400" strokeWidth={1.75} aria-hidden />
            Limbi cerute
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {listing.languages_required.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center rounded-full bg-hir-bg px-2 py-0.5 text-xs font-medium text-hir-muted-fg ring-1 ring-inset ring-hir-border"
              >
                {lang.toUpperCase()}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Existing application state */}
      {application ? (
        <Card accent>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-hir-fg">Aplicația ta</h2>
              <p className="mt-0.5 text-xs tabular-nums text-hir-muted-fg">
                Trimisă{' '}
                {new Intl.DateTimeFormat('ro-RO', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(application.applied_at))}
              </p>
            </div>
            <JobStatusBadge status={application.status} />
          </div>
          {canWithdraw ? (
            <form action={withdrawFormAction} className="mt-3">
              <input type="hidden" name="application_id" value={application.id} />
              <input type="hidden" name="job_listing_id" value={listing.id} />
              <button type="submit" className={buttonClass('danger', 'sm')}>
                Retrage aplicația
              </button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {/* Apply form */}
      {canApply ? (
        <Card accent>
          <h2 className="text-sm font-bold text-hir-fg">Aplică acum</h2>
          <p className="mt-0.5 text-xs text-hir-muted-fg">
            Flota îți va răspunde direct prin platformă. Maxim 5 aplicații active.
          </p>
          <form action={applyFormAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="job_listing_id" value={listing.id} />
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
                Mesaj (opțional)
              </span>
              <textarea
                name="message"
                rows={4}
                maxLength={2000}
                placeholder="Spune flotei câteva cuvinte despre experiența ta…"
                className="rounded-md border border-hir-border bg-hir-bg p-2 text-sm text-hir-fg placeholder:text-hir-muted-fg/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-hir-muted-fg">
                Link CV (opțional)
              </span>
              <input
                type="url"
                name="cv_doc_url"
                placeholder="https://…"
                maxLength={1000}
                className="rounded-md border border-hir-border bg-hir-bg p-2 text-sm text-hir-fg placeholder:text-hir-muted-fg/60"
              />
              <span className="text-[10px] text-hir-muted-fg">
                Sfat: încarcă CV-ul pe Drive / Dropbox și pune link-ul aici.
              </span>
            </label>
            <button type="submit" className={buttonClass('primary', 'md', 'self-start')}>
              Trimite aplicația
            </button>
          </form>
        </Card>
      ) : null}

      {!canApply && !application ? (
        <p className="rounded-xl border border-hir-border bg-hir-surface p-3 text-xs text-hir-muted-fg">
          Jobul nu mai acceptă aplicații.
        </p>
      ) : null}

      <p className="text-[10px] leading-relaxed text-hir-muted-fg">
        HIR găzduiește anunțul dar nu este angajatorul. Contractul, salariul și
        condițiile de muncă sunt între tine și flota care publică jobul.
      </p>
    </div>
  );
}
