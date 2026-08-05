'use server';

// HIR Command Center — what HIR pays each fleet.
//
// The other side of the money is the fleet's own business: fleet_courier_tariffs
// and the courier payout report belong to the fleet manager, and nothing here
// reads or writes them. This file only ever touches the B2B layer — the rate
// HIR negotiated with a fleet, and the invoice periods generated from it.
//
// Rates are versioned, never edited: setting a new one closes the previous row
// so an invoice generated last month can still be explained by the rate that
// was live when it ran.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

export type BillingResult = { ok: true; message?: string } | { ok: false; error: string };

const MAX_RON = 10_000;

/** Accepts "12", "12.5" and "12,5" — Romanian keyboards produce all three. */
function parseRon(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function setFleetBillingRateAction(
  fleetId: string,
  formData: FormData,
): Promise<BillingResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: 'Acces interzis.' };

  const ron = parseRon(formData.get('per_delivery_ron'));
  if (ron === null) return { ok: false, error: 'Introdu tariful pe livrare.' };
  if (ron < 0 || ron > MAX_RON) {
    return { ok: false, error: `Tariful trebuie să fie între 0 și ${MAX_RON} RON.` };
  }
  const reason = (formData.get('reason') as string | null)?.trim() || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Close the current fleet-wide rate, then open the new one. Two statements,
  // not a transaction: the unique index on (fleet_id) where valid_until is null
  // and city_id is null is what actually guarantees a single live rate — if the
  // insert fails the fleet is left with no active rate, which the page shows in
  // red rather than hiding behind a stale number.
  const { error: closeErr } = await admin
    .from('fleet_billing_tariffs')
    .update({ valid_until: new Date().toISOString() })
    .eq('fleet_id', fleetId)
    .is('city_id', null)
    .is('valid_until', null);
  if (closeErr) return { ok: false, error: closeErr.message };

  const { error: insErr } = await admin.from('fleet_billing_tariffs').insert({
    fleet_id: fleetId,
    city_id: null,
    per_delivery_cents: Math.round(ron * 100),
    reason,
    created_by: gate.userId,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath('/dashboard/admin/fleet-billing');
  return { ok: true, message: `Tarif nou: ${ron.toFixed(2)} RON pe livrare.` };
}

/**
 * Builds the invoice for a closed week. Idempotent by construction — a
 * delivery already invoiced is skipped by the unique index on delivery_id — so
 * re-running after a late delivery lands only adds what is missing.
 */
export async function generateFleetInvoiceAction(
  fleetId: string,
  weeksAgo: number,
): Promise<BillingResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: 'Acces interzis.' };
  if (!Number.isInteger(weeksAgo) || weeksAgo < 1 || weeksAgo > 12) {
    return { ok: false, error: 'Interval invalid.' };
  }

  // The week boundary is computed in the database, by the same expression the
  // courier payout cron uses. Deriving it here in UTC would put the first hours
  // of a Bucharest Monday in a different week from the payout report, and the
  // two sides of a delivery would stop reconciling — a Bucharest Monday is
  // 21:00 UTC in summer, 22:00 in winter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.rpc('fn_generate_fleet_invoice_prior_week', {
    p_weeks_ago: weeksAgo,
    p_fleet_id: fleetId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin/fleet-billing');
  return {
    ok: true,
    message: weeksAgo === 1 ? 'Generat pentru săptămâna trecută.' : `Generat pentru acum ${weeksAgo} săptămâni.`,
  };
}

/**
 * PENDING → APPROVED → PAID, one step at a time and never backwards. APPROVED
 * is what closes a period to the generator, so it must be deliberate: after it,
 * a late delivery lands in the next window instead of silently changing a total
 * that has already been agreed.
 */
export async function advanceFleetInvoiceAction(
  periodId: string,
  to: 'APPROVED' | 'PAID',
  paymentRef?: string | null,
): Promise<BillingResult> {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return { ok: false, error: 'Acces interzis.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const from = to === 'APPROVED' ? 'PENDING' : 'APPROVED';

  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === 'PAID') {
    patch.paid_at = new Date().toISOString();
    patch.paid_method = 'BANK_TRANSFER';
    patch.payment_ref = paymentRef?.trim() || null;
  }

  // The status filter makes this a transition, not an assignment: a double
  // click, or two operators on the same period, affects zero rows the second
  // time instead of re-stamping paid_at.
  const { data, error } = await admin
    .from('fleet_invoice_periods')
    .update(patch)
    .eq('id', periodId)
    .eq('status', from)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Perioada nu mai era în starea așteptată.' };
  }

  revalidatePath('/dashboard/admin/fleet-billing');
  return { ok: true, message: to === 'PAID' ? 'Marcat plătit.' : 'Aprobat.' };
}
