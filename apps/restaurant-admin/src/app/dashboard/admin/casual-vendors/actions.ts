'use server';

// Admin oversight actions for CASUAL tenants.
//
// Stream UI-2 — pairs with /dashboard/admin/casual-vendors. Three actions:
//   - approveCasualVendor   (ONBOARDING → ACTIVE; the manual-review gate flip)
//   - suspendCasualVendor   (ACTIVE → SUSPENDED)
//   - restoreCasualVendor   (SUSPENDED → ACTIVE)
//
// All audited via logAudit('tenant.suspended' / 'tenant.reactivated'). Writes
// go through the service-role admin client; the only auth is the platform-
// admin allow-list (HIR_PLATFORM_ADMIN_EMAILS).
//
// Feature flag: HIR_FEATURE_CASUAL_VENDOR_ENABLED. Actions refuse when off so
// a half-rolled-back deploy can't mutate state through stale browser tabs.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { logAudit } from '@/lib/audit';

export type CasualActionResult =
  | { ok: true; status: 'ACTIVE' | 'SUSPENDED' }
  | { ok: false; error: string };

type TenantKindRow = {
  id: string;
  name: string;
  status: string;
  tenant_kind: string;
};

async function loadCasualTenant(
  tenantId: string,
): Promise<TenantKindRow | { error: string }> {
  if (!tenantId || typeof tenantId !== 'string') return { error: 'invalid_input' };
  if (process.env.HIR_FEATURE_CASUAL_VENDOR_ENABLED !== 'true') {
    return { error: 'feature_not_enabled' };
  }
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('tenants')
    .select('id, name, status, tenant_kind')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'tenant_not_found' };
  const row = data as TenantKindRow;
  if (row.tenant_kind !== 'CASUAL') return { error: 'not_casual_tenant' };
  return row;
}

async function applyStatus(
  tenantId: string,
  next: 'ACTIVE' | 'SUSPENDED',
  expectedFrom: ReadonlyArray<string>,
  auditAction: 'tenant.suspended' | 'tenant.reactivated',
): Promise<CasualActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) {
    return {
      ok: false,
      error: auth.status === 401 ? 'Nu sunteți autentificat.' : 'Acces interzis.',
    };
  }

  const tenant = await loadCasualTenant(tenantId);
  if ('error' in tenant) return { ok: false, error: tenant.error };

  if (!expectedFrom.includes(tenant.status)) {
    // Idempotent re-click on the target status — no-op success.
    if (tenant.status === next) return { ok: true, status: next };
    return { ok: false, error: `unexpected_status_${tenant.status}` };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { error: wErr } = await sb
    .from('tenants')
    .update({ status: next })
    .eq('id', tenantId);
  if (wErr) return { ok: false, error: wErr.message };

  void logAudit({
    tenantId,
    actorUserId: auth.userId,
    action: auditAction,
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      previous_status: tenant.status,
      new_status: next,
      tenant_name: tenant.name,
      tenant_kind: 'CASUAL',
    },
  });

  revalidatePath('/dashboard/admin/casual-vendors');
  return { ok: true, status: next };
}

/** ONBOARDING → ACTIVE (manual approval after CIF + brand review). */
export async function approveCasualVendor(args: {
  tenantId: string;
}): Promise<CasualActionResult> {
  return applyStatus(args.tenantId, 'ACTIVE', ['ONBOARDING'], 'tenant.reactivated');
}

/** ACTIVE → SUSPENDED (policy violation / unpaid subscription / manual halt). */
export async function suspendCasualVendor(args: {
  tenantId: string;
}): Promise<CasualActionResult> {
  return applyStatus(args.tenantId, 'SUSPENDED', ['ACTIVE'], 'tenant.suspended');
}

/** SUSPENDED → ACTIVE (lift suspension). */
export async function restoreCasualVendor(args: {
  tenantId: string;
}): Promise<CasualActionResult> {
  return applyStatus(args.tenantId, 'ACTIVE', ['SUSPENDED'], 'tenant.reactivated');
}
