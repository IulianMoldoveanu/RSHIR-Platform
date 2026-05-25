'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes, createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';

const GRACE_HOURS = 24;

export type RotateResult =
  | { ok: true; signingSecret: string; graceUntil: string }
  | { ok: false; error: string };

export async function rotateWebhookSecretAction(endpointId: string): Promise<RotateResult> {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return { ok: false, error: 'Doar utilizatorii cu rolul OWNER pot roti secretul webhook.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: endpoint, error: epErr } = await admin
    .from('connect_webhook_endpoints')
    .select('id, tenant_id, signing_secret_hash')
    .eq('id', endpointId)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (epErr || !endpoint) {
    return { ok: false, error: 'Endpoint-ul webhook nu a fost găsit pentru acest restaurant.' };
  }

  const newPlaintext = randomBytes(32).toString('hex');
  const newHash = createHash('sha256').update(newPlaintext).digest('hex');
  const graceUntil = new Date(Date.now() + GRACE_HOURS * 3600_000).toISOString();

  const { error: updErr } = await admin
    .from('connect_webhook_endpoints')
    .update({
      signing_secret_hash: newHash,
      signing_secret_previous_hash: endpoint.signing_secret_hash,
      signing_secret_previous_expires_at: graceUntil,
    })
    .eq('id', endpoint.id);
  if (updErr) {
    return { ok: false, error: `Actualizare endpoint eșuată: ${updErr.message}` };
  }

  const vaultName = `connect_webhook_secret_${endpoint.id}`;
  const { error: vaultErr } = await admin.rpc('vault_create_or_update_secret', {
    secret_name: vaultName,
    secret_value: newPlaintext,
  });
  if (vaultErr) {
    return { ok: false, error: `Actualizare vault eșuată: ${vaultErr.message}` };
  }

  revalidatePath('/dashboard/settings/integrations/webhooks');
  return { ok: true, signingSecret: newPlaintext, graceUntil };
}

export type UpdateUrlResult = { ok: true } | { ok: false; error: string };

export async function updateWebhookUrlAction(
  endpointId: string,
  newUrl: string,
): Promise<UpdateUrlResult> {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);
  if (role !== 'OWNER') {
    return { ok: false, error: 'Doar utilizatorii cu rolul OWNER pot modifica URL-ul webhook.' };
  }

  if (!newUrl.startsWith('https://')) {
    return { ok: false, error: 'URL-ul trebuie să înceapă cu https://' };
  }

  try {
    new URL(newUrl);
  } catch {
    return { ok: false, error: 'URL invalid.' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from('connect_webhook_endpoints')
    .update({ url: newUrl })
    .eq('id', endpointId)
    .eq('tenant_id', tenant.id);
  if (error) {
    return { ok: false, error: `Actualizare URL eșuată: ${error.message}` };
  }

  revalidatePath('/dashboard/settings/integrations/webhooks');
  return { ok: true };
}
