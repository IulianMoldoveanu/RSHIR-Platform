'use server';

// Stream 7 (Non-EU permit verify) — courier server action.
//
// Writes the four scalar permit fields onto public.courier_profiles for the
// authenticated user. The DB trigger trg_log_courier_permit_change (migration
// 20260616_014) automatically appends an immutable audit row to
// public.courier_permit_audit_log on every status transition.
//
// Resubmission semantics: every successful call resets permit_status back to
// PENDING (per the migration comment — courier-side write never sets
// VERIFIED/REJECTED directly; only the platform admin can do that via
// service_role from the admin queue). The migration's CHECK constraint
// (courier_profiles_non_eu_required_fields_chk) requires country_iso +
// valid_until + doc_url all be NOT NULL once status leaves PENDING, but we
// always land on PENDING here so the constraint is satisfied even if the
// trigger runs before the next admin review.
//
// Feature flag HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED gates the route at
// render time; we also re-check here so a stale client POST is rejected.

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type PermitSubmitResult = { ok: true } | { ok: false; error: string };

const ISO_RE = /^[A-Z]{3}$/;

type UpdateChain = {
  from: (t: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (
        c: string,
        v: string,
      ) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: { user_id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export async function submitPermitAction(input: {
  countryIso: string;
  validUntil: string; // YYYY-MM-DD
  docPath: string;
}): Promise<PermitSubmitResult> {
  if (process.env.HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED !== 'true') {
    return { ok: false, error: 'feature_not_enabled' };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const iso = input.countryIso.trim().toUpperCase();
  if (!ISO_RE.test(iso)) return { ok: false, error: 'country_iso_invalid' };

  if (!input.validUntil) return { ok: false, error: 'valid_until_invalid' };
  const ms = Date.parse(input.validUntil);
  if (!Number.isFinite(ms) || ms <= Date.now()) {
    return { ok: false, error: 'valid_until_invalid' };
  }

  if (!input.docPath || input.docPath.trim() === '') {
    return { ok: false, error: 'doc_required' };
  }

  const admin = createAdminClient() as unknown as UpdateChain;
  const { data, error } = await admin
    .from('courier_profiles')
    .update({
      is_non_eu_resident: true,
      permit_country_iso: iso,
      permit_munca_valid_until: input.validUntil,
      permit_doc_url: input.docPath,
      // Always reset to PENDING on resubmit — admin re-verification required.
      permit_status: 'PENDING',
      permit_verified_at: null,
      permit_verified_by: null,
    })
    .eq('user_id', user.id)
    .select('user_id')
    .maybeSingle();

  if (error) {
    console.error('[permit] courier_profiles update failed', error.message);
    return { ok: false, error: 'db_error' };
  }
  if (!data) return { ok: false, error: 'profile_not_found' };

  revalidatePath('/dashboard/permit');
  return { ok: true };
}
