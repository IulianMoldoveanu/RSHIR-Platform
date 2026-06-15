'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// /fleet/tariffs server actions — fleet manager sets two pickup+per_km
// tariffs in one place: what they PAY couriers + what they CHARGE vendors.
// Both write to the same source of truth (fleet_courier_tariffs +
// fleet_vendor_tariffs) that the courier app reads — so a save here
// reflects instantly in the courier's /fleet/earnings calculation and
// in the Monday payout cron.

type Kind = 'courier' | 'vendor';

const MAX_RON = 1000;

function parseRon(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function requireFleetOwner(): Promise<{
  ok: true;
  userId: string;
  fleetId: string;
} | { ok: false; error: string }> {
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { ok: false, error: 'Neautentificat.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: fleet } = await admin
    .from('courier_fleets')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!fleet?.id) return { ok: false, error: 'Niciun fleet asociat contului.' };
  return { ok: true, userId: user.id, fleetId: fleet.id as string };
}

export async function setFleetPickupKmTariffAction(
  kind: Kind,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireFleetOwner();
  if (!gate.ok) return gate;

  const pickup = parseRon(formData.get('pickup_fee_ron'));
  const perKm = parseRon(formData.get('per_km_ron'));
  const cod = parseRon(formData.get('cod_bonus_ron')) ?? 0;

  if (pickup === null || perKm === null) {
    return { ok: false, error: 'Tariful de pickup si tariful per km sunt obligatorii.' };
  }
  if (pickup < 0 || pickup > MAX_RON || perKm < 0 || perKm > MAX_RON || cod < 0 || cod > MAX_RON) {
    return { ok: false, error: `Valorile trebuie sa fie intre 0 si ${MAX_RON} RON.` };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).rpc('fn_set_fleet_pickup_km_tariff', {
    p_fleet_id: gate.fleetId,
    p_table_name: kind,
    p_pickup_fee_cents: Math.round(pickup * 100),
    p_per_km_cents: Math.round(perKm * 100),
    p_cod_bonus_cents: Math.round(cod * 100),
    p_created_by: gate.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/fleet/tariffs');
  revalidatePath('/fleet');
  return { ok: true };
}
