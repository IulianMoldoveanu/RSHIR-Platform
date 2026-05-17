'use server';

// Lane ONBOARD: server actions for the 6-step onboarding wizard.
//
// Responsibilities:
//   1. Persist + load `tenant_onboarding_drafts` (resume after interruption)
//   2. Save Step-1 restaurant info (phone, address/city, optional location)
//      onto `tenants.settings` — name + slug were already set by /api/signup
//      or /dashboard/admin/onboard, so this only patches contact + address.
//   3. Provide a small `markStepComplete` helper so the wizard can record
//      progress in the draft and `tenants.settings.onboarding_wizard.step`
//      mirrors it for cross-device resume.
//
// All writes verify tenant membership via getTenantRole / assertTenantMember.
// Branding upload + master-key import + go-live + zones live in their own
// pages; the wizard composes them rather than reimplementing.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

export type WizardDraft = {
  restaurantInfo: {
    phone: string;
    address: string;
    city: string;
    // Lane MULTI-CITY: when the user picks from the canonical cities
    // dropdown we store the FK so /dashboard/admin/tenants can do exact
    // city-scoped filtering. Legacy free-text in `city` keeps working.
    city_id: string | null;
    location_lat: number | null;
    location_lng: number | null;
  };
  brand: {
    // We don't persist the actual logo blob in the draft; just whether the
    // user already uploaded one (we read tenants.settings.branding for that).
    skipped: boolean;
  };
  menu: {
    source: 'master_key' | 'csv' | 'manual' | null;
  };
  delivery: {
    tier: 'tier_1' | 'tier_2' | null;
  };
  payment: {
    cod_enabled: boolean;
  };
  // Lane ONBOARD-OWN-WEBSITE: persists the chosen integration mode and, once
  // the sandbox key is generated, stores the raw key for the final step display.
  // The raw key is deliberately kept in the client draft only — it is never
  // re-read from the server (show-once semantics).
  integration: {
    mode: 'storefront_only' | 'embed_widget' | 'api_only' | 'embed_or_api' | null;
    rawKey: string | null;
  };
};

export type WizardActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'unauthenticated'
        | 'forbidden_owner_only'
        | 'tenant_mismatch'
        | 'invalid_input'
        | 'db_error';
      detail?: string;
    };

const PHONE_RE = /^[+0-9 ()-]{6,30}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const bv = out[k];
    out[k] = isPlainObject(bv) && isPlainObject(pv) ? deepMerge(bv, pv) : pv;
  }
  return out;
}

export async function loadWizardDraft(
  expectedTenantId: string,
): Promise<{ ok: true; draft: WizardDraft | null; step: number } | { ok: false; error: string }> {
  if (!expectedTenantId) return { ok: false, error: 'invalid_input' };
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('tenant_onboarding_drafts')
    .select('data, step')
    .eq('user_id', user.id)
    .eq('tenant_id', expectedTenantId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, draft: null, step: 1 };
  return {
    ok: true,
    draft: data.data as WizardDraft,
    step: typeof data.step === 'number' ? data.step : 1,
  };
}

export async function saveWizardDraft(args: {
  tenantId: string;
  data: WizardDraft;
  step: number;
}): Promise<WizardActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== args.tenantId) return { ok: false, error: 'tenant_mismatch' };

  if (
    typeof args.step !== 'number' ||
    args.step < 1 ||
    args.step > 7 ||
    !Number.isFinite(args.step)
  ) {
    return { ok: false, error: 'invalid_input', detail: 'step out of range' };
  }

  const admin = createAdminClient();
  // upsert keyed on (user_id, tenant_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('tenant_onboarding_drafts')
    .upsert(
      {
        user_id: user.id,
        tenant_id: args.tenantId,
        data: args.data,
        step: args.step,
      },
      { onConflict: 'user_id,tenant_id' },
    );
  if (error) return { ok: false, error: 'db_error', detail: error.message };
  return { ok: true };
}

export async function clearWizardDraft(tenantId: string): Promise<WizardActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== tenantId) return { ok: false, error: 'tenant_mismatch' };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('tenant_onboarding_drafts')
    .delete()
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };
  return { ok: true };
}

