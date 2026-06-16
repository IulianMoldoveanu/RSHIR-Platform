'use server';

// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// Fleet-side server actions for the job board.
//
//   createJobListingAction(formData)
//     INSERT into courier_job_listings. RLS policy `fleet_creates_own_listings`
//     enforces is_fleet_owner_of(fleet_id), but we ALSO pass fleet_id from
//     the server context (never from form data) — defence in depth.
//
//   updateJobListingStatusAction(listingId, nextStatus)
//     UPDATE listings.status for OPEN<->PAUSED<->CLOSED transitions. EXPIRED
//     is reserved for the cron and not user-settable.
//
//   updateApplicationStatusAction(applicationId, nextStatus)
//     UPDATE applications.status for the fleet-controlled side of the kanban
//     (REVIEWING/INTERVIEWED/HIRED/REJECTED). RLS verifies the listing
//     belongs to the fleet via the join-policy.
//
// Feature-flag gate is duplicated server-side so a stale tab cannot bypass.

import { revalidatePath } from 'next/cache';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';
import { isJobBoardEnabled } from '@/lib/feature-flags';

export type FleetJobActionResult =
  | { ok: true; listingId?: string }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_REQUIREMENTS = 5000;
const MAX_SHIFT_PATTERN = 200;
const MAX_VEHICLE = 200;
const MAX_SALARY = 1_000_000;
const ALLOWED_EMPLOYMENT = new Set(['PFA', 'salariat', 'contractor']);
const ALLOWED_LISTING_STATUS = new Set(['OPEN', 'PAUSED', 'CLOSED']);
const ALLOWED_APPLICATION_STATUS = new Set([
  'REVIEWING',
  'INTERVIEWED',
  'HIRED',
  'REJECTED',
]);
const ALLOWED_LANG = /^[a-z]{2}$/;

