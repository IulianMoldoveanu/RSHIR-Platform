'use server';

// RSHIR-52: Server actions for integrations settings.
// All actions are OWNER-gated and use the requireTenant + requireOwner guard
// following the same pattern as orders/actions.ts.

import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import {
  customAdapter,
  validateCustomConfig,
  type OrderPayload,
} from '@hir/integration-core';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';

const REVALIDATE = '/dashboard/settings/integrations';

export type IntegrationActionResult =
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
  if (!user || !tenant) return { error: 'Unauthentificat.' };
  if (tenant.id !== expectedTenantId) return { error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { error: 'Acces interzis: doar OWNER poate modifica integrările.' };
  return { userId: user.id, tenantId: expectedTenantId };
}

// Cast helper — integration tables are not yet in the generated Supabase types.
function integrationSb() {
  const admin = createAdminClient();
  return admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            error: { message: string } | null;
          }>;
        };
      };
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

// Webhook secrets must be long enough that brute-forcing the HMAC is
// infeasible. 16 hex chars = 64 bits of entropy minimum; we ask for >=16
// chars but recommend the auto-generated UUID (32 hex chars) in the UI.
const MIN_SECRET_LEN = 16;

export async function addProvider(
  expectedTenantId: string,
  providerKey: string,
  displayName: string,
  configJson: Record<string, unknown>,
  webhookSecret: string,
): Promise<IntegrationActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  if (typeof webhookSecret !== 'string' || webhookSecret.length < MIN_SECRET_LEN) {
    return {
      ok: false,
      error: `Secretul webhook trebuie să aibă minim ${MIN_SECRET_LEN} caractere. Folosiți butonul „Generează" pentru un secret aleator.`,
    };
  }

  // Provider-specific config shape validation. For Custom we require
  // the same checks the adapter does: HTTPS-only URL, IP-literal SSRF
  // guard, fire_on_statuses non-empty + valid enum. Other providers
  // don't need a config today (Mock has none; Freya / iiko / posnet
  // ship with empty config until vendor specs land).
  if (providerKey === 'custom') {
    const v = validateCustomConfig(configJson);
    if (!v.ok) {
      return { ok: false, error: friendlyCustomConfigError(v.error) };
    }
  }

  const sb = integrationSb();
  const { error } = await sb
    .from('integration_providers')
    .insert({
      tenant_id: guard.tenantId,
      provider_key: providerKey,
      display_name: displayName,
      config: configJson,
      webhook_secret: webhookSecret,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.provider_added',
    entityType: 'integration_provider',
    metadata: { provider_key: providerKey, display_name: displayName },
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

function friendlyCustomConfigError(code: string): string {
  if (code === 'webhook_url_missing') return 'URL-ul webhook este obligatoriu.';
  if (code === 'webhook_url_not_https') return 'URL-ul webhook trebuie să fie HTTPS (nu HTTP).';
  if (code === 'webhook_url_unparseable' || code === 'webhook_url_no_host') {
    return 'URL-ul webhook nu este valid.';
  }
  if (code.startsWith('webhook_url_private') || code === 'webhook_url_loopback_ipv4' || code === 'webhook_url_loopback_ipv6') {
    return 'URL-ul webhook nu poate fi o adresă internă (10.x, 172.16.x, 192.168.x, 127.x, ::1).';
  }
  if (code === 'webhook_url_link_local_ipv4' || code === 'webhook_url_link_local_ipv6' || code === 'webhook_url_zero_ipv4') {
    return 'URL-ul webhook nu poate fi o adresă rezervată (link-local, metadata cloud).';
  }
  if (code === 'webhook_url_localhost_blocked') {
    return 'URL-ul webhook nu poate fi „localhost" — trebuie un host public HTTPS.';
  }
  if (code === 'fire_on_statuses_empty') {
    return 'Selectați cel puțin un status pentru care să trimitem webhook.';
  }
  if (code.startsWith('fire_on_statuses_invalid')) {
    return 'Status invalid în lista „Trimite la".';
  }
  return `Configurare invalidă: ${code}`;
}

// "Testează conexiunea" — invokes the Custom adapter directly with a
// synthetic payload (no queue, no audit row, no DB writes). Returns
// the HTTP status the receiver gave back so the operator can see at a
// glance whether their endpoint is reachable + signature-verifies.
//
// Bypassing the dispatcher avoids polluting the events queue with test
// rows and gives instant feedback.
export type TestWebhookResult =
  | { ok: true; httpStatus: number; latencyMs: number }
  | { ok: false; error: string };

export async function testCustomWebhook(
  expectedTenantId: string,
  providerId: string,
): Promise<TestWebhookResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const admin = createAdminClient();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { provider_key: string; config: unknown; webhook_secret: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const { data: provider, error: lookupErr } = await sb
    .from('integration_providers')
    .select('provider_key, config, webhook_secret')
    .eq('id', providerId)
    .eq('tenant_id', guard.tenantId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!provider) return { ok: false, error: 'Furnizorul nu a fost găsit.' };
  if (provider.provider_key !== 'custom') {
    return { ok: false, error: 'Test disponibil doar pentru furnizori de tip „Custom".' };
  }

  // Synthetic payload — clearly marked test_mode so the receiver can
  // route it differently from real traffic.
  const testPayload = {
    orderId: `test_${randomBytes(4).toString('hex')}`,
    source: 'INTERNAL_STOREFRONT',
    status: 'NEW',
    items: [{ name: 'Test order — ignore', qty: 1, priceRon: 0 }],
    totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
    customer: { firstName: 'Test', phone: '+40700000000' },
    dropoff: { line1: 'Test', city: 'Brașov' },
    notes: 'HIR connectivity test — no real order',
    // Internal flag picked up by customAdapter to set envelope.test_mode=true.
    __hir_test_mode: true,
  } as unknown as OrderPayload;

  const start = Date.now();
  const result = await customAdapter.onOrderEvent(
    {
      tenantId: guard.tenantId,
      provider: {
        key: 'custom',
        config: (provider.config as Record<string, unknown>) ?? {},
        webhookSecret: provider.webhook_secret,
      },
      fetch: globalThis.fetch.bind(globalThis),
      log: (level, msg, meta) => {
        // Surface adapter logs in the server console for debugging;
        // we don't write them to audit_log because this is a test path.
        const m = meta ? ` ${JSON.stringify(meta)}` : '';
        if (level === 'error') console.error(`[testCustomWebhook] ${msg}${m}`);
        else if (level === 'warn') console.warn(`[testCustomWebhook] ${msg}${m}`);
        else console.log(`[testCustomWebhook] ${msg}${m}`);
      },
    },
    'created',
    testPayload,
  );
  const latencyMs = Date.now() - start;

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.test_webhook',
    entityType: 'integration_provider',
    entityId: providerId,
    metadata: { ok: result.ok, latencyMs },
  });

  if (result.ok) return { ok: true, httpStatus: 200, latencyMs };
  // Adapter returns custom_http_<code> for HTTP errors; surface the code
  // back so the operator can fix their receiver.
  const m = /^custom_http_(\d+)$/.exec(result.error);
  if (m) {
    return { ok: false, error: `Receiver-ul a răspuns HTTP ${m[1]}. Verificați endpoint-ul și semnătura HMAC.` };
  }
  if (result.error === 'custom_network_error') {
    return { ok: false, error: 'Endpoint-ul nu este accesibil (network error sau timeout).' };
  }
  return { ok: false, error: friendlyCustomConfigError(result.error) };
}

