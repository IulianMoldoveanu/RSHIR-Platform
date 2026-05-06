/**
 * Seed helpers for the multi-city E2E suite.
 *
 * All functions use the Supabase service-role key so they can bypass RLS.
 * Never import this from app code.
 *
 * Idempotent: safe to call in beforeEach without accumulating stale rows.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Multi-city E2E fixtures require NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
  );
}

export const adminSupabase: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Env-configured test identities ──────────────────────────────────────────
export const E2E_ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? 'platform-admin-e2e@hir.test';
export const E2E_ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? 'Admin-E2E-Pass-2026';

export const E2E_TENANT_OWNER_EMAIL =
  process.env.E2E_TENANT_OWNER_EMAIL ?? 'tenant-owner-e2e@hir.test';
export const E2E_TENANT_OWNER_PASSWORD =
  process.env.E2E_TENANT_OWNER_PASSWORD ?? 'Owner-E2E-Pass-2026';

// ── User helpers ─────────────────────────────────────────────────────────────

/**
 * Ensure a test user with the given email exists in auth.users, with the
 * given password set deterministically. Returns the userId.
 */
export async function ensureUser(email: string, password: string): Promise<string> {
  const { data: list } = await adminSupabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (existing) {
    await adminSupabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    return existing.id;
  }

  const { data: created, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test User' },
  });
  if (error) throw error;
  return created.user!.id;
}

// ── Tenant helpers ───────────────────────────────────────────────────────────

/**
 * Ensure a test tenant owned by `ownerId` exists. The tenant has a NULL
 * city_id so the admin can assign one inline during the test.
 *
 * Returns the tenantId. Idempotent — same slug reused on re-runs.
 */
export async function ensureTestTenant(ownerId: string): Promise<string> {
  const TEST_TENANT_SLUG = 'e2e-multi-city-test-tenant';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;

  const { data: existing } = await sb
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT_SLUG)
    .maybeSingle();

  let tenantId: string;

  if (existing?.id) {
    tenantId = existing.id as string;
    // Ensure city_id is NULL so the "Setează oraș" button is visible.
    await sb
      .from('tenants')
      .update({ city_id: null })
      .eq('id', tenantId);
  } else {
    const { data: created, error } = await sb
      .from('tenants')
      .insert({
        slug: TEST_TENANT_SLUG,
        name: 'E2E Multi-City Test Restaurant',
        vertical: 'RESTAURANT',
        status: 'ACTIVE',
        settings: { city: '' },
        city_id: null,
      })
      .select('id')
      .single();
    if (error) throw error;
    tenantId = created.id as string;
  }

  // Ensure the owner membership exists.
  await sb
    .from('tenant_members')
    .upsert(
      { tenant_id: tenantId, user_id: ownerId, role: 'OWNER' },
      { onConflict: 'tenant_id,user_id' },
    );

  return tenantId;
}

/**
 * Remove the city_id assigned to the test tenant, restoring it to the
 * NULL state for subsequent test runs.
 */
export async function resetTestTenantCity(tenantId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  await sb
    .from('tenants')
    .update({ city_id: null, settings: { city: '' } })
    .eq('id', tenantId);
}

/**
 * Read the city_id currently assigned to a tenant. Used for post-action
 * assertions in onboarding + admin-inline tests.
 */
export async function getTenantCityId(tenantId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  const { data } = await sb
    .from('tenants')
    .select('city_id')
    .eq('id', tenantId)
    .single();
  return (data?.city_id as string | null) ?? null;
}

/**
 * Look up the uuid for a city by slug. Returns null if the cities table
 * doesn't exist or the slug isn't seeded (build-time safety).
 */
export async function getCityIdBySlug(slug: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  const { data } = await sb
    .from('cities')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

// ── Inventory v1 helpers ────────────────────────────────────────────────────

/**
 * Toggle the inventory_enabled feature flag on a tenant. Used by the
 * inventory-recipe-link spec to enable Premium gating during the test
 * and reset to off afterwards.
 */
export async function setInventoryEnabled(
  tenantId: string,
  enabled: boolean,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  const { data: row } = await sb
    .from('tenants')
    .select('feature_flags')
    .eq('id', tenantId)
    .maybeSingle();
  const flags = (row?.feature_flags ?? {}) as Record<string, unknown>;
  flags.inventory_enabled = enabled;
  await sb.from('tenants').update({ feature_flags: flags }).eq('id', tenantId);
}

/**
 * Ensure at least one menu item exists for `tenantId` so the recipe-link
 * dropdown has options. Returns the menu_item id. Idempotent.
 */
export async function ensureTestMenuItem(tenantId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  const E2E_ITEM_NAME = 'E2E Inventory Test Burger';

  const { data: existing } = await sb
    .from('restaurant_menu_items')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', E2E_ITEM_NAME)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: existingCat } = await sb
    .from('restaurant_menu_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  let categoryId: string | null = (existingCat?.id as string | null) ?? null;
  if (!categoryId) {
    const { data: createdCat, error: catErr } = await sb
      .from('restaurant_menu_categories')
      .insert({
        tenant_id: tenantId,
        name: 'E2E Test Category',
        sort_order: 0,
        is_active: true,
      })
      .select('id')
      .single();
    if (catErr) throw catErr;
    categoryId = createdCat.id as string;
  }

  const { data: created, error } = await sb
    .from('restaurant_menu_items')
    .insert({
      tenant_id: tenantId,
      category_id: categoryId,
      name: E2E_ITEM_NAME,
      price_ron: 25,
      is_available: true,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

/**
 * Remove every inventory_item + menu_item_recipe row owned by `tenantId`.
 * Composite FK cascades the recipes when items go.
 */
export async function clearTenantInventory(tenantId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  await sb.from('menu_item_recipes').delete().eq('tenant_id', tenantId);
  await sb.from('inventory_items').delete().eq('tenant_id', tenantId);
}

export async function readRecipeRowsForTenant(
  tenantId: string,
): Promise<Array<{ menu_item_id: string; inventory_item_id: string; qty_per_serving: number }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = adminSupabase as any;
  const { data } = await sb
    .from('menu_item_recipes')
    .select('menu_item_id, inventory_item_id, qty_per_serving')
    .eq('tenant_id', tenantId);
  return (data ?? []) as Array<{ menu_item_id: string; inventory_item_id: string; qty_per_serving: number }>;
}
