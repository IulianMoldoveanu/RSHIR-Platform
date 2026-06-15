'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFleetManagerContext } from '@/lib/fleet-manager';
import { logAudit } from '@/lib/audit';

export type TariffActionResult = { ok: true } | { ok: false; error: string };

// Sanity cap per delivery — a fleet paying >1000 RON/delivery is a typo.
const MAX_RON = 1000;

/**
 * Parse a RON amount from a form field. Accepts comma or dot decimals
 * ("15", "15.5", "15,50"). Returns null when blank/invalid.
 */
function parseRon(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Set the fleet-wide FLAT courier tariff (zone_id NULL) — what this fleet pays
 * its couriers per delivery, plus an optional COD bonus. Append-only: the prior
 * active flat row is expired (valid_until = now) and a new one inserted, so the
 * rate history stays auditable. Per-zone overrides are a later enhancement.
 */
export async function setFleetFlatTariffAction(
  formData: FormData,
): Promise<TariffActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const payoutRon = parseRon(formData.get('payout_ron'));
  const codBonusRon = parseRon(formData.get('cod_bonus_ron')) ?? 0;

  if (payoutRon === null) {
    return { ok: false, error: 'Tariful pe livrare e obligatoriu.' };
  }
  if (payoutRon < 0 || payoutRon > MAX_RON) {
    return { ok: false, error: `Tariful trebuie să fie între 0 și ${MAX_RON} RON.` };
  }
  if (codBonusRon < 0 || codBonusRon > MAX_RON) {
    return { ok: false, error: `Bonusul COD trebuie să fie între 0 și ${MAX_RON} RON.` };
  }

  const payoutCents = Math.round(payoutRon * 100);
  const codBonusCents = Math.round(codBonusRon * 100);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  // Atomic: expire the prior active flat tariff + insert the new one in ONE
  // transaction (DB function), so a partial failure or concurrent double-submit
  // can never leave the fleet with no rate or two active rates.
  const { error } = await sb.rpc('fn_set_fleet_flat_tariff', {
    p_fleet_id: ctx.fleetId,
    p_payout_cents: payoutCents,
    p_cod_bonus_cents: codBonusCents,
    p_created_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.tariff_updated',
    entityType: 'fleet',
    entityId: ctx.fleetId,
    metadata: {
      fleet_id: ctx.fleetId,
      payout_cents: payoutCents,
      cod_bonus_cents: codBonusCents,
    },
  });

  revalidatePath('/fleet/payouts');
  return { ok: true };
}

/**
 * On-demand generation of payout periods for the CURRENT Bucharest week
 * (stable [Mon, next-Mon) bounds, so re-running mid-week reuses the same
 * period). Lets a fleet manager see the running week's settlement without
 * waiting for the Monday cron. Idempotent — a delivery is paid at most once.
 *
 * Scoped to THIS fleet only (p_fleet_id) so a manager never triggers
 * platform-wide computation for other fleets.
 */
export async function generateCurrentWeekPayoutsAction(): Promise<TariffActionResult> {
  const ctx = await getFleetManagerContext();
  if (!ctx) return { ok: false, error: 'Acces interzis.' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { error } = await sb.rpc('fn_generate_courier_payouts_current_week_for_fleet', {
    p_fleet_id: ctx.fleetId,
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({
    actorUserId: ctx.userId,
    action: 'fleet.payouts_generated',
    entityType: 'fleet',
    entityId: ctx.fleetId,
    metadata: { fleet_id: ctx.fleetId },
  });

  revalidatePath('/fleet/payouts');
  return { ok: true };
}
