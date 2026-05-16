/**
 * @e2e-only
 *
 * Demo-tenant seed helper for the happy-path E2E suite (Wave 4-A / 4-C).
 *
 * Provides a deterministic, idempotent tenant + menu + (optional) courier
 * fixture so the customer-payment-sandbox, storefront-happy-path and
 * courier-happy-path specs can drive /api/checkout/intent and the courier
 * lifecycle end-to-end without depending on whatever happens to be seeded
 * in the target environment.
 *
 * Uses the Supabase service-role key so it can bypass RLS. Test-time only —
 * NEVER import this from app code.
 *
 * Idempotent: every "create" is preceded by a select; second run finds and
 * updates existing rows rather than creating duplicates.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Deterministic identifiers ───────────────────────────────────────────────
export const DEMO_TENANT_SLUG = 'e2e-demo';
export const DEMO_TENANT_NAME = 'E2E Demo Restaurant';
export const DEMO_TENANT_CITY = 'Brașov';
export const DEMO_COURIER_EMAIL = 'e2e-courier@test.hir.ro';
export const DEMO_COURIER_PASSWORD = 'Courier-E2E-Pass-2026';

export const DEMO_MENU_CATEGORY_NAME = 'E2E Demo Meniu';

export const DEMO_MENU_ITEMS = [
  { name: 'Pizza Margherita', priceRon: 35 },
  { name: 'Burger Clasic', priceRon: 28 },
  { name: 'Apă plată', priceRon: 5 },
] as const;

export type PaymentMode =
  | { mode: 'cod_only' }
  | { mode: 'card_sandbox'; provider: 'netopia' | 'viva' };

export interface SeedDemoTenantOptions {
  /**
   * If set, writes tenants.settings.payments = { mode, provider? } so the
   * /api/checkout/intent route routes to the correct sandbox surface.
   *
   * When unset, the tenant's payments settings are left untouched.
   */
  paymentMode?: PaymentMode;
  /**
   * When true, ensures a courier auth user + courier_profiles row exists
   * tied to the demo tenant. Used by courier-happy-path.spec.ts.
   */
  withCourier?: boolean;
}

export interface SeededMenuItem {
  id: string;
  name: string;
  priceRon: number;
}

export interface SeededDemoTenant {
  tenantId: string;
  slug: string;
  courierId?: string;
  menuItems: SeededMenuItem[];
}

// ── Supabase admin client (service-role) ────────────────────────────────────
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'demo-tenant-seed requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + ' +
        'SUPABASE_SERVICE_ROLE_KEY at run time.',
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Seed (or refresh) the canonical demo tenant. Returns the ids needed by
 * the specs to drive their fixtures.
 *
 * Internal client typed as `any` because the e2e suite intentionally does
 * not pull in the generated `supabase-types` package — keeps the helper
 * usable from any worktree without an extra build step.
 */
export async function seedDemoTenant(
  options: SeedDemoTenantOptions = {},
): Promise<SeededDemoTenant> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getAdminClient() as any;

  const tenantId = await upsertTenant(sb, options.paymentMode);
  const categoryId = await upsertCategory(sb, tenantId);
  const menuItems = await upsertMenuItems(sb, tenantId, categoryId);

  let courierId: string | undefined;
  if (options.withCourier) {
    courierId = await ensureCourierForTenant(sb, tenantId);
  }

  return {
    tenantId,
    slug: DEMO_TENANT_SLUG,
    courierId,
    menuItems,
  };
}

