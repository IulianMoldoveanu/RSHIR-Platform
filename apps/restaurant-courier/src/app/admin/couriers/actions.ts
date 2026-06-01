'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPlatformAdmin } from '@/lib/platform-admin';

const REVALIDATE = '/admin/couriers';

export type ActionResult = { ok: true } | { ok: false; error: string };

// Orders that are mid-flight for THIS courier — moving them to another fleet
// while one of these is open would orphan an in-progress delivery in the old
// fleet, so we block the transfer until it is finished.
const LIVE_ORDER_STATUSES = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

/**
 * Transfer a courier to another fleet (and optionally another city).
 *
 * Enforces the "1 account = 1 city" rule: a courier keeps a single
 * courier_profiles.city_id, reassigned only here. Records every move in
 * courier_transfers for a full paper trail. Platform-admin only.
 */
export async function transferCourierAction(formData: FormData): Promise<ActionResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const courierUserId = (formData.get('courier_user_id') as string | null)?.trim() ?? '';
  const toFleetId = (formData.get('to_fleet_id') as string | null)?.trim() ?? '';
  const toCityId = (formData.get('to_city_id') as string | null)?.trim() || null;
  const reason = (formData.get('reason') as string | null)?.trim() || null;

  if (!courierUserId) return { ok: false, error: 'Curier lipsă.' };
  if (!toFleetId) return { ok: false, error: 'Selectează flota destinație.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  // Current profile → records the "from" side and lets us detect a no-op.
  const { data: profile, error: profErr } = await sb
    .from('courier_profiles')
    .select('user_id, fleet_id, city_id')
    .eq('user_id', courierUserId)
    .maybeSingle();
  if (profErr) return { ok: false, error: profErr.message };
  if (!profile) return { ok: false, error: 'Curierul nu există.' };

  // Destination fleet must exist and be active.
  const { data: fleet, error: fleetErr } = await sb
    .from('courier_fleets')
    .select('id, is_active')
    .eq('id', toFleetId)
    .maybeSingle();
  if (fleetErr) return { ok: false, error: fleetErr.message };
  if (!fleet) return { ok: false, error: 'Flota destinație nu există.' };
  if (fleet.is_active === false) return { ok: false, error: 'Flota destinație este inactivă.' };

  // If a city is chosen it must exist (any catalog city, active or not — that
  // is how HIR onboards into a new market).
  if (toCityId) {
    const { data: city, error: cityErr } = await sb
      .from('cities')
      .select('id')
      .eq('id', toCityId)
      .maybeSingle();
    if (cityErr) return { ok: false, error: cityErr.message };
    if (!city) return { ok: false, error: 'Orașul selectat nu există.' };
  }

  // Block while a delivery is in progress.
  const { data: liveOrders, error: ordersErr } = await sb
    .from('courier_orders')
    .select('id')
    .eq('assigned_courier_user_id', courierUserId)
    .in('status', LIVE_ORDER_STATUSES)
    .limit(1);
  if (ordersErr) return { ok: false, error: ordersErr.message };
  if (liveOrders && liveOrders.length > 0) {
    return {
      ok: false,
      error: 'Curierul are o comandă activă. Transferul e blocat până o finalizează.',
    };
  }

  const fromFleetId: string | null = profile.fleet_id ?? null;
  const fromCityId: string | null = profile.city_id ?? null;
  // Keep the existing city if the admin did not pick a new one.
  const newCityId: string | null = toCityId ?? fromCityId;

  if (fromFleetId === toFleetId && newCityId === fromCityId) {
    return { ok: false, error: 'Curierul este deja în această flotă și acest oraș.' };
  }

  const { error: updErr } = await sb
    .from('courier_profiles')
    .update({ fleet_id: toFleetId, city_id: newCityId })
    .eq('user_id', courierUserId);
  if (updErr) return { ok: false, error: updErr.message };

  // Durable audit trail (RLS: courier can read their own row).
  const { error: auditErr } = await sb.from('courier_transfers').insert({
    courier_user_id: courierUserId,
    from_fleet_id: fromFleetId,
    to_fleet_id: toFleetId,
    from_city_id: fromCityId,
    to_city_id: newCityId,
    reason,
    transferred_by: guard.userId,
  });
  if (auditErr) {
    // The move already succeeded; a failed audit insert must not roll it back,
    // but surface it so it is not silently lost.
    console.error('[courier-transfer] audit insert failed', auditErr.message);
  }

  revalidatePath(REVALIDATE);
  return { ok: true };
}
