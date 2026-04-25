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
  opening_hours: Record<DayKey, { open: string; close: string }[]>;
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

  const payload = {
    is_accepting_orders: input.is_accepting_orders,
    pause_reason: cleanReason || null,
    pickup_eta_minutes: Math.round(eta),
    pickup_enabled: input.pickup_enabled !== false,
    pickup_address: cleanPickupAddress || null,
    opening_hours: sanitizeHours(input.opening_hours),
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
