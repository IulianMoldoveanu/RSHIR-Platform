'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { checkPlatformAdmin } from '@/lib/platform-admin';

const REVALIDATE = '/admin/couriers';

export type ActionResult = { ok: true } | { ok: false; error: string };

// Orders mid-flight for THIS courier. Moving them to another fleet while one of
// these is open would orphan an in-progress delivery in the old fleet, so the
// transfer is blocked until it is finished. OFFERED is included because the
// offer RPC sets assigned_courier_user_id.
const LIVE_ORDER_STATUSES = ['OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

/**
 * Transfer a courier to another fleet (and optionally another city).
 *
 * Enforces "1 account = 1 city": a courier keeps a single courier_profiles.city
 * (text, captured at onboarding), reassigned only here. Records every move in
 * courier_transfers. Platform-admin only.
 */
export async function transferCourierAction(formData: FormData): Promise<ActionResult> {
  const guard = await checkPlatformAdmin();
  if ('error' in guard) return { ok: false, error: guard.error };

  const courierUserId = (formData.get('courier_user_id') as string | null)?.trim() ?? '';
  const toFleetId = (formData.get('to_fleet_id') as string | null)?.trim() ?? '';
  const toCity = (formData.get('to_city') as string | null)?.trim() || null;
  const reason = (formData.get('reason') as string | null)?.trim() || null;

  if (!courierUserId) return { ok: false, error: 'Curier lipsă.' };
  if (!toFleetId) return { ok: false, error: 'Selectează flota destinație.' };

  const sb = createAdminClientUntyped();

  // Current profile → records the "from" side and lets us detect a no-op.
  const { data: profile, error: profErr } = await sb
    .from('courier_profiles')
    .select('user_id, fleet_id, city')
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
  const fromCity: string | null = profile.city ?? null;
  // Keep the existing city if the admin did not pick a new one.
  const newCity: string | null = toCity ?? fromCity;

  if (fromFleetId === toFleetId && newCity === fromCity) {
    return { ok: false, error: 'Curierul este deja în această flotă și acest oraș.' };
  }

  const { error: updErr } = await sb
    .from('courier_profiles')
    .update({ fleet_id: toFleetId, city: newCity })
    .eq('user_id', courierUserId);
  if (updErr) return { ok: false, error: updErr.message };

  const { error: auditErr } = await sb.from('courier_transfers').insert({
    courier_user_id: courierUserId,
    from_fleet_id: fromFleetId,
    to_fleet_id: toFleetId,
    from_city: fromCity,
    to_city: newCity,
    reason,
    transferred_by: guard.userId,
  });
  if (auditErr) {
    // The move already succeeded; a failed audit insert must not roll it back.
    console.error('[courier-transfer] audit insert failed', auditErr.message);
  }

  revalidatePath(REVALIDATE);
  return { ok: true };
}
