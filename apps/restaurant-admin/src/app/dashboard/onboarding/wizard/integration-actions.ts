'use server';

// Lane ONBOARD-OWN-WEBSITE — server action for the "integration mode" step
// of the onboarding wizard. Called when the tenant selects how they want
// to receive orders (widget, API, storefront, or both).
//
// If the chosen mode implies external integration (anything except
// storefront_only), a sandbox API key is auto-generated so the tenant
// sees the snippet on the final step without an extra click.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import { createSandboxKey } from '../../settings/integrations/api/actions';

export type IntegrationMode =
  | 'storefront_only'
  | 'embed_widget'
  | 'api_only'
  | 'embed_or_api';

const VALID_MODES: IntegrationMode[] = [
  'storefront_only',
  'embed_widget',
  'api_only',
  'embed_or_api',
];

export type SetIntegrationModeResult =
  | { ok: true; rawKey: string | null }
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

export async function setIntegrationMode(
  tenantId: string,
  mode: IntegrationMode,
): Promise<SetIntegrationModeResult> {
  if (!tenantId) return { ok: false, error: 'invalid_input', detail: 'missing tenantId' };
  if (!VALID_MODES.includes(mode)) {
    return { ok: false, error: 'invalid_input', detail: `unknown mode: ${mode}` };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null as null,
    tenant: null as null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== tenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, tenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  // 1. Persist integration_mode in tenants.settings (JSONB — no migration needed)
  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();
  if (readErr || !existing) {
    return { ok: false, error: 'db_error', detail: readErr?.message };
  }

  const merged = deepMerge((existing.settings as Record<string, unknown>) ?? {}, {
    integration_mode: mode,
  });

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', tenantId);
  if (writeErr) {
    return { ok: false, error: 'db_error', detail: writeErr.message };
  }

  void logAudit({
    tenantId,
    actorUserId: user.id,
    action: 'tenant.integration_mode_set',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { mode },
  });

  // 2. Auto-provision sandbox API key for any mode that implies external integration
  let rawKey: string | null = null;
  if (mode !== 'storefront_only') {
    const keyResult = await createSandboxKey(tenantId);
    if (keyResult.ok) {
      rawKey = keyResult.rawKey;
    }
    // Key creation failure is non-fatal: tenant can generate manually from
    // /dashboard/settings/integrations/api later.
  }

  revalidatePath('/dashboard/onboarding/wizard');
  return { ok: true, rawKey };
}
