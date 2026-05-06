// RSHIR-53 — async dispatcher for integration_events.
//
// Triggered every 30s by the `integration-dispatcher-tick` pg_cron job
// (see supabase/migrations/20260501_003_integration_cron.sql). On each
// invocation it pulls up to 50 PENDING events whose scheduled_for has
// elapsed, dispatches them, and updates the row.
//
// MVP scope: Mock provider only. The Mock adapter has no external HTTP
// side-effect, so dispatching is just "mark SENT + audit-log". Real
// vendor adapters (iiko, Freya, smartcash, ...) ship in a future sprint;
// rows for those providers are marked DEAD with a clear error so they
// don't sit forever in the queue.
//
// Auth: shared-secret like notify-new-order / daily-digest / review-reminder.
//   HIR_NOTIFY_SECRET — required, sent by pg_net as `x-hir-notify-secret`.
//
// Auto-injected by Supabase runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30 * 1000; // 30s
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1h

type EventRow = {
  id: number;
  tenant_id: string;
  provider_key: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type ProviderRow = {
  provider_key: string;
  config: Record<string, unknown>;
  webhook_secret: string;
  is_active: boolean;
};

function nextBackoffIso(nextAttempts: number): string {
  // Exponential: 30s * 2^attempts, capped at 1h. attempts is the
  // post-increment value (so first retry waits ~60s).
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** nextAttempts, MAX_BACKOFF_MS);
  return new Date(Date.now() + delay).toISOString();
}

async function loadProvider(
  supabase: SupabaseClient,
  tenantId: string,
  providerKey: string,
): Promise<ProviderRow | null> {
  const { data, error } = await supabase
    .from('integration_providers')
    .select('provider_key, config, webhook_secret, is_active')
    .eq('tenant_id', tenantId)
    .eq('provider_key', providerKey)
    .maybeSingle();
  if (error) {
    console.error('[integration-dispatcher] provider lookup error', error.message);
    return null;
  }
  return (data as ProviderRow | null) ?? null;
}

async function markSent(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase
    .from('integration_events')
    .update({ status: 'SENT', sent_at: new Date().toISOString(), last_error: null })
    .eq('id', id);
  if (error) console.error('[integration-dispatcher] markSent error', id, error.message);
}

async function markDead(
  supabase: SupabaseClient,
  id: number,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('integration_events')
    .update({ status: 'DEAD', last_error: reason })
    .eq('id', id);
  if (error) console.error('[integration-dispatcher] markDead error', id, error.message);
}

async function markRetry(
  supabase: SupabaseClient,
  row: EventRow,
  reason: string,
): Promise<'retry' | 'dead'> {
  const nextAttempts = row.attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await markDead(supabase, row.id, `max_attempts_exceeded: ${reason}`);
    return 'dead';
  }
  const { error } = await supabase
    .from('integration_events')
    .update({
      attempts: nextAttempts,
      last_error: reason,
      scheduled_for: nextBackoffIso(nextAttempts),
    })
    .eq('id', row.id);
  if (error) console.error('[integration-dispatcher] markRetry error', row.id, error.message);
  return 'retry';
}