export async function createJobListingAction(
  formData: FormData,
): Promise<FleetJobActionResult> {
  if (!isJobBoardEnabled()) {
    return { ok: false, error: 'Joburi nu sunt active momentan.' };
  }

  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };
  if (!ctx.isActive) return { ok: false, error: 'Flota este inactivă.' };

  const positionTitle = (formData.get('position_title') as string | null)?.trim() ?? '';
  const description = (formData.get('description') as string | null)?.trim() ?? '';
  const requirements = (formData.get('requirements') as string | null)?.trim() ?? '';
  const employmentType = (formData.get('employment_type') as string | null)?.trim() ?? '';
  const cityIdRaw = (formData.get('city_id') as string | null)?.trim() ?? '';
  const shiftPattern = (formData.get('shift_pattern') as string | null)?.trim() ?? '';
  const vehicleRequired = (formData.get('vehicle_required') as string | null)?.trim() ?? '';
  const salaryMinRaw = (formData.get('salary_range_min_ron') as string | null)?.trim() ?? '';
  const salaryMaxRaw = (formData.get('salary_range_max_ron') as string | null)?.trim() ?? '';
  const languagesRaw = (formData.get('languages_required') as string | null)?.trim() ?? '';
  const expiresAtRaw = (formData.get('expires_at') as string | null)?.trim() ?? '';

  if (positionTitle.length < 3 || positionTitle.length > MAX_TITLE) {
    return { ok: false, error: 'Titlul postului trebuie între 3 și 200 caractere.' };
  }
  if (description.length < 10 || description.length > MAX_DESCRIPTION) {
    return { ok: false, error: 'Descrierea trebuie între 10 și 5000 caractere.' };
  }
  if (requirements.length > MAX_REQUIREMENTS) {
    return { ok: false, error: 'Cerințele pot avea maxim 5000 caractere.' };
  }
  if (!ALLOWED_EMPLOYMENT.has(employmentType)) {
    return { ok: false, error: 'Tip contract invalid.' };
  }
  if (cityIdRaw && !UUID_RE.test(cityIdRaw)) {
    return { ok: false, error: 'Orașul selectat este invalid.' };
  }
  if (shiftPattern.length > MAX_SHIFT_PATTERN) {
    return { ok: false, error: 'Programul este prea lung.' };
  }
  if (vehicleRequired.length > MAX_VEHICLE) {
    return { ok: false, error: 'Vehiculul cerut este prea lung.' };
  }

  let salaryMin: number | null = null;
  if (salaryMinRaw) {
    salaryMin = Number.parseInt(salaryMinRaw, 10);
    if (!Number.isFinite(salaryMin) || salaryMin < 0 || salaryMin > MAX_SALARY) {
      return { ok: false, error: 'Salariu minim invalid.' };
    }
  }
  let salaryMax: number | null = null;
  if (salaryMaxRaw) {
    salaryMax = Number.parseInt(salaryMaxRaw, 10);
    if (!Number.isFinite(salaryMax) || salaryMax < 0 || salaryMax > MAX_SALARY) {
      return { ok: false, error: 'Salariu maxim invalid.' };
    }
  }
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
    return { ok: false, error: 'Salariu maxim trebuie ≥ salariu minim.' };
  }

  let languages: string[] = [];
  if (languagesRaw.length > 0) {
    languages = languagesRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (languages.some((l) => !ALLOWED_LANG.test(l))) {
      return {
        ok: false,
        error: 'Limbi trebuie să fie coduri ISO de 2 litere (ex: ro, en, hu).',
      };
    }
    if (languages.length > 10) {
      return { ok: false, error: 'Prea multe limbi (max 10).' };
    }
  }

  let expiresAt: string | null = null;
  if (expiresAtRaw) {
    const ms = Date.parse(expiresAtRaw);
    if (!Number.isFinite(ms) || ms <= Date.now()) {
      return { ok: false, error: 'Data de expirare trebuie să fie în viitor.' };
    }
    expiresAt = new Date(ms).toISOString();
  }

  const admin = createAdminClientUntyped();
  const { data, error } = await admin
    .from('courier_job_listings')
    .insert({
      fleet_id: ctx.fleetId,
      city_id: cityIdRaw || null,
      position_title: positionTitle,
      description,
      requirements: requirements.length > 0 ? requirements : null,
      employment_type: employmentType,
      shift_pattern: shiftPattern.length > 0 ? shiftPattern : null,
      vehicle_required: vehicleRequired.length > 0 ? vehicleRequired : null,
      salary_range_min_ron: salaryMin,
      salary_range_max_ron: salaryMax,
      languages_required: languages,
      expires_at: expiresAt,
      status: 'OPEN',
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/fleet/jobs');
  revalidatePath('/jobs');

  return { ok: true, listingId: (data as { id: string } | null)?.id };
}

export async function updateJobListingStatusAction(
  listingId: string,
  nextStatus: string,
): Promise<FleetJobActionResult> {
  if (!isJobBoardEnabled()) {
    return { ok: false, error: 'Joburi nu sunt active momentan.' };
  }

  if (!UUID_RE.test(listingId)) {
    return { ok: false, error: 'Job invalid.' };
  }
  if (!ALLOWED_LISTING_STATUS.has(nextStatus)) {
    return { ok: false, error: 'Status invalid.' };
  }

  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClientUntyped();
  const { data, error } = await admin
    .from('courier_job_listings')
    .update({ status: nextStatus })
    .eq('id', listingId)
    .eq('fleet_id', ctx.fleetId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Jobul nu mai există.' };

  revalidatePath('/fleet/jobs');
  revalidatePath(`/fleet/jobs/${listingId}/applications`);
  revalidatePath('/jobs');
  revalidatePath(`/jobs/${listingId}`);

  return { ok: true };
}

export async function updateApplicationStatusAction(
  applicationId: string,
  nextStatus: string,
): Promise<FleetJobActionResult> {
  if (!isJobBoardEnabled()) {
    return { ok: false, error: 'Joburi nu sunt active momentan.' };
  }

  if (!UUID_RE.test(applicationId)) {
    return { ok: false, error: 'Aplicația este invalidă.' };
  }
  if (!ALLOWED_APPLICATION_STATUS.has(nextStatus)) {
    return { ok: false, error: 'Status invalid.' };
  }

  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClientUntyped();

  // Verify the application belongs to a listing owned by this fleet — RLS
  // would also enforce this via the join-policy, but a pre-check gives a
  // friendlier "not found" instead of an empty update.
  const { data: appRow } = await admin
    .from('courier_job_applications')
    .select('id, job_listing_id, status')
    .eq('id', applicationId)
    .maybeSingle();
  const app = appRow as
    | { id: string; job_listing_id: string; status: string }
    | null;
  if (!app) return { ok: false, error: 'Aplicația nu mai există.' };

  const { data: listingRow } = await admin
    .from('courier_job_listings')
    .select('id, fleet_id')
    .eq('id', app.job_listing_id)
    .eq('fleet_id', ctx.fleetId)
    .maybeSingle();
  if (!listingRow) return { ok: false, error: 'Aplicația nu aparține flotei tale.' };

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    reviewed_at: new Date().toISOString(),
  };
  if (nextStatus === 'HIRED') {
    updatePayload.hired_at = new Date().toISOString();
  }

  const { error } = await admin
    .from('courier_job_applications')
    .update(updatePayload)
    .eq('id', applicationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/fleet/jobs');
  revalidatePath(`/fleet/jobs/${app.job_listing_id}/applications`);

  return { ok: true };
}
