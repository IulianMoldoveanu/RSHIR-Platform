import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';

const GRACE_HOURS = 24;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const adminCheck = await requirePlatformAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const { id: endpointId } = await ctx.params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: endpoint, error: epErr } = await supabase
    .from('connect_webhook_endpoints')
    .select('id, signing_secret_hash')
    .eq('id', endpointId)
    .single();
  if (epErr || !endpoint) {
    return NextResponse.json({ error: 'endpoint_not_found' }, { status: 404 });
  }

  const newPlaintext = randomBytes(32).toString('hex');
  const newHash = createHash('sha256').update(newPlaintext).digest('hex');
  const graceUntil = new Date(Date.now() + GRACE_HOURS * 3600_000).toISOString();

  // Move current hash to previous + set grace window
  await supabase
    .from('connect_webhook_endpoints')
    .update({
      signing_secret_hash: newHash,
      signing_secret_previous_hash: endpoint.signing_secret_hash,
      signing_secret_previous_expires_at: graceUntil,
    })
    .eq('id', endpoint.id);

  // Update vault entry
  const vaultName = `connect_webhook_secret_${endpoint.id}`;
  const { error: vaultErr } = await supabase.rpc('vault_create_or_update_secret', {
    secret_name: vaultName,
    secret_value: newPlaintext,
  });
  if (vaultErr) {
    return NextResponse.json(
      { error: 'vault_update_failed', detail: vaultErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    endpoint_id: endpoint.id,
    signing_secret: newPlaintext,
    previous_secret_grace_until: graceUntil,
    warning: 'New secret shown ONCE. Old secret remains valid for 24h grace.',
  });
}
