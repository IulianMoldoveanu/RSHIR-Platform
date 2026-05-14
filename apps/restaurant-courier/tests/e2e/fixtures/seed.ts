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
    .eq('slug', 'e2e-test-fleet')
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
 * Insert a CREATED order in the courier's fleet. Returns the order id and
 * the customer name so the test can target THIS order specifically (a per-
 * test token is appended so concurrent or sequential E2E runs cannot
 * collide on getByText('E2E Client').first() when a prior crashed run left
 * orders behind in the DB).
 *
 * `customerName` is overridable so tests that want to assert on a
 * deterministic string can pass their own; default is a per-call token.
 */
export async function seedOrder(
  fleetId: string,
  opts: { customerName?: string } = {},
): Promise<{ orderId: string; customerName: string }> {
  const trackToken = randomBytes(16).toString('hex');
  const customerName =
    opts.customerName ?? `E2E Client ${randomBytes(3).toString('hex')}`;
  const { data, error } = await adminSupabase
    .from('courier_orders')
    .insert({
      fleet_id: fleetId,
      source_type: 'MANUAL',
      vertical: 'restaurant',
      customer_first_name: customerName,
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
  return { orderId: data.id as string, customerName };
}

export async function cleanupOrder(orderId: string): Promise<void> {
  await adminSupabase.from('courier_orders').delete().eq('id', orderId);
}

/**
 * Wipe ALL non-terminal courier_orders still assigned to the test courier.
 * Root cause of the long-standing 02-accept-deliver flake: when a prior
 * run crashed mid-test, leftover ACCEPTED/PICKED_UP rows stayed assigned
 * to the same synthetic courier. The next run's `getByText('E2E Client')
 * .first()` then matched the OLD row in the list, the swipe fired on the
 * stale orderId, and the assertion against the NEW orderId silently
 * failed (UI shows "Ridicată" for the stale row; DB row for the new
 * orderId stays ACCEPTED). Safe to delete unconditionally — the
 * synthetic test courier is never shared with prod users.
 */
export async function cleanupAssignedOrdersForCourier(userId: string): Promise<void> {
  await adminSupabase
    .from('courier_orders')
    .delete()
    .eq('assigned_courier_user_id', userId)
    .in('status', ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
}

/**
 * End an active shift if the seeded courier left one open from a prior
 * flake. Idempotent: closes ONLINE rows for this courier AND deletes any
 * stale ones to guarantee a clean state before each test. The previous
 * UPDATE-only version left rows in the table that interacted poorly with
 * concurrent inserts during retry passes; deleting all shifts for this
 * synthetic test courier is safe — no production user shares this email.
 */
export async function endAnyOpenShift(userId: string): Promise<void> {
  await adminSupabase.from('courier_shifts').delete().eq('courier_user_id', userId);
}
