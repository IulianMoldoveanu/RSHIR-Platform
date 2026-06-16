'use server';

// Stream UI-3 — Rating + Job board (Open Marketplace Extensions).
//
// Courier-side server actions for the job board.
//
//   applyToJobAction(formData)
//     INSERT into courier_job_applications scoped by auth.uid() + listing
//     OPEN check. RLS policy `courier_inserts_own_application` enforces
//     status=PENDING + listing OPEN + courier_user_id = auth.uid().
//     The DB trigger `trg_courier_job_applications_rate_limit` caps at 5
//     active applications per courier — we surface that as a friendly
//     error rather than the raw SQLSTATE.
//
//   withdrawApplicationAction(applicationId)
//     UPDATE applications.status -> WITHDRAWN. RLS policy
//     `courier_withdraws_own_application` lets the courier withdraw any
//     non-HIRED application of theirs.
//
// Feature flag gating is duplicated server-side because a stale tab with the
// UI rendered could still POST when ops flips the flag mid-deploy.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { isJobBoardEnabled } from '@/lib/feature-flags';

export type JobApplicationResult =
  | { ok: true; applicationId?: string }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_MESSAGE = 2000;
const MAX_CV_URL = 1000;

export async function applyToJobAction(formData: FormData): Promise<JobApplicationResult> {
  if (!isJobBoardEnabled()) {
    return { ok: false, error: 'Joburi nu sunt active momentan.' };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesiunea a expirat. Reconectează-te.' };

  const listingId = (formData.get('job_listing_id') as string | null)?.trim() ?? '';
  const message = (formData.get('message') as string | null)?.trim() ?? '';
  const cvUrl = (formData.get('cv_doc_url') as string | null)?.trim() ?? '';

  if (!UUID_RE.test(listingId)) {
    return { ok: false, error: 'Jobul selectat este invalid.' };
  }
  if (message.length > MAX_MESSAGE) {
    return { ok: false, error: `Mesajul poate avea maxim ${MAX_MESSAGE} caractere.` };
  }
  if (cvUrl.length > MAX_CV_URL) {
    return { ok: false, error: 'Link-ul CV este prea lung.' };
  }
  if (cvUrl.length > 0 && !/^https?:\/\//i.test(cvUrl)) {
    return { ok: false, error: 'Link-ul CV trebuie să înceapă cu http:// sau https://' };
  }

  const admin = createAdminClientUntyped();

  // Verify the listing is still OPEN (RLS would also reject the INSERT, but
  // a clear pre-check gives a friendlier error than "check_violation").
  const { data: listingRow } = await admin
    .from('courier_job_listings')
    .select('id, status')
    .eq('id', listingId)
    .maybeSingle();
  const listing = listingRow as { id: string; status: string } | null;
  if (!listing) return { ok: false, error: 'Jobul nu mai există.' };
  if (listing.status !== 'OPEN') {
    return { ok: false, error: 'Jobul nu mai acceptă aplicații.' };
  }

  const { data: insertRow, error } = await admin
    .from('courier_job_applications')
    .insert({
      job_listing_id: listingId,
      courier_user_id: user.id,
      cv_doc_url: cvUrl.length > 0 ? cvUrl : null,
      message: message.length > 0 ? message : null,
      status: 'PENDING',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // Friendly mapping for the two errors most likely to bubble up:
    //   - rate-limit trigger    → check_violation
    //   - unique (listing,user) → 23505
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return { ok: false, error: 'Ai aplicat deja la acest job.' };
    }
    if (code === '23514' || /rate limit reached/i.test(error.message)) {
      return {
        ok: false,
        error: 'Ai deja 5 aplicări active. Așteaptă răspuns la una sau retrage o aplicație.',
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/jobs');
  revalidatePath(`/jobs/${listingId}`);

  return { ok: true, applicationId: (insertRow as { id: string } | null)?.id };
}

export async function withdrawApplicationAction(
  applicationId: string,
): Promise<JobApplicationResult> {
  if (!isJobBoardEnabled()) {
    return { ok: false, error: 'Joburi nu sunt active momentan.' };
  }

  if (!UUID_RE.test(applicationId)) {
    return { ok: false, error: 'Aplicația este invalidă.' };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesiunea a expirat. Reconectează-te.' };

  const admin = createAdminClientUntyped();
  const { data, error } = await admin
    .from('courier_job_applications')
    .update({ status: 'WITHDRAWN' })
    .eq('id', applicationId)
    .eq('courier_user_id', user.id)
    .in('status', ['PENDING', 'REVIEWING', 'INTERVIEWED'])
    .select('id, job_listing_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Aplicația nu mai poate fi retrasă (angajat, respins sau retras deja).',
    };
  }

  revalidatePath('/jobs');
  revalidatePath(`/jobs/${(data as { job_listing_id: string }).job_listing_id}`);

  return { ok: true };
}
