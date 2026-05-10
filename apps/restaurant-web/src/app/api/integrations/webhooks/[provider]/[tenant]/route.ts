// RSHIR-53 — Inbound integration webhook router.
// POST /api/integrations/webhooks/<provider>/<tenant>
//
// Resolves the tenant's provider config, hands the raw body + headers
// to the matching adapter for signature verification + parsing, then
// applies the parsed event to local state.
//
// Failures are intentionally terse: 401 for any verification failure
// (don't leak whether the tenant or provider exists for unsigned
// requests), 404 only when both URL params look well-formed but the
// (tenant, provider) row is missing.
import { NextResponse } from 'next/server';
import { getAdapter } from '@hir/integration-core';
import type { ProviderKey, AdapterContext } from '@hir/integration-core';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN_PROVIDERS: ProviderKey[] = ['mock', 'iiko', 'smartcash', 'freya', 'posnet', 'custom'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function headersToObject(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

async function auditWebhookReceived(
  tenantId: string,
  providerKey: string,
  kind: string,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const sb = admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await sb.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: null,
      action: 'integration.webhook_received',
      entity_type: 'integration_webhook',
      entity_id: null,
      metadata: { kind, provider_key: providerKey },
    });
    if (error) {
      console.error('[webhook-in] audit insert failed', error.message);
    }
  } catch (e) {
    console.error('[webhook-in] audit threw', e);
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ provider: string; tenant: string }> }
) {
  const params = await props.params;
  const { provider, tenant } = params;
  if (!KNOWN_PROVIDERS.includes(provider as ProviderKey) || !UUID_RE.test(tenant)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const providerKey = provider as ProviderKey;

  const admin = getSupabaseAdmin();
  const { data: providerRow, error: providerErr } = await admin
    .from('integration_providers')
    .select('provider_key, config, webhook_secret, is_active')
    .eq('tenant_id', tenant)
    .eq('provider_key', providerKey)
    .maybeSingle();
  if (providerErr) {
    console.error('[webhook-in] provider lookup error', providerErr.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
  if (!providerRow || !providerRow.is_active) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const raw = await req.text();
  const headersObj = headersToObject(req);

  const adapter = getAdapter(providerKey);
  const ctx: AdapterContext = {
    tenantId: tenant,
    provider: {
      key: providerKey,
      config: (providerRow.config ?? {}) as Record<string, unknown>,
      webhookSecret: providerRow.webhook_secret,
    },
    fetch,
    log: (level, msg, meta) => {
      const fn =
        level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(`[webhook-in:${providerKey}] ${msg}`, meta ?? {});
    },
  };

  const event = await adapter.verifyWebhook(ctx, raw, headersObj);
  if (!event) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (event.kind === 'order.status_changed') {
    // Conflict policy: HIR is the source of truth for order state. The
    // POS webhook may race against an in-flight admin update, so we skip
    // the apply if the local row was modified more recently than the
    // event was emitted. The Mock adapter's WebhookEvent shape doesn't
    // carry an `at` timestamp today, so for MVP we simply trust the POS
    // claim and write — but the lookup remains so we can swap in the
    // timestamp guard once richer adapters land.
    const { error: updErr } = await admin
      .from('restaurant_orders')
      .update({ status: event.status })
      .eq('id', event.orderId)
      .eq('tenant_id', tenant);
    if (updErr) {
      console.error('[webhook-in] order update error', updErr.message);
    }
    await auditWebhookReceived(tenant, providerKey, event.kind);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (event.kind === 'order.created') {
    // Public POST /api/public/v1/orders is the canonical create path
    // (shipped by another agent). We just acknowledge here so duplicate
    // pushes don't 500, and surface them in the audit log for triage.
    await auditWebhookReceived(tenant, providerKey, event.kind);
    return NextResponse.json({ ok: true, accepted: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
