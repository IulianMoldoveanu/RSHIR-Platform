import { createAdminClient } from '@/lib/supabase/admin';

const FQDN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return FQDN_RE.test(trimmed) ? trimmed : null;
}

export type DomainStatus = 'NONE' | 'PENDING_DNS' | 'PENDING_SSL' | 'ACTIVE' | 'FAILED';

export type TenantDomainRow = {
  custom_domain: string | null;
  domain_status: DomainStatus;
  domain_verified_at: string | null;
};

export async function getCurrentTenantDomain(
  tenantId: string,
): Promise<{ domain: string | null; status: DomainStatus; verifiedAt: string | null; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenants')
    .select('custom_domain, domain_status, domain_verified_at')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return { domain: null, status: 'NONE', verifiedAt: null, error: error.message };
  const row = (data ?? null) as TenantDomainRow | null;
  return {
    domain: row?.custom_domain ?? null,
    status: (row?.domain_status as DomainStatus) ?? 'NONE',
    verifiedAt: row?.domain_verified_at ?? null,
  };
}
