'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';
import { logAudit } from '@/lib/audit';

export type PayoutActionResult = { ok: true } | { ok: false; error: string };

const PAID_METHODS = new Set(['BANK_TRANSFER', 'CASH', 'OTHER']);
const MAX_PAYMENT_REF_LENGTH = 120;

/**
 * Verify a payout_periods row belongs to a courier in the manager's fleet.
 * Used as defence-in-depth — the page already filters by fleet, but a
 * fleet manager must never be able to mutate a sibling fleet's payouts
 * by replaying URLs / form submissions.
 *
 * Returns the courier_user_id on success so the action can include it in
 * the audit metadata. Returns null when the period does not belong to
 * the fleet.
 */
async function assertPeriodInFleet(
  admin: ReturnType<typeof createAdminClient>,
  periodId: string,
  fleetId: string,
): Promise<{ courierUserId: string; status: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data: period } = await sb
    .from('payout_periods')
    .select('courier_user_id, status')
    .eq('id', periodId)
    .maybeSingle();
  if (!period) return null;

  const { data: profile } = await sb
    .from('courier_profiles')
    .select('user_id')
    .eq('user_id', period.courier_user_id)
    .eq('fleet_id', fleetId)
    .maybeSingle();
  if (!profile) return null;

  return { courierUserId: period.courier_user_id, status: period.status };
}

/**
 * PENDING → APPROVED transition for a payout_periods row. Gated on the
 * current status being PENDING so a stale tab can't re-approve or skip
 * the APPROVED → PAID step. Atomic via `.eq('status','PENDING')` in the
 * UPDATE WHERE clause.
 */
export async function approvePayoutPeriodAction(
  periodId: string,
): Promise<PayoutActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  const fleetCheck = await assertPeriodInFleet(admin, periodId, ctx.fleetId);
  if (!fleetCheck) {
    return { ok: false, error: 'Perioada nu aparține flotei.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('payout_periods')
    .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
    .eq('id', periodId)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Perioada nu mai poate fi aprobată (deja aprobată sau plătită).',
    };
  }

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.payout_period_approved',
    entityType: 'payout_period',
    entityId: periodId,
    metadata: {
      fleet_id: ctx.fleetId,
      courier_user_id: fleetCheck.courierUserId,
    },
  });

  revalidatePath('/fleet/payouts');
  revalidatePath(`/fleet/payouts/${periodId}`);
  return { ok: true };
}

/**
 * APPROVED → PAID transition. Records paid_method and payment_ref
 * (external SEPA OP number / cash receipt id / etc.) for reconciliation.
 * Atomic via `.eq('status','APPROVED')` so a row can never skip
 * straight from PENDING to PAID — the manager must explicitly approve
 * first.
 */
export async function markPayoutPeriodPaidAction(
  formData: FormData,
): Promise<PayoutActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const periodId = (formData.get('period_id') as string | null)?.trim() ?? '';
  const paidMethod = (formData.get('paid_method') as string | null)?.trim() ?? '';
  const paymentRefRaw = (formData.get('payment_ref') as string | null)?.trim() ?? '';

  if (!periodId) return { ok: false, error: 'period_id lipsește.' };
  if (!PAID_METHODS.has(paidMethod)) {
    return { ok: false, error: 'Metoda de plată invalidă.' };
  }
  if (paymentRefRaw.length > MAX_PAYMENT_REF_LENGTH) {
    return {
      ok: false,
      error: `Referința poate avea maxim ${MAX_PAYMENT_REF_LENGTH} caractere.`,
    };
  }

  const admin = createAdminClient();
  const fleetCheck = await assertPeriodInFleet(admin, periodId, ctx.fleetId);
  if (!fleetCheck) {
    return { ok: false, error: 'Perioada nu aparține flotei.' };
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('payout_periods')
    .update({
      status: 'PAID',
      paid_at: now,
      paid_method: paidMethod,
      payment_ref: paymentRefRaw === '' ? null : paymentRefRaw,
      updated_at: now,
    })
    .eq('id', periodId)
    .eq('status', 'APPROVED')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Perioada trebuie aprobată înainte de a fi marcată plătită.',
    };
  }

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.payout_period_paid',
    entityType: 'payout_period',
    entityId: periodId,
    metadata: {
      fleet_id: ctx.fleetId,
      courier_user_id: fleetCheck.courierUserId,
      paid_method: paidMethod,
      payment_ref: paymentRefRaw || null,
    },
  });

  revalidatePath('/fleet/payouts');
  revalidatePath(`/fleet/payouts/${periodId}`);
  return { ok: true };
}
