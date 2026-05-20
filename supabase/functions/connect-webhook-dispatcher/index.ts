// HIR Connect: outbound webhook dispatcher
// Cron-invoked every 30s. Picks pending deliveries, HMAC-signs the body,
// POSTs to the customer endpoint, manages exponential backoff + dead-letter.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NOTIFY_SECRET = Deno.env.get('HIR_NOTIFY_SECRET') ?? '';

// Retry schedule (minutes from now per attempt count after first try)
const BACKOFF_MINUTES = [0.5, 2, 10, 60, 360, 1440]; // 30s, 2m, 10m, 1h, 6h, 24h
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1; // 7 total tries before dead-letter
const DELIVERY_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 100;

interface DeliveryRow {
  id: string;
  endpoint_id: string;
  tenant_id: string;
  event_type: string;
  order_id: string | null;
  request_body: Record<string, unknown>;
  attempt_count: number;
}

interface EndpointRow {
  id: string;
  url: string;
  signing_secret_hash: string;
  consecutive_failures: number;
}

function nextRetryAt(attemptCount: number): string | null {
  const idx = attemptCount - 1;
  if (idx >= BACKOFF_MINUTES.length) return null;
  const minutes = BACKOFF_MINUTES[idx];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function dispatchOne(
  supabase: ReturnType<typeof createClient>,
  delivery: DeliveryRow,
  endpoint: EndpointRow,
  signingSecret: string,
): Promise<{ delivered: boolean; status: number | null; dead: boolean }> {
  const body = JSON.stringify(delivery.request_body);
  const signature = hmacSign(signingSecret, `${delivery.id}.${body}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  let response: Response | null = null;
  let errorMsg: string | null = null;
  try {
    response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HIR-Signature': `sha256=${signature}`,
        'X-HIR-Event': delivery.event_type,
        'X-HIR-Delivery-Id': delivery.id,
        'X-HIR-Tenant': delivery.tenant_id,
      },
      body,
      signal: controller.signal,
    });
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
  }

  const status = response?.status ?? null;
  const respBody = response ? (await response.text()).slice(0, 2000) : null;
  const ok = status !== null && status >= 200 && status < 300;
  const nextAttempt = delivery.attempt_count + 1;

  if (ok) {
    await supabase
      .from('connect_webhook_deliveries')
      .update({
        delivered_at: new Date().toISOString(),
        attempt_count: nextAttempt,
        response_status: status,
        response_body_truncated: respBody,
      })
      .eq('id', delivery.id);
    await supabase
      .from('connect_webhook_endpoints')
      .update({
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
      })
      .eq('id', endpoint.id);
    return { delivered: true, status, dead: false };
  }

  // Failure path
  const dead = nextAttempt >= MAX_ATTEMPTS;
  const next = dead ? null : nextRetryAt(nextAttempt);
  const reason = errorMsg ?? `HTTP ${status}`;

  await supabase
    .from('connect_webhook_deliveries')
    .update({
      attempt_count: nextAttempt,
      response_status: status,
      response_body_truncated: respBody,
      next_retry_at: next ?? new Date().toISOString(),
      dead,
    })
    .eq('id', delivery.id);

  await supabase
    .from('connect_webhook_endpoints')
    .update({
      last_failure_at: new Date().toISOString(),
      last_failure_reason: reason,
      consecutive_failures: endpoint.consecutive_failures + 1,
      active: dead && endpoint.consecutive_failures + 1 >= MAX_ATTEMPTS ? false : true,
    })
    .eq('id', endpoint.id);

  return { delivered: false, status, dead };
}

Deno.serve(async (req) => {
  // Auth: shared secret header (no JWT — cron-only)
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (!NOTIFY_SECRET || got !== NOTIFY_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Pick pending
  const { data: pending, error: pendingErr } = await supabase
    .from('connect_webhook_deliveries')
    .select('id, endpoint_id, tenant_id, event_type, order_id, request_body, attempt_count')
    .is('delivered_at', null)
    .eq('dead', false)
    .lt('next_retry_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (pendingErr) {
    return new Response(JSON.stringify({ error: 'db_select_failed', detail: pendingErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const deliveries = (pending ?? []) as DeliveryRow[];
  if (deliveries.length === 0) {
    return new Response(JSON.stringify({ processed: 0, delivered: 0, failed: 0, dead: 0 }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // Fetch endpoints + signing secrets in batch
  const endpointIds = [...new Set(deliveries.map((d) => d.endpoint_id))];
  const { data: endpointRows } = await supabase
    .from('connect_webhook_endpoints')
    .select('id, url, signing_secret_hash, consecutive_failures')
    .in('id', endpointIds);
  const endpointMap = new Map<string, EndpointRow>(
    (endpointRows ?? []).map((e: EndpointRow) => [e.id, e]),
  );

  // We store the plaintext signing secret in Supabase Vault under
  // name = `connect_webhook_secret_${endpoint_id}`. Fetch via decrypted_secrets view.
  const { data: vaultRows } = await supabase
    .rpc('connect_get_endpoint_secrets', { endpoint_ids: endpointIds });
  const secretMap = new Map<string, string>(
    ((vaultRows ?? []) as Array<{ endpoint_id: string; secret: string }>).map((r) => [
      r.endpoint_id,
      r.secret,
    ]),
  );

  let delivered = 0;
  let failed = 0;
  let dead = 0;

  for (const d of deliveries) {
    const ep = endpointMap.get(d.endpoint_id);
    const secret = secretMap.get(d.endpoint_id);
    if (!ep || !secret) {
      // Endpoint disappeared or secret missing — mark dead
      await supabase
        .from('connect_webhook_deliveries')
        .update({ dead: true, response_body_truncated: 'endpoint_or_secret_missing' })
        .eq('id', d.id);
      dead++;
      continue;
    }
    const res = await dispatchOne(supabase, d, ep, secret);
    if (res.delivered) delivered++;
    else if (res.dead) dead++;
    else failed++;
  }

  return new Response(
    JSON.stringify({ processed: deliveries.length, delivered, failed, dead }),
    { headers: { 'content-type': 'application/json' } },
  );
});
