import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  webhook_url: z.string().url().refine((u) => u.startsWith('https://'), 'HTTPS required'),
  events: z
    .array(z.string())
    .optional()
    .default(['order.created', 'order.status_changed', 'order.delivered', 'order.cancelled']),
});

function generatePlaintextSecret(): string {
  return randomBytes(32).toString('hex');
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export async function POST(req: NextRequest) {
  const adminCheck = await requirePlatformAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid_body', detail: String(e) }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // Ensure tenant exists + flip delivery_mode to headless
  // delivery_mode column added by 20260518_010 (PR #704); types regen after merge.
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, slug, name, delivery_mode')
    .eq('id', parsed.tenant_id)
    .single();
  if (tenantErr || !tenant) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });
  }

  // Existing active endpoint -> 409
  const { data: existing } = await supabase
    .from('connect_webhook_endpoints')
    .select('id')
    .eq('tenant_id', parsed.tenant_id)
    .eq('active', true)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: 'endpoint_exists', endpoint_id: existing.id },
      { status: 409 },
    );
  }

  // Generate secret + hash
  const plaintext = generatePlaintextSecret();
  const hash = hashSecret(plaintext);

  // Insert endpoint
  const { data: inserted, error: insertErr } = await supabase
    .from('connect_webhook_endpoints')
    .insert({
      tenant_id: parsed.tenant_id,
      url: parsed.webhook_url,
      signing_secret_hash: hash,
      events: parsed.events,
      created_by: adminCheck.userId,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: 'insert_failed', detail: insertErr?.message },
      { status: 500 },
    );
  }

  // Store plaintext in vault under predictable name
  const vaultName = `connect_webhook_secret_${inserted.id}`;
  const { error: vaultErr } = await supabase.rpc('vault_create_or_update_secret', {
    secret_name: vaultName,
    secret_value: plaintext,
  });
  if (vaultErr) {
    // Rollback the endpoint row
    await supabase.from('connect_webhook_endpoints').delete().eq('id', inserted.id);
    return NextResponse.json(
      { error: 'vault_store_failed', detail: vaultErr.message },
      { status: 500 },
    );
  }

  // Flip tenant to headless mode
  if (tenant.delivery_mode !== 'headless') {
    await supabase
      .from('tenants')
      .update({ delivery_mode: 'headless' })
      .eq('id', parsed.tenant_id);
  }

  return NextResponse.json({
    endpoint_id: inserted.id,
    webhook_url: parsed.webhook_url,
    signing_secret: plaintext,
    warning:
      'This signing_secret is shown ONCE. Store it securely (e.g. wp-config.php constant). It cannot be retrieved later — rotate via /api/admin/v1/connect/endpoints/[id]/rotate-secret if lost.',
    events: parsed.events,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
  });
}