// ── Internals ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertTenant(sb: any, paymentMode: PaymentMode | undefined): Promise<string> {
  const settings: Record<string, unknown> = { city: DEMO_TENANT_CITY };
  if (paymentMode) {
    settings.payments =
      paymentMode.mode === 'cod_only'
        ? { mode: 'cod_only' }
        : { mode: 'card_sandbox', provider: paymentMode.provider };
  }

  const { data: existing } = await sb
    .from('tenants')
    .select('id, settings')
    .eq('slug', DEMO_TENANT_SLUG)
    .maybeSingle();

  if (existing?.id) {
    // Merge into existing settings to avoid clobbering unrelated keys that
    // sibling fixtures (or operator overrides) may have written.
    const merged = {
      ...(existing.settings ?? {}),
      ...settings,
      ...(paymentMode ? { payments: settings.payments } : {}),
    };
    const { error } = await sb
      .from('tenants')
      .update({
        name: DEMO_TENANT_NAME,
        status: 'ACTIVE',
        settings: merged,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: created, error } = await sb
    .from('tenants')
    .insert({
      slug: DEMO_TENANT_SLUG,
      name: DEMO_TENANT_NAME,
      vertical: 'RESTAURANT',
      status: 'ACTIVE',
      settings,
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertCategory(sb: any, tenantId: string): Promise<string> {
  const { data: existing } = await sb
    .from('restaurant_menu_categories')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', DEMO_MENU_CATEGORY_NAME)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await sb
    .from('restaurant_menu_categories')
    .insert({
      tenant_id: tenantId,
      name: DEMO_MENU_CATEGORY_NAME,
      sort_order: 0,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id as string;
}

async function upsertMenuItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  tenantId: string,
  categoryId: string,
): Promise<SeededMenuItem[]> {
  const out: SeededMenuItem[] = [];
  for (const [idx, item] of DEMO_MENU_ITEMS.entries()) {
    const { data: existing } = await sb
      .from('restaurant_menu_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', item.name)
      .maybeSingle();
    if (existing?.id) {
      out.push({ id: existing.id as string, name: item.name, priceRon: item.priceRon });
      continue;
    }
    const { data: created, error } = await sb
      .from('restaurant_menu_items')
      .insert({
        tenant_id: tenantId,
        category_id: categoryId,
        name: item.name,
        price_ron: item.priceRon,
        is_available: true,
        sort_order: idx,
      })
      .select('id')
      .single();
    if (error) throw error;
    out.push({ id: created.id as string, name: item.name, priceRon: item.priceRon });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCourierForTenant(sb: any, tenantId: string): Promise<string> {
  // Idempotent auth.users lookup. Mirrors ensureUser in multi-city/fixtures/seed.ts
  // but inlined here to keep this helper a single-file import.
  const list = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = list.data?.users.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (u: any) => u.email?.toLowerCase() === DEMO_COURIER_EMAIL.toLowerCase(),
  );

  let userId: string;
  if (existingUser) {
    userId = existingUser.id as string;
    await sb.auth.admin.updateUserById(userId, {
      password: DEMO_COURIER_PASSWORD,
      email_confirm: true,
    });
  } else {
    const created = await sb.auth.admin.createUser({
      email: DEMO_COURIER_EMAIL,
      password: DEMO_COURIER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'E2E Demo Courier' },
    });
    if (created.error) throw created.error;
    userId = created.data.user!.id as string;
  }

  // Upsert courier_profiles. Primary key is user_id so onConflict is trivial.
  const { error: profileErr } = await sb
    .from('courier_profiles')
    .upsert(
      {
        user_id: userId,
        full_name: 'E2E Demo Courier',
        phone: '+40712345679',
        vehicle_type: 'BIKE',
        status: 'ACTIVE',
      },
      { onConflict: 'user_id' },
    );
  if (profileErr) throw profileErr;

  // Best-effort tenant membership so the courier can be matched to a tenant
  // by the dispatcher. tenant_members has a check (role in ('OWNER','STAFF'))
  // — couriers are typically STAFF in the e2e fixtures.
  await sb
    .from('tenant_members')
    .upsert(
      { tenant_id: tenantId, user_id: userId, role: 'STAFF' },
      { onConflict: 'tenant_id,user_id' },
    );

  return userId;
}
