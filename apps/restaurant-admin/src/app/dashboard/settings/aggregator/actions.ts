'use server';

// Lane HIRforYOU-MARKETPLACE (2026-05-28) — server actions for the
// patron-facing marketplace opt-in page.
//
// All actions are OWNER-gated. The toggle flips `tenants.aggregator_enabled`
// and `tenants.aggregator_visibility`; the public directory materialized
// view refreshes nightly so the change takes up to 24h to surface (or
// instantly on a manual refresh — admin TODO).

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

const SETTINGS_PATH = '/dashboard/settings/aggregator';

export type ActionResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };

async function requireOwner(
  expectedTenantId: string,
): Promise<{ userId: string; tenantId: string } | { error: string }> {
  if (!expectedTenantId) return { error: 'missing_tenant_id' };
  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null as null,
    tenant: null as null,
  }));
  if (!user || !tenant) return { error: 'Neautentificat.' };
  if (tenant.id !== expectedTenantId) return { error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') {
    return { error: 'Acces interzis: doar OWNER poate modifica setările HIRforYOU.' };
  }
  return { userId: user.id, tenantId: expectedTenantId };
}

/**
 * Patron opts in: flip aggregator_enabled to true and set visibility to
 * 'public'. Idempotent — calling on an already-public tenant is a no-op.
 */
export async function enableMarketplace(expectedTenantId: string): Promise<ActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = admin;
  const { error } = await sb
    .from('tenants')
    .update({
      aggregator_enabled: true,
      aggregator_visibility: 'public',
    })
    .eq('id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Patron opts out: flip aggregator_enabled to false. The materialized view
 * filters on aggregator_enabled so the tenant disappears from /restaurante
 * on the next nightly refresh (or immediately on manual refresh).
 */
export async function disableMarketplace(expectedTenantId: string): Promise<ActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = admin;
  const { error } = await sb
    .from('tenants')
    .update({
      aggregator_enabled: false,
      aggregator_visibility: 'private',
    })
    .eq('id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Switch between public (listed) / invite_only (direct URL only).
 * Caller is expected to pass a value that already passes the DB CHECK
 * constraint; we re-validate defensively.
 */
export async function setMarketplaceVisibility(
  expectedTenantId: string,
  visibility: 'public' | 'invite_only',
): Promise<ActionResult> {
  if (visibility !== 'public' && visibility !== 'invite_only') {
    return { ok: false, error: 'invalid_visibility' };
  }
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = admin;
  const { error } = await sb
    .from('tenants')
    .update({ aggregator_visibility: visibility })
    .eq('id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
