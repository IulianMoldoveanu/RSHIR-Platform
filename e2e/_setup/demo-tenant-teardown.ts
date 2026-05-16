/**
 * @e2e-only
 *
 * Teardown helper for the demo tenant created by demo-tenant-seed.ts.
 *
 * Best-effort: most child rows go away via ON DELETE CASCADE when the
 * parent tenant row is dropped (see supabase/migrations/20260425_000_initial.sql).
 * We only need to explicitly delete the auth user(s) and tenant row;
 * everything else falls out.
 *
 * Safe to call even when nothing was seeded — every delete is keyed on the
 * specific tenantId / known email and a missing row is not an error.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEMO_COURIER_EMAIL } from './demo-tenant-seed';

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'demo-tenant-teardown requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + ' +
        'SUPABASE_SERVICE_ROLE_KEY at run time.',
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Delete the demo tenant + cascade everything it owns (orders, menu_items,
 * customers, addresses, tenant_members). Then delete the courier auth user
 * + their courier_profiles row (also cascades via FK to auth.users).
 */
export async function cleanupDemoTenant(tenantId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getAdminClient() as any;

  // Tenant delete cascades menu_categories, menu_items, orders, customers,
  // customer_addresses (via customer_id), tenant_members and the rest.
  // Errors on a non-existent row are not surfaced — best-effort by contract.
  await sb.from('tenants').delete().eq('id', tenantId);

  // Drop the courier auth user if present. courier_profiles cascades via FK
  // to auth.users(id).
  const list = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const courier = list.data?.users.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (u: any) => u.email?.toLowerCase() === DEMO_COURIER_EMAIL.toLowerCase(),
  );
  if (courier) {
    await sb.auth.admin.deleteUser(courier.id);
  }
}
