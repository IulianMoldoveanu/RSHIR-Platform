'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPlatformAdmin } from '@/lib/platform-admin';
import { logAudit } from '@/lib/audit';

export type VerifyResult = { ok: true } | { ok: false; error: string };
export type Decision = 'VERIFIED' | 'REJECTED';

// Loose update chain — courier_kyc / fleet_kyf aren't in generated types yet.
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

function reasonRequiredOrNull(decision: Decision, reason?: string): string | null | { error: string } {
  if (decision === 'REJECTED') {
    const trimmed = reason?.trim() ?? '';
    if (!trimmed) return { error: 'Motivul respingerii este obligatoriu.' };
    return trimmed;
  }
  return null;
}

/**
 * Platform verification of a courier's identity (KYC). Sets kyc_status to
 * VERIFIED (clears rejected_reason, stamps verified_at) or REJECTED (records
 * the reason). service_role write, gated on platform admin — couriers can
 * never self-verify (the submission RPC forces PENDING).
 */
export async function verifyCourierKyc(
  courierUserId: string,
  decision: Decision,
  reason?: string,
): Promise<VerifyResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return { ok: false, error: 'Decizie invalidă.' };
  }

  const rejReason = reasonRequiredOrNull(decision, reason);
  if (rejReason && typeof rejReason === 'object') return { ok: false, error: rejReason.error };

  const now = new Date().toISOString();
  const updates =
    decision === 'VERIFIED'
      ? { kyc_status: 'VERIFIED', verified_at: now, rejected_reason: null, updated_at: now }
      : { kyc_status: 'REJECTED', rejected_reason: rejReason as string, verified_at: null, updated_at: now };

  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as UpdateChain)
    .from('courier_kyc')
    .update(updates)
    .eq('courier_user_id', courierUserId)
    .select('courier_user_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Curierul nu are o cerere de verificare.' };

  await logAudit({
    actorUserId: guard.userId,
    action: decision === 'VERIFIED' ? 'admin.courier_kyc_verified' : 'admin.courier_kyc_rejected',
    entityType: 'courier_kyc',
    entityId: courierUserId,
    metadata: { reason: decision === 'REJECTED' ? rejReason : null },
  });

  revalidatePath('/admin/verifications');
  return { ok: true };
}

/**
 * Platform verification of a fleet's legitimacy (KYF). Mirrors verifyCourierKyc
 * for fleet_kyf. Keyed by fleet_id.
 */
export async function verifyFleetKyf(
  fleetId: string,
  decision: Decision,
  reason?: string,
): Promise<VerifyResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return { ok: false, error: 'Decizie invalidă.' };
  }

  const rejReason = reasonRequiredOrNull(decision, reason);
  if (rejReason && typeof rejReason === 'object') return { ok: false, error: rejReason.error };

  const now = new Date().toISOString();
  const updates =
    decision === 'VERIFIED'
      ? { kyf_status: 'VERIFIED', verified_at: now, rejected_reason: null, updated_at: now }
      : { kyf_status: 'REJECTED', rejected_reason: rejReason as string, verified_at: null, updated_at: now };

  const admin = createAdminClient();
  const { data, error } = await (admin as unknown as UpdateChain)
    .from('fleet_kyf')
    .update(updates)
    .eq('fleet_id', fleetId)
    .select('fleet_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Flota nu are o cerere de verificare.' };

  await logAudit({
    actorUserId: guard.userId,
    action: decision === 'VERIFIED' ? 'admin.fleet_kyf_verified' : 'admin.fleet_kyf_rejected',
    entityType: 'fleet_kyf',
    entityId: fleetId,
    metadata: { reason: decision === 'REJECTED' ? rejReason : null },
  });

  revalidatePath('/admin/verifications');
  return { ok: true };
}
