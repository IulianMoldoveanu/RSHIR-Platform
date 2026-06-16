'use server';

// HIR Command Center — manual override actions for the solo PFA pool.
//
// Three actions:
//   - overridePfaKyf(fleetId, decision, reason)
//       VERIFIED_PFA_LIGHT (re-verify) | REJECTED (block) | PENDING (re-queue)
//   - togglePfaFleetActive(fleetId, isActive)
//       Flip courier_fleets.is_active without touching KYF state — used to
//       pause a PFA temporarily (e.g. policy violation under investigation)
//       without invalidating the verification record.
//
// Audit-trail piggy-backs on the existing per-row `validated_by` /
// `validated_by_user_id` stamp on fleet_kyf (introduced by migration
// 20260630_014). The audit_log table is tenant-scoped and PFA fleets are
// not tenants, so we deliberately don't insert into audit_log here — the
// per-row stamp + verified_at/rejected_reason is the durable trail.
//
// Feature flag HIR_FEATURE_SOLO_PFA_ENABLED gates the actions so stale
// browser tabs after rollback cannot mutate state.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/auth/platform-admin';

export type PfaDecision = 'VERIFIED_PFA_LIGHT' | 'REJECTED' | 'PENDING';

export type PfaOverrideResult =
  | { ok: true; kyfStatus: PfaDecision }
  | { ok: false; error: string };

export type PfaActiveResult = { ok: true; isActive: boolean } | { ok: false; error: string };

type UpdateChain = {
  from: (t: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (c: string, v: string) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

/** Override KYF state on a PFA-solo fleet (re-verify / reject / re-queue). */
export async function overridePfaKyf(
  fleetId: string,
  decision: PfaDecision,
  reason?: string,
): Promise<PfaOverrideResult> {
  if (process.env.HIR_FEATURE_SOLO_PFA_ENABLED !== 'true') {
    return { ok: false, error: 'Înrolarea PFA nu este activă momentan.' };
  }
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };
  if (decision !== 'VERIFIED_PFA_LIGHT' && decision !== 'REJECTED' && decision !== 'PENDING') {
    return { ok: false, error: 'Decizie invalidă.' };
  }
  const trimmed = (reason ?? '').trim();
  if (decision === 'REJECTED' && !trimmed) {
    return { ok: false, error: 'Motivul respingerii este obligatoriu.' };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    kyf_status: decision,
    updated_at: now,
    validated_by: 'PLATFORM',
    validated_by_user_id: admin.userId,
  };
  if (decision === 'VERIFIED_PFA_LIGHT') {
    updates.verified_at = now;
    updates.rejected_reason = null;
  } else if (decision === 'REJECTED') {
    updates.verified_at = null;
    updates.rejected_reason = trimmed;
  } else {
    updates.verified_at = null;
    updates.rejected_reason = null;
  }

  const sb = createAdminClient() as unknown as UpdateChain;
  const { data, error } = await sb
    .from('fleet_kyf')
    .update(updates)
    .eq('fleet_id', fleetId)
    .select('fleet_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Flota PFA nu are o cerere de verificare.' };

  revalidatePath('/dashboard/admin/pfa-pool');
  return { ok: true, kyfStatus: decision };
}

/** Toggle the courier_fleets.is_active flag for a PFA solo fleet. */
export async function togglePfaFleetActive(
  fleetId: string,
  isActive: boolean,
): Promise<PfaActiveResult> {
  if (process.env.HIR_FEATURE_SOLO_PFA_ENABLED !== 'true') {
    return { ok: false, error: 'Înrolarea PFA nu este activă momentan.' };
  }
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };

  const sb = createAdminClient() as unknown as UpdateChain;
  // Only allow the toggle on solo PFA fleets — defensive .eq() so this
  // action can't be retargeted at a regular multi-member fleet via a
  // crafted fleetId.
  const { data, error } = await sb
    .from('courier_fleets')
    .update({ is_active: isActive })
    .eq('id', fleetId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Flota nu a fost găsită.' };

  revalidatePath('/dashboard/admin/pfa-pool');
  return { ok: true, isActive };
}
