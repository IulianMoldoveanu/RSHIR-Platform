'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = (typeof DAY_KEYS)[number];

export type OperationsSettings = {
  is_accepting_orders: boolean;
  pause_reason: string | null;
  pickup_eta_minutes: number;
  pickup_enabled: boolean;
  pickup_address: string | null;
  // Commerce thresholds (per-tenant, both stored in tenant.settings JSONB).
  // 0 means "not configured" — UI hides the corresponding nudge.
  min_order_ron: number;
  free_delivery_threshold_ron: number;
  // Delivery prep+driving time range surfaced on the storefront. 0 / 0
  // means "not configured" — falls back to the hardcoded /track default.
  delivery_eta_min_minutes: number;
  delivery_eta_max_minutes: number;
  // Cash-on-delivery (B9). When true, storefront checkout exposes a "Cash"
  // payment option that skips Stripe entirely.
  cod_enabled: boolean;
  opening_hours: Record<DayKey, { open: string; close: string }[]>;
  // Customer-facing contact + storefront map pin. WhatsApp drives the
  // header "Order on WhatsApp" CTA (wa.me link). Location lat/lng centers
  // the zones map and is the courier pickup origin. Empty string / null
  // hides the corresponding storefront affordance.
  whatsapp_phone: string | null;
  contact_phone: string | null;
  location_lat: number | null;
  location_lng: number | null;
};

export type OperationsActionResult =
  | { ok: true }
  | { ok: false; error: 'forbidden_owner_only' | 'unauthenticated' | 'invalid_input' | 'db_error'; detail?: string };

const HM_RE = /^(\d{1,2}):(\d{2})$/;

function sanitizeWindow(raw: unknown): { open: string; close: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as { open?: unknown; close?: unknown };
  if (typeof w.open !== 'string' || typeof w.close !== 'string') return null;
  const om = HM_RE.exec(w.open);
  const cm = HM_RE.exec(w.close);
  if (!om || !cm) return null;
  const o = Number(om[1]) * 60 + Number(om[2]);
  const c = Number(cm[1]) * 60 + Number(cm[2]);
  if (o < 0 || o >= 1440 || c <= o || c > 1440) return null;
  return { open: w.open, close: w.close };
}

// RSHIR-22: deep-merge for tenants.settings. The previous shallow spread
// let a partial opening_hours payload (e.g. just `{mon: [...]}`) clobber
// every other day. We recurse on plain objects and replace arrays
// wholesale — opening_hours is one whole object so array-replace is the
// intended behavior for any leaf arrays inside it.
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

function sanitizeHours(raw: unknown): Record<DayKey, { open: string; close: string }[]> {
  const out: Record<DayKey, { open: string; close: string }[]> = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
  };
  if (!raw || typeof raw !== 'object') return out;
  for (const day of DAY_KEYS) {
    const v = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(v)) continue;
    out[day] = v.map(sanitizeWindow).filter((w): w is { open: string; close: string } => w !== null);
  }
  return out;
}

