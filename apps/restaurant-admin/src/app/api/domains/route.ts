import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertTenantOwner } from '@/lib/tenant';
import {
  addProjectDomain,
  readVercelConfig,
  removeProjectDomain,
} from '@/lib/vercel';
import { assertSameOrigin } from '@/lib/origin-check';
import { normalizeDomain, getCurrentTenantDomain } from './shared';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  domain: z.string().min(3).max(253),
});

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  const ownerCheck = await assertTenantOwner(auth.userId, auth.tenantId);
  if (!ownerCheck.ok) return ownerCheck.response;

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const domain = normalizeDomain(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: 'invalid_domain' }, { status: 400 });
  }

  const cfg = readVercelConfig();
  if (cfg.kind !== 'configured') {
    return NextResponse.json({ error: 'vercel_not_configured' }, { status: 503 });
  }

  const add = await addProjectDomain(cfg.config, domain);
  // 409 == domain already attached to this project; treat as recoverable so the
  // pharmacy can re-claim a stuck row without contacting support.
  if (!add.ok && add.status !== 409) {
    return NextResponse.json({ error: 'vercel_add_failed', detail: add.error }, { status: 502 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({
      custom_domain: domain,
      domain_status: 'PENDING_DNS',
      domain_verified_at: null,
    })
    .eq('id', auth.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, domain, status: 'PENDING_DNS' }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
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

  if (current.domain) {
    const cfg = readVercelConfig();
    if (cfg.kind === 'configured') {
      const removed = await removeProjectDomain(cfg.config, current.domain);
      if (!removed.ok) {
        return NextResponse.json(
          { error: 'vercel_remove_failed', detail: removed.error },
          { status: 502 },
        );
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
    .eq('id', auth.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
