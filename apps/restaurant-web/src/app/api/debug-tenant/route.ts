import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { resolveTenantFromHost } from '@/lib/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary diagnostic route — delete after use.
export async function GET() {
  const h = await headers();
  const { tenant, host, slug } = await resolveTenantFromHost();
  return NextResponse.json({
    rawHost: h.get('host'),
    xHirHost: h.get('x-hir-host'),
    xHirTenantSlug: h.get('x-hir-tenant-slug'),
    xHirTenantOverride: h.get('x-hir-tenant-override'),
    resolvedHost: host,
    resolvedSlug: slug,
    tenantFound: Boolean(tenant),
    tenantSlug: tenant?.slug ?? null,
    primaryDomainEnv: process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? null,
  });
}
