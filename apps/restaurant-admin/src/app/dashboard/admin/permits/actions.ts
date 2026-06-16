'use server';

// Stream 7 — admin server actions for non-EU permit verification.
//
// Mirrors verifyCourierKyc / verifyFleetKyf (verifications/actions.ts) — the
// platform admin guard is identical, the audit trail lives in
// public.courier_permit_audit_log (auto-populated by the trigger from
// migration 20260616_014), and the underlying write uses service_role to
// flip permit_status + stamp permit_verified_at + permit_verified_by.
//
// Two actions:
//   verifyCourierPermit(courierUserId, decision, reason?) — single courier
//   bulkApproveCourierPermits(courierUserIds[]) — visible-PENDING batch
//
// Reject requires a reason (vendor/courier-facing). Approve has no reason.
// Feature flag HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED is re-checked here so
// a stale tab can't bypass the off state.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/auth/platform-admin';

export type PermitDecision = 'VERIFIED' | 'REJECTED';
export type PermitVerifyResult = { ok: true } | { ok: false; error: string };
export type PermitBulkResult = {
  ok: boolean;
  approved: number;
  failed: Array<{ userId: string; error: string }>;
};

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

function featureEnabled(): boolean {
  return process.env.HIR_FEATURE_NON_EU_PERMIT_VERIFY_ENABLED === 'true';
}

export async function verifyCourierPermit(
  courierUserId: string,
  decision: PermitDecision,
  reason?: string,
): Promise<PermitVerifyResult> {
  if (!featureEnabled()) {
    return { ok: false, error: 'Verificarea permiselor non-UE nu este activă.' };
  }
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return { ok: false, error: 'Decizie invalidă.' };
  }
  const trimmed = reason?.trim() ?? '';
  if (decision === 'REJECTED' && !trimmed) {
    return { ok: false, error: 'Motivul respingerii este obligatoriu.' };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> =
    decision === 'VERIFIED'
      ? {
          permit_status: 'VERIFIED',
          permit_verified_at: now,
          permit_verified_by: admin.userId,
          updated_at: now,
        }
      : {
          permit_status: 'REJECTED',
          permit_verified_at: now,
          permit_verified_by: admin.userId,
          updated_at: now,
        };

  // The audit trigger (trg_log_courier_permit_change) consumes the
  // permit_status change AFTER UPDATE — it auto-writes the audit row with
  // actor_user_id=auth.uid(). For the service_role context auth.uid() is
  // NULL, which is OK; the trigger's metadata block records the
  // permit_verified_by value so the audit row carries the operator id.
  //
  // For REJECTED we additionally want the reason persisted. The trigger as
  // shipped in 20260616_014 doesn't read a per-call reason argument, so we
  // append the reason to the audit log via a direct INSERT after the
  // service-role UPDATE — the trigger will still fire and we get two audit
  // entries (state change + reason). Acceptable trade-off vs. extending the
  // trigger signature; the audit log is the source of truth for both.
  const sb = createAdminClient() as unknown as UpdateChain;
  const { data, error } = await sb
    .from('courier_profiles')
    .update(updates)
    .eq('user_id', courierUserId)
    .select('user_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Curierul nu are un profil cu permis non-UE.' };
  }

  if (decision === 'REJECTED' && trimmed) {
    // Best-effort note insertion. courier_permit_audit_log is RLS-protected
    // and we hold service_role, so this insert bypasses policy.
    const insertChain = createAdminClient() as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
    await insertChain.from('courier_permit_audit_log').insert({
      courier_user_id: courierUserId,
      actor_user_id: admin.userId,
      old_status: 'PENDING',
      new_status: 'REJECTED',
      reason: trimmed,
      metadata: { source: 'admin_console_reason_note' },
    });
  }

  revalidatePath('/dashboard/admin/permits');
  return { ok: true };
}

export async function bulkApproveCourierPermits(
  courierUserIds: string[],
): Promise<PermitBulkResult> {
  if (!featureEnabled()) {
    return {
      ok: false,
      approved: 0,
      failed: [{ userId: '*', error: 'feature_not_enabled' }],
    };
  }
  const admin = await getPlatformAdmin();
  if (!admin) {
    return {
      ok: false,
      approved: 0,
      failed: [{ userId: '*', error: 'forbidden' }],
    };
  }

  const ids = Array.from(new Set(courierUserIds.filter(Boolean)));
  if (ids.length === 0) {
    return { ok: true, approved: 0, failed: [] };
  }

  let approved = 0;
  const failed: Array<{ userId: string; error: string }> = [];

  // One UPDATE per row so the audit trigger fires per courier. Pool of 8
  // parallel writes — courier_profiles is keyed on user_id (no contention).
  const chunkSize = 8;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((id) => verifyCourierPermit(id, 'VERIFIED')),
    );
    results.forEach((r, idx) => {
      if (r.ok) approved += 1;
      else failed.push({ userId: chunk[idx], error: r.error });
    });
  }

  revalidatePath('/dashboard/admin/permits');
  return { ok: failed.length === 0, approved, failed };
}