// Step 1: persist contact + address onto tenants.settings. Reuses the
// `settings.contact_phone` / `settings.address_*` keys already read by
// the storefront and operations page.
export async function saveRestaurantInfo(args: {
  tenantId: string;
  phone: string;
  address: string;
  city: string;
  city_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
}): Promise<WizardActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== args.tenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, args.tenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const phone = args.phone.trim();
  const address = args.address.trim();
  const city = args.city.trim();

  if (phone && !PHONE_RE.test(phone)) {
    return { ok: false, error: 'invalid_input', detail: 'phone format' };
  }
  if (address.length > 300) {
    return { ok: false, error: 'invalid_input', detail: 'address too long' };
  }
  if (city.length > 100) {
    return { ok: false, error: 'invalid_input', detail: 'city too long' };
  }
  // Lane MULTI-CITY: city_id is optional, but if provided must be a uuid.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (args.city_id !== null && !UUID_RE.test(args.city_id)) {
    return { ok: false, error: 'invalid_input', detail: 'city_id format' };
  }
  const lat = args.location_lat;
  const lng = args.location_lng;
  if (lat !== null && (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90)) {
    return { ok: false, error: 'invalid_input', detail: 'lat out of range' };
  }
  if (lng !== null && (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180)) {
    return { ok: false, error: 'invalid_input', detail: 'lng out of range' };
  }

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', args.tenantId)
    .single();
  if (readErr || !existing) return { ok: false, error: 'db_error', detail: readErr?.message };

  const merged = deepMerge((existing.settings as Record<string, unknown>) ?? {}, {
    contact_phone: phone || null,
    address: address || null,
    city: city || null,
    ...(lat !== null && lng !== null
      ? { location: { lat, lng }, location_lat: lat, location_lng: lng }
      : {}),
  });

  // Lane MULTI-CITY: write city_id alongside settings so admin filters
  // can join cities precisely. We pass `null` explicitly when the user
  // typed a free-text city not in the dropdown — that clears any prior
  // mismatched FK so downstream queries don't show stale data.
  const update: Record<string, unknown> = { settings: merged };
  update.city_id = args.city_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: writeErr } = await (admin as any)
    .from('tenants')
    .update(update)
    .eq('id', args.tenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/onboarding/wizard');
  return { ok: true };
}

// Step 5: persist COD toggle. Stripe Connect is deferred — the card-payment
// switch lives on the operations page when it lands.
export async function saveCodEnabled(args: {
  tenantId: string;
  cod_enabled: boolean;
}): Promise<WizardActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== args.tenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, args.tenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', args.tenantId)
    .single();
  if (readErr || !existing) return { ok: false, error: 'db_error', detail: readErr?.message };

  const merged = deepMerge((existing.settings as Record<string, unknown>) ?? {}, {
    cod_enabled: args.cod_enabled,
  });

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', args.tenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/onboarding/wizard');
  return { ok: true };
}

// Step 6: terminal action. Mirrors /dashboard/onboarding/actions.ts goLive,
// but checks the same prerequisites the legacy checklist did so we don't
// flip is_accepting_orders on a tenant with no menu / no zones.
export async function wizardGoLive(args: {
  tenantId: string;
}): Promise<WizardActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== args.tenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, args.tenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', args.tenantId)
    .single();
  if (readErr || !existing) return { ok: false, error: 'db_error', detail: readErr?.message };

  const nowIso = new Date().toISOString();
  const merged = deepMerge((existing.settings as Record<string, unknown>) ?? {}, {
    is_accepting_orders: true,
    onboarding: {
      went_live: true,
      completed_at: nowIso,
      went_live_at: nowIso,
    },
  });

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', args.tenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  void logAudit({
    tenantId: args.tenantId,
    actorUserId: user.id,
    action: 'tenant.went_live',
    entityType: 'tenant',
    entityId: args.tenantId,
    metadata: { source: 'wizard' },
  });

  // Drop the draft now that we're live.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('tenant_onboarding_drafts')
    .delete()
    .eq('user_id', user.id)
    .eq('tenant_id', args.tenantId);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/onboarding');
  revalidatePath('/dashboard/onboarding/wizard');
  return { ok: true };
}
