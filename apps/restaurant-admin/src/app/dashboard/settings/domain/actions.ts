'use server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import {
  addProjectDomain,
  getProjectDomain,
  readVercelConfig,
  removeProjectDomain,
} from '@/lib/vercel';
import {
  getCurrentTenantDomain,
  normalizeDomain,
  type DomainStatus,
} from '@/app/api/domains/shared';

export type DomainActionResult = {
  ok: boolean;
  status?: DomainStatus;
  error?:
    | 'forbidden_owner_only'
    | 'invalid_domain'
    | 'vercel_not_configured'
    | 'vercel_add_failed'
    | 'vercel_remove_failed'
    | 'vercel_lookup_failed'
    | 'no_domain'
    | 'unauthenticated'
    | 'db_error';
  detail?: string;
};

async function ownerGuard(): Promise<
  | { ok: true; tenantId: string }
  | { ok: false; result: DomainActionResult }
> {
  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) {
    return { ok: false, result: { ok: false, error: 'unauthenticated' } };
  }
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return { ok: false, result: { ok: false, error: 'forbidden_owner_only' } };
  }
  return { ok: true, tenantId: tenant.id };
}

export async function requestDomainAction(formData: FormData): Promise<DomainActionResult> {
  const guard = await ownerGuard();
  if (!guard.ok) return guard.result;

  const raw = String(formData.get('domain') ?? '');
  const domain = normalizeDomain(raw);
  if (!domain) return { ok: false, error: 'invalid_domain' };

  const cfg = readVercelConfig();
  if (cfg.kind !== 'configured') {
    // Even without Vercel we still record the intent so the UI shows DNS hints.
    const admin = createAdminClient();
    const { error } = await admin
      .from('tenants')
      .update({
        custom_domain: domain,
        domain_status: 'PENDING_DNS',
        domain_verified_at: null,
      })
      .eq('id', guard.tenantId);
    if (error) return { ok: false, error: 'db_error', detail: error.message };
    revalidatePath('/dashboard/settings/domain');
    return { ok: true, status: 'PENDING_DNS', error: 'vercel_not_configured' };
  }

  const add = await addProjectDomain(cfg.config, domain);
  if (!add.ok && add.status !== 409) {
    return { ok: false, error: 'vercel_add_failed', detail: add.error };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({
      custom_domain: domain,
      domain_status: 'PENDING_DNS',
      domain_verified_at: null,
    })
    .eq('id', guard.tenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  revalidatePath('/dashboard/settings/domain');
  return { ok: true, status: 'PENDING_DNS' };
}

export async function verifyDomainAction(): Promise<DomainActionResult> {
  const guard = await ownerGuard();
  if (!guard.ok) return guard.result;

  const current = await getCurrentTenantDomain(guard.tenantId);
  if (!current.domain) return { ok: false, error: 'no_domain' };

  const cfg = readVercelConfig();
  if (cfg.kind !== 'configured') {
    return { ok: false, error: 'vercel_not_configured' };
  }

  const r = await getProjectDomain(cfg.config, current.domain);
  if (!r.ok) {
    await updateStatus(guard.tenantId, 'FAILED');
    revalidatePath('/dashboard/settings/domain');
    return { ok: false, status: 'FAILED', error: 'vercel_lookup_failed', detail: r.error };
  }

  let nextStatus: DomainStatus;
  let verifiedAt: string | null = null;
  if (r.record.verified && !r.record.misconfigured) {
    nextStatus = 'ACTIVE';
    verifiedAt = new Date().toISOString();
  } else if (r.record.verified) {
    nextStatus = 'PENDING_SSL';
  } else {
    nextStatus = 'PENDING_DNS';
  }

  await updateStatus(guard.tenantId, nextStatus, verifiedAt);
  revalidatePath('/dashboard/settings/domain');
  return { ok: true, status: nextStatus };
}

export async function removeDomainAction(): Promise<DomainActionResult> {
  const guard = await ownerGuard();
  if (!guard.ok) return guard.result;

  const current = await getCurrentTenantDomain(guard.tenantId);

  if (current.domain) {
    const cfg = readVercelConfig();
    if (cfg.kind === 'configured') {
      const r = await removeProjectDomain(cfg.config, current.domain);
      if (!r.ok) {
        return { ok: false, error: 'vercel_remove_failed', detail: r.error };
      }
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({
      custom_domain: null,
      domain_status: 'NONE',
      domain_verified_at: null,
    })
    .eq('id', guard.tenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  revalidatePath('/dashboard/settings/domain');
  return { ok: true, status: 'NONE' };
}

async function updateStatus(
  tenantId: string,
  status: DomainStatus,
  verifiedAt: string | null = null,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('tenants')
    .update({ domain_status: status, domain_verified_at: verifiedAt })
    .eq('id', tenantId);
}
