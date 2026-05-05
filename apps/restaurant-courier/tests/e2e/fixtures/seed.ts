// Test fixtures for the courier e2e suite.
//
// Each helper is idempotent — re-running a smoke after a flake should
// converge to the same DB state without leaking rows.
//
// Service-role only. Never imported from app code.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'E2E fixtures require NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.',
  );
}

export const adminSupabase: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const E2E_COURIER_EMAIL = process.env.E2E_COURIER_EMAIL ?? 'courier-e2e@hir.test';
export const E2E_COURIER_PASSWORD = process.env.E2E_COURIER_PASSWORD ?? 'Courier-E2E-Pass-2026';

/**
 * Ensure the e2e courier user exists, has a profile, and is attached to a
 * fleet. Returns the userId + fleetId so the test can scope its order seed.
 *
 * Strategy: look up by email via auth.admin.listUsers (page 1, ≤1000); if
 * absent, create with confirmed email. Then upsert courier_profiles. Fleet
 * is taken from E2E_FLEET_ID; if unset, we create or reuse a hidden test
 * fleet so the suite is fully self-contained.
 */
export async function seedCourier(): Promise<{ userId: string; fleetId: string }> {
  const fleetId = await ensureTestFleet();

  // Find user by email (paged search; the test inbox should be sparse).
  const { data: list, error: listErr } = await adminSupabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email?.toLowerCase() === E2E_COURIER_EMAIL.toLowerCase());

  if (!user) {
    const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
      email: E2E_COURIER_EMAIL,
      password: E2E_COURIER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Courier' },
    });
    if (createErr) throw createErr;
    user = created.user!;
  } else {
    // Force the password to the deterministic test value so previous test
    // runs that may have rotated it cannot lock the suite out.
    await adminSupabase.auth.admin.updateUserById(user.id, {
      password: E2E_COURIER_PASSWORD,
      email_confirm: true,
    });
  }

  await adminSupabase
    .from('courier_profiles')
    .upsert(
      {
        user_id: user.id,
        full_name: 'E2E Courier',
        phone: '+40700000000',
        vehicle_type: 'BIKE',
        status: 'ACTIVE',
        fleet_id: fleetId,
      },
      { onConflict: 'user_id' },
    );

  return { userId: user.id, fleetId };
}

async function ensureTestFleet(): Promise<string> {
  const explicit = process.env.E2E_FLEET_ID;
  if (explicit) return explicit;

  const { data: existing } = await adminSupabase
    .from('courier_fleets')
    .select('id')
    .eq('name', 'E2E Test Fleet')
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await adminSupabase
    .from('courier_fleets')
    .insert({ name: 'E2E Test Fleet', slug: 'e2e-test-fleet' })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

/**
 * Insert a CREATED order in the courier's fleet. Returns the order id so
 * the test can target it explicitly and clean up afterward.
 */
export async function seedOrder(fleetId: string): Promise<{ orderId: string }> {
  const trackToken = randomBytes(16).toString('hex');
  const { data, error } = await adminSupabase
    .from('courier_orders')
    .insert({
      fleet_id: fleetId,
      source_type: 'e2e_test',
      vertical: 'restaurant',
      customer_first_name: 'E2E Client',
      customer_phone: '+40700000001',
      pickup_line1: 'Strada Republicii 1, Brașov',
      pickup_lat: 45.6427,
      pickup_lng: 25.5887,
      dropoff_line1: 'Strada Lungă 100, Brașov',
      dropoff_lat: 45.6589,
      dropoff_lng: 25.5810,
      items: [{ name: 'Pizza Margherita', quantity: 1 }],
      total_ron: 45,
      delivery_fee_ron: 12,
      payment_method: 'COD',
      cod_amount_ron: 45,
      status: 'CREATED',
      public_track_token: trackToken,
      external_ref: `e2e-${randomUUID()}`,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { orderId: data.id as string };
}

export async function cleanupOrder(orderId: string): Promise<void> {
  await adminSupabase.from('courier_orders').delete().eq('id', orderId);
}

/**
 * End an active shift if the seeded courier left one open from a prior
 * flake. Idempotent: deletes ONLINE rows for this courier.
 */
export async function endAnyOpenShift(userId: string): Promise<void> {
  await adminSupabase
    .from('courier_shifts')
    .update({ status: 'ENDED', ended_at: new Date().toISOString() })
    .eq('courier_user_id', userId)
    .eq('status', 'ONLINE');
}