async function auditDispatched(
  supabase: SupabaseClient,
  tenantId: string,
  row: EventRow,
): Promise<void> {
  const { error } = await supabase.from('audit_log').insert({
    tenant_id: tenantId,
    actor_user_id: null,
    action: 'integration.dispatched',
    entity_type: 'integration_event',
    entity_id: String(row.id),
    metadata: {
      event_id: row.id,
      event_type: row.event_type,
      provider_key: row.provider_key,
    },
  });
  if (error) {
    console.error('[integration-dispatcher] audit insert error', row.id, error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) {
    console.error('[integration-dispatcher] HIR_NOTIFY_SECRET not configured');
    return json(500, { error: 'secret_not_configured' });
  }
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();
  const { data: rows, error: pickErr } = await supabase
    .from('integration_events')
    .select('id, tenant_id, provider_key, event_type, payload, attempts')
    .eq('status', 'PENDING')
    .lte('scheduled_for', nowIso)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);
  if (pickErr) {
    console.error('[integration-dispatcher] pick error', pickErr.message);
    return json(500, { error: 'pick_failed' });
  }

  const events = (rows ?? []) as EventRow[];
  let sent = 0;
  let failed = 0; // requeued for retry
  let dead = 0;

  for (const row of events) {
    const provider = await loadProvider(supabase, row.tenant_id, row.provider_key);
    if (!provider || !provider.is_active) {
      await markDead(supabase, row.id, 'provider_missing_or_inactive');
      dead += 1;
      continue;
    }

    if (provider.provider_key === 'mock') {
      // Mock adapter: always succeeds, no external call. We replicate its
      // behaviour inline here because the workspace package can't be
      // imported into the Deno Edge runtime.
      try {
        console.log('[integration-dispatcher] mock dispatch', {
          event_id: row.id,
          tenant_id: row.tenant_id,
          event_type: row.event_type,
        });
        await markSent(supabase, row.id);
        await auditDispatched(supabase, row.tenant_id, row);
        sent += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const outcome = await markRetry(supabase, row, msg);
        if (outcome === 'dead') dead += 1;
        else failed += 1;
      }
      continue;
    }

    if (provider.provider_key === 'custom') {
      // Custom HTTPS-webhook adapter — mirrors
      // packages/integration-core/src/adapters/custom.ts. Keep the two
      // in sync; this duplication only exists because Deno can't pull
      // in the workspace package today.
      const outcome = await dispatchCustom(supabase, row, provider);
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'dead') dead += 1;
      else failed += 1;
      continue;
    }

    // Other adapters (iiko / freya / posnet / smartcash) — out of
    // scope for the dispatcher today. Marking DEAD (rather than
    // retrying) avoids the row sitting in the queue forever and
    // surfaces the misconfiguration loudly in the audit/UI.
    await markDead(supabase, row.id, 'provider_not_implemented_in_dispatcher');
    dead += 1;
  }

  console.log(
    `[integration-dispatcher] processed=${events.length} sent=${sent} failed=${failed} dead=${dead}`,
  );
  return json(200, { processed: events.length, sent, failed, dead });
});

// ----------------------------------------------------------------------
// Custom HTTPS-webhook adapter — Deno mirror of
// packages/integration-core/src/adapters/custom.ts.
// Any change to the contract (header name, envelope shape, SSRF rules)
// MUST be reflected in both files.
// ----------------------------------------------------------------------

const CUSTOM_SIG_HEADER = 'x-hir-signature';
const CUSTOM_VALID_STATUSES = new Set([
  'NEW',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
]);

function customIsSafeWebhookUrl(url: string): { ok: true } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'webhook_url_unparseable' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'webhook_url_not_https' };
  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) return { ok: false, error: 'webhook_url_no_host' };
  if (host === 'localhost' || host === 'localhost.localdomain') {
    return { ok: false, error: 'webhook_url_localhost_blocked' };
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map((n) => Number(n));
    for (const x of o) {
      if (Number.isNaN(x) || x < 0 || x > 255) {
        return { ok: false, error: 'webhook_url_bad_ipv4' };
      }
    }
    const a = o[0]!;
    const b = o[1]!;
    if (a === 10) return { ok: false, error: 'webhook_url_private_ipv4' };
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, error: 'webhook_url_private_ipv4' };
    if (a === 192 && b === 168) return { ok: false, error: 'webhook_url_private_ipv4' };
    if (a === 127) return { ok: false, error: 'webhook_url_loopback_ipv4' };
    if (a === 169 && b === 254) return { ok: false, error: 'webhook_url_link_local_ipv4' };
    if (a === 0) return { ok: false, error: 'webhook_url_zero_ipv4' };
  }
  if (host.includes(':')) {
    const h = host.replace(/^\[/, '').replace(/\]$/, '');
    if (h === '::1' || h === '0:0:0:0:0:0:0:1') {
      return { ok: false, error: 'webhook_url_loopback_ipv6' };
    }
    if (/^fc/i.test(h) || /^fd/i.test(h)) {
      return { ok: false, error: 'webhook_url_private_ipv6' };
    }
    if (/^fe[89ab]/i.test(h)) {
      return { ok: false, error: 'webhook_url_link_local_ipv6' };
    }
  }
  return { ok: true };
}