export async function saveOperationsAction(
  input: OperationsSettings,
  expectedTenantId: string,
): Promise<OperationsActionResult> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  // RSHIR-26 M-3: caller passes the tenantId rendered server-side. Refuse
  // the write if the cookie-derived active tenant has drifted (multi-tenant
  // tab race).
  if (!expectedTenantId || tenant.id !== expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenant_mismatch' };
  }
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  if (typeof input?.is_accepting_orders !== 'boolean') {
    return { ok: false, error: 'invalid_input' };
  }
  const eta = Number(input.pickup_eta_minutes);
  if (!Number.isFinite(eta) || eta < 1 || eta > 480) {
    return { ok: false, error: 'invalid_input', detail: 'pickup_eta_minutes must be 1-480' };
  }

  const cleanReason =
    typeof input.pause_reason === 'string' ? input.pause_reason.trim().slice(0, 200) : '';

  const cleanPickupAddress =
    typeof input.pickup_address === 'string' ? input.pickup_address.trim().slice(0, 200) : '';

  const minOrder = Number(input.min_order_ron);
  if (!Number.isFinite(minOrder) || minOrder < 0 || minOrder > 5000) {
    return { ok: false, error: 'invalid_input', detail: 'min_order_ron must be 0–5000' };
  }
  const freeThreshold = Number(input.free_delivery_threshold_ron);
  if (!Number.isFinite(freeThreshold) || freeThreshold < 0 || freeThreshold > 5000) {
    return { ok: false, error: 'invalid_input', detail: 'free_delivery_threshold_ron must be 0–5000' };
  }
  const etaMin = Number(input.delivery_eta_min_minutes);
  const etaMax = Number(input.delivery_eta_max_minutes);
  if (!Number.isFinite(etaMin) || etaMin < 0 || etaMin > 240) {
    return { ok: false, error: 'invalid_input', detail: 'delivery_eta_min_minutes must be 0–240' };
  }
  if (!Number.isFinite(etaMax) || etaMax < 0 || etaMax > 240) {
    return { ok: false, error: 'invalid_input', detail: 'delivery_eta_max_minutes must be 0–240' };
  }
  // If both are set, max must be ≥ min — clamp to keep persisted state sane.
  const safeMax = etaMin > 0 && etaMax > 0 && etaMax < etaMin ? etaMin : etaMax;

  // Phones: trim + bound length. Loose digits/punct check, the storefront
  // strips non-digits before forming wa.me URLs anyway.
  const phoneRe = /^[+\d][\d\s()-]{5,24}$/;
  const cleanWhatsapp =
    typeof input.whatsapp_phone === 'string' ? input.whatsapp_phone.trim().slice(0, 30) : '';
  if (cleanWhatsapp && !phoneRe.test(cleanWhatsapp)) {
    return { ok: false, error: 'invalid_input', detail: 'whatsapp_phone format' };
  }
  const cleanContact =
    typeof input.contact_phone === 'string' ? input.contact_phone.trim().slice(0, 30) : '';
  if (cleanContact && !phoneRe.test(cleanContact)) {
    return { ok: false, error: 'invalid_input', detail: 'contact_phone format' };
  }

  // Location: store as numbers under settings.location.{lat,lng} so it
  // matches the shape the storefront and zones map already read. null on
  // either side means "not configured" — both storefront and zones map
  // fall back to a city-level default.
  const lat = input.location_lat;
  const lng = input.location_lng;
  const safeLat =
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const safeLng =
    typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;
  if ((safeLat === null) !== (safeLng === null)) {
    return { ok: false, error: 'invalid_input', detail: 'location_partial' };
  }

  const payload = {
    is_accepting_orders: input.is_accepting_orders,
    pause_reason: cleanReason || null,
    pickup_eta_minutes: Math.round(eta),
    pickup_enabled: input.pickup_enabled !== false,
    pickup_address: cleanPickupAddress || null,
    min_order_ron: Math.round(minOrder * 100) / 100,
    free_delivery_threshold_ron: Math.round(freeThreshold * 100) / 100,
    delivery_eta_min_minutes: Math.round(etaMin),
    delivery_eta_max_minutes: Math.round(safeMax),
    cod_enabled: input.cod_enabled === true,
    opening_hours: sanitizeHours(input.opening_hours),
    whatsapp_phone: cleanWhatsapp || null,
    contact_phone: cleanContact || null,
    location: safeLat !== null && safeLng !== null ? { lat: safeLat, lng: safeLng } : null,
  };

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !existing) return { ok: false, error: 'db_error', detail: readErr?.message };

  const merged = deepMerge(
    (existing.settings as Record<string, unknown>) ?? {},
    payload as unknown as Record<string, unknown>,
  );

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', expectedTenantId);
  if (writeErr) return { ok: false, error: 'db_error', detail: writeErr.message };

  revalidatePath('/dashboard/settings/operations');
  return { ok: true };
}
