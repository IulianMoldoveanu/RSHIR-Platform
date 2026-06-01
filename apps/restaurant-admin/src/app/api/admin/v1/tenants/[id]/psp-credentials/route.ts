// POST /api/admin/v1/tenants/[id]/psp-credentials
//
// Upserts PSP credentials for a tenant.
//
// Auth: platform admin (HIR_PLATFORM_ADMIN_EMAILS allow-list) OR tenant OWNER.
//
// Body:
//   provider:       'netopia' | 'viva'
//   mode:           'sandbox' | 'live'
//   api_key:        string   — stored in Vault
//   signature_key:  string   — stored in Vault
//   source_code:    string?  — stored in Vault (optional, e.g. Viva source code)
//
// Effect:
//   1. Validates the caller is platform admin or OWNER on the tenant.
//   2. Upserts a row in psp_credentials (no plaintext credentials stored).
//   3. Writes api_key + signature_key (+ source_code if supplied) to Vault via
//      vault_create_or_update_secret using the psp_<provider>_<tenantId>_<field>
//      naming convention from provider-router.ts.
//   4. Writes an audit_log entry.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin, isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { createServerClient } from '@/lib/supabase/server';
import { getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const BodySchema = z.object({
  provider: z.enum(['netopia', 'viva']),
  mode: z.enum(['sandbox', 'live']),
  api_key: z.string().min(1),
  signature_key: z.string().min(1),
  source_code: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: tenantId } = await params;

  // ── Auth ───────────────────────────────────────────────────────────────────
  // Accept platform admin OR tenant OWNER. Resolve the caller once so we
  // don't call getUser twice.
  const supa = await createServerClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const isPlatAdmin = isPlatformAdminEmail(user.email);

  if (!isPlatAdmin) {
    // Must be OWNER on this specific tenant.
    let role: string | null;
    try {
      role = await getTenantRole(user.id, tenantId);
    } catch {
      return NextResponse.json({ error: 'role_check_failed' }, { status: 500 });
    }
    if (role !== 'OWNER') {
      return NextResponse.json({ error: 'forbidden_owner_only' }, { status: 403 });
    }
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid_body', detail: String(e) }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Ensure tenant exists ───────────────────────────────────────────────────
  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr || !tenant) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });
  }

  // ── Upsert psp_credentials row ─────────────────────────────────────────────
  // We store NO plaintext credentials here; the row tracks active status +
  // the api_key_vault_name so the provider-router knows where to look.
  const apiKeyVaultName = `psp_${parsed.provider}_${tenantId}_api_key`;
  const live = parsed.mode === 'live';

  const { error: upsertErr } = await admin
    .from('psp_credentials')
    .upsert(
      {
        tenant_id: tenantId,
        provider: parsed.provider,
        mode: 'STANDARD',
        api_key_vault_name: apiKeyVaultName,
        live,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,provider' },
    );
  if (upsertErr) {
    return NextResponse.json(
      { error: 'db_upsert_failed', detail: upsertErr.message },
      { status: 500 },
    );
  }

  // ── Write secrets to Vault ─────────────────────────────────────────────────
  const vaultWrites: Array<{ name: string; value: string }> = [
    { name: `psp_${parsed.provider}_${tenantId}_api_key`, value: parsed.api_key },
    { name: `psp_${parsed.provider}_${tenantId}_signature_key`, value: parsed.signature_key },
  ];
  if (parsed.source_code) {
    vaultWrites.push({
      name: `psp_${parsed.provider}_${tenantId}_source_code`,
      value: parsed.source_code,
    });
  }

  for (const { name, value } of vaultWrites) {
    const { error: vErr } = await admin.rpc('vault_create_or_update_secret', {
      secret_name: name,
      secret_value: value,
    });
    if (vErr) {
      // Best-effort rollback of psp_credentials row to avoid a row that points
      // to non-existent vault secrets.
      await admin
        .from('psp_credentials')
        .update({ active: false })
        .eq('tenant_id', tenantId)
        .eq('provider', parsed.provider);
      return NextResponse.json(
        { error: 'vault_write_failed', detail: vErr.message },
        { status: 500 },
      );
    }
  }

  // ── Audit ──────────────────────────────────────────────────────────────────
  await logAudit({
    tenantId,
    actorUserId: user.id,
    action: 'integration.api_key_created',
    entityType: 'psp_credentials',
    metadata: {
      provider: parsed.provider,
      mode: parsed.mode,
      configured_by: isPlatAdmin ? 'platform_admin' : 'owner',
    },
  });

  return NextResponse.json({
    ok: true,
    tenant_id: tenantId,
    provider: parsed.provider,
    mode: parsed.mode,
    vault_names: vaultWrites.map((w) => w.name),
  });
}