function customValidateConfig(
  raw: unknown,
):
  | { ok: true; webhook_url: string; fire_on_statuses: string[] }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'config_not_object' };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.webhook_url !== 'string' || obj.webhook_url.length === 0) {
    return { ok: false, error: 'webhook_url_missing' };
  }
  const safe = customIsSafeWebhookUrl(obj.webhook_url);
  if (!safe.ok) return { ok: false, error: safe.error };
  if (!Array.isArray(obj.fire_on_statuses) || obj.fire_on_statuses.length === 0) {
    return { ok: false, error: 'fire_on_statuses_empty' };
  }
  for (const s of obj.fire_on_statuses) {
    if (typeof s !== 'string' || !CUSTOM_VALID_STATUSES.has(s)) {
      return { ok: false, error: `fire_on_statuses_invalid:${String(s)}` };
    }
  }
  return {
    ok: true,
    webhook_url: obj.webhook_url,
    fire_on_statuses: obj.fire_on_statuses as string[],
  };
}

function customHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function customHmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return customHex(sig);
}

async function dispatchCustom(
  supabase: SupabaseClient,
  row: EventRow,
  provider: ProviderRow,
): Promise<'sent' | 'retry' | 'dead'> {
  const validation = customValidateConfig(provider.config);
  if (!validation.ok) {
    await markDead(supabase, row.id, `custom_config_invalid:${validation.error}`);
    return 'dead';
  }

  // The bus is the source of truth for status filtering, but we re-check
  // here in case a stale event was queued before the operator tightened
  // their fire_on_statuses list.
  const statusInPayload =
    typeof row.payload?.status === 'string' ? (row.payload.status as string) : null;
  const isStatusEvent = row.event_type === 'order.status_changed';
  if (isStatusEvent && statusInPayload && !validation.fire_on_statuses.includes(statusInPayload)) {
    await markSent(supabase, row.id); // Drop quietly; this is not a failure.
    await auditDispatched(supabase, row.tenant_id, row);
    return 'sent';
  }

  const envelope = {
    event: row.event_type,
    test_mode: false,
    order: row.payload,
    delivered_at: new Date().toISOString(),
  };
  const body = JSON.stringify(envelope);
  const signature = await customHmacSha256Hex(provider.webhook_secret, body);

  try {
    const res = await fetch(validation.webhook_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CUSTOM_SIG_HEADER]: signature,
        'x-hir-event': row.event_type,
        'x-hir-test-mode': '0',
      },
      body,
    });
    if (res.ok) {
      console.log('[integration-dispatcher] custom dispatch ok', {
        event_id: row.id,
        tenant_id: row.tenant_id,
        status: res.status,
      });
      await markSent(supabase, row.id);
      await auditDispatched(supabase, row.tenant_id, row);
      return 'sent';
    }
    const retry = res.status >= 500 || res.status === 429;
    const reason = `custom_http_${res.status}`;
    if (!retry) {
      await markDead(supabase, row.id, reason);
      return 'dead';
    }
    const outcome = await markRetry(supabase, row, reason);
    return outcome === 'dead' ? 'dead' : 'retry';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const outcome = await markRetry(supabase, row, `custom_network_error:${msg}`);
    return outcome === 'dead' ? 'dead' : 'retry';
  }
}
