import { NextResponse, type NextRequest } from 'next/server';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantOwner } from '@/lib/tenant';
import { getProjectDomain, readVercelConfig } from '@/lib/vercel';
import { assertSameOrigin } from '@/lib/origin-check';
import { getCurrentTenantDomain, type DomainStatus } from '../shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const ownerCheck = await assertTenantOwner(auth.userId, auth.tenantId);
  if (!ownerCheck.ok) return ownerCheck.response;

  const current = await getCurrentTenantDomain(auth.tenantId);
  if (current.error) {
    return NextResponse.json({ error: current.error }, { status: 400 });
  }
  if (!current.domain) {
    return NextResponse.json({ error: 'no_domain' }, { status: 400 });
  }

  const cfg = readVercelConfig();
  if (cfg.kind !== 'configured') {
    return NextResponse.json({ error: 'vercel_not_configured' }, { status: 503 });
  }

  const r = await getProjectDomain(cfg.config, current.domain);
  if (!r.ok) {
    await writeStatus(auth.tenantId, 'FAILED');
    return NextResponse.json(
      { error: 'vercel_lookup_failed', detail: r.error, status: 'FAILED' },
      { status: 502 },
    );
  }

  const { verified, misconfigured } = r.record;

  let nextStatus: DomainStatus;
  let verifiedAt: string | null = null;
  if (verified && !misconfigured) {
    nextStatus = 'ACTIVE';
    verifiedAt = new Date().toISOString();
  } else if (verified) {
    nextStatus = 'PENDING_SSL';
  } else {
    nextStatus = 'PENDING_DNS';
  }

  await writeStatus(auth.tenantId, nextStatus, verifiedAt);

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    verified,
    misconfigured: misconfigured ?? false,
    verification: r.record.verification ?? [],
  });
}

async function writeStatus(
  tenantId: string,
  status: DomainStatus,
  verifiedAt: string | null = null,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('tenants')
    .update({
      domain_status: status,
      domain_verified_at: verifiedAt,
    })
    .eq('id', tenantId);
}
