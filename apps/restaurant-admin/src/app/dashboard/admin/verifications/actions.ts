'use server';

// HIR Command Center — platform verification of courier identity (KYC) and
// fleet legitimacy (KYF). Native to admin.hirforyou.ro so the operator never
// jumps apps. Reads/writes the shared courier_kyc / fleet_kyf tables (same
// Supabase project as the courier PWA) via service_role, gated on platform
// admin. The decision is stamped with validated_by='PLATFORM' + the admin's
// user id (migration 20260630_014) — that stamp is the durable audit trail
// (audit_log here is tenant-scoped and N/A for platform-level events).

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/auth/platform-admin';

export type VerifyResult = { ok: true } | { ok: false; error: string };
export type Decision = 'VERIFIED' | 'REJECTED';

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

function buildUpdates(decision: Decision, reason: string, adminUserId: string) {
  const now = new Date().toISOString();
  const stamp = { validated_by: 'PLATFORM', validated_by_user_id: adminUserId };
  return decision === 'VERIFIED'
    ? { verified_at: now, rejected_reason: null, updated_at: now, ...stamp }
    : { rejected_reason: reason, verified_at: null, updated_at: now, ...stamp };
}

export async function verifyCourierKyc(
  courierUserId: string,
  decision: Decision,
  reason?: string,
): Promise<VerifyResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return { ok: false, error: 'Decizie invalidă.' };
  }
  const trimmed = reason?.trim() ?? '';
  if (decision === 'REJECTED' && !trimmed) {
    return { ok: false, error: 'Motivul respingerii este obligatoriu.' };
  }

  const sb = createAdminClient() as unknown as UpdateChain;
  const { data, error } = await sb
    .from('courier_kyc')
    .update({ kyc_status: decision, ...buildUpdates(decision, trimmed, admin.userId) })
    .eq('courier_user_id', courierUserId)
    .select('courier_user_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Curierul nu are o cerere de verificare.' };

  revalidatePath('/dashboard/admin/verifications');
  return { ok: true };
}

export async function verifyFleetKyf(
  fleetId: string,
  decision: Decision,
  reason?: string,
): Promise<VerifyResult> {
  const admin = await getPlatformAdmin();
  if (!admin) return { ok: false, error: 'Acces interzis: doar PLATFORM_ADMIN.' };
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return { ok: false, error: 'Decizie invalidă.' };
  }
  const trimmed = reason?.trim() ?? '';
  if (decision === 'REJECTED' && !trimmed) {
    return { ok: false, error: 'Motivul respingerii este obligatoriu.' };
  }

  const sb = createAdminClient() as unknown as UpdateChain;
  const { data, error } = await sb
    .from('fleet_kyf')
    .update({ kyf_status: decision, ...buildUpdates(decision, trimmed, admin.userId) })
    .eq('fleet_id', fleetId)
    .select('fleet_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Flota nu are o cerere de verificare.' };

  revalidatePath('/dashboard/admin/verifications');
  return { ok: true };
}