export async function removeProvider(
  expectedTenantId: string,
  providerId: string,
): Promise<IntegrationActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = integrationSb();
  const { error } = await sb
    .from('integration_providers')
    .delete()
    .eq('id', providerId)
    .eq('tenant_id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.provider_removed',
    entityType: 'integration_provider',
    entityId: providerId,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}

export type CreateApiKeyResult =
  | { ok: true; rawKey: string }
  | { ok: false; error: string };

export async function createApiKey(
  expectedTenantId: string,
  label: string,
  scopes: string[],
): Promise<CreateApiKeyResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const raw = `hir_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const keyPrefix = raw.slice(0, 8);

  const sb = integrationSb();
  const { data, error } = await sb
    .from('tenant_api_keys')
    .insert({
      tenant_id: guard.tenantId,
      key_hash: hash,
      key_prefix: keyPrefix,
      label,
      scopes,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.api_key_created',
    entityType: 'tenant_api_key',
    entityId: String(data.id),
    metadata: { label, scopes },
  });

  revalidatePath(REVALIDATE);
  return { ok: true, rawKey: raw };
}

export async function revokeApiKey(
  expectedTenantId: string,
  keyId: string,
): Promise<IntegrationActionResult> {
  const guard = await requireOwner(expectedTenantId);
  if ('error' in guard) return { ok: false, error: guard.error };

  const sb = integrationSb();
  const { error } = await sb
    .from('tenant_api_keys')
    .update({ is_active: false })
    .eq('id', keyId)
    .eq('tenant_id', guard.tenantId);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    tenantId: guard.tenantId,
    actorUserId: guard.userId,
    action: 'integration.api_key_revoked',
    entityType: 'tenant_api_key',
    entityId: keyId,
  });

  revalidatePath(REVALIDATE);
  return { ok: true };
}
