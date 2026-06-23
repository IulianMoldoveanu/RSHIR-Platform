// Pharma (Lane F): outbound status-callback dispatcher.
// Cron-invoked every 30s. Drains pharma_callback_deliveries, HMAC-signs the body,
// POSTs to the per-order pharma callback URL, manages exponential backoff +
// dead-letter. Mirror of connect-webhook-dispatcher, adapted to the pharma
// contract (raw-body HMAC → x-hir-signature, per-order secret, SSRF guard).
//
// The pharma receiver (courier-inbound) verifies HMAC over the RAW body and
// dedups on the deterministic eventId, so a retry can never double-apply.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NOTIFY_SECRET = Deno.env.get('HIR_NOTIFY_SECRET') ?? '';

// Retry schedule (minutes from now, indexed by attempt_count after the bump).
const BACKOFF_MINUTES = [0.5, 2, 10, 60, 360, 1440]; // 30s, 2m, 10m, 1h, 6h, 24h
const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1; // 7 total tries before dead-letter
const DELIVERY_TIMEOUT_MS = 8_000; // match the inline send (webhook.ts:267)
const BATCH_SIZE = 100;

interface DeliveryRow {
  id: string;
  courier_order_id: string;
  event_id: string;
  pharma_status: string;
  pharma_callback_url: string;
  request_body: Record<string, unknown>;
  attempt_count: number;
}

function nextRetryAt(attemptCount: number): string | null {
  const idx = attemptCount - 1;
  if (idx >= BACKOFF_MINUTES.length) return null;
  return new Date(Date.now() + BACKOFF_MINUTES[idx] * 60_000).toISOString();
}

// Private/reserved IP predicates (shared by literal-host + resolved-IP checks).
function isPrivateV4(addr: string): boolean {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 || a === 127 || a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
    a >= 224 // multicast / reserved
  );
}
function isPrivateV6(addr: string): boolean {
  const h = addr.toLowerCase();
  // loopback / unspecified / unique-local (fc00::/7) / link-local (fe80::/10)
  return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

// SSRF guard. The URL was validated at enqueue, but re-validate at send time AND
// resolve the hostname so a DNS-rebinding attack (public at enqueue → private at
// dispatch) can't reach internal infra. Mirrors the app's assertSafeOutboundUrl
// (webhook.ts) rather than the lighter string-only courier-mirror-pharma guard,
// because THIS function is the one making the outbound request.
async function isSafeCallbackUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }

  // Literal IP host? Check directly. (IPv6 literals always contain ':', so a DNS
  // host like fc.example.com is never misread as fc00::/7.)
  const isV4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isV6Literal = host.includes(':');
  if (isV4Literal) return !isPrivateV4(host);
  if (isV6Literal) return !isPrivateV6(host);

  // DNS hostname → resolve and reject if ANY resolved address is private/loopback.
  // Refuse if it resolves to nothing (can't verify). Edge runtime grants net access.
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(host, 'A').catch(() => [] as string[]),
      Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
    ]);
    const all = [...a, ...aaaa];
    if (all.length === 0) return false;
    for (const ip of all) {
      if (ip.includes(':') ? isPrivateV6(ip) : isPrivateV4(ip)) return false;
    }
  } catch {
    return false;
  }
  return true;
}

function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function dispatchOne(
  supabase: ReturnType<typeof createClient>,
  delivery: DeliveryRow,
  secret: string,
): Promise<{ delivered: boolean; dead: boolean }> {
  const nextAttempt = delivery.attempt_count + 1;

  // Re-validate the snapshotted target before sending (incl. DNS resolution).
  if (!(await isSafeCallbackUrl(delivery.pharma_callback_url))) {
    await supabase
      .from('pharma_callback_deliveries')
      .update({ dead: true, attempt_count: nextAttempt, last_error: 'unsafe_callback_url' })
      .eq('id', delivery.id);
    return { delivered: false, dead: true };
  }

  const body = JSON.stringify(delivery.request_body);
  const signature = hmacSign(secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  let response: Response | null = null;
  let errorMsg: string | null = null;
  try {
    response = await fetch(delivery.pharma_callback_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hir-signature': `sha256=${signature}`,
        'user-agent': 'hir-pharma-callback/1',
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
  const respBody = response ? (await response.text().catch(() => '')).slice(0, 2000) : null;
  const ok = status !== null && status >= 200 && status < 300;

  if (ok) {
    await supabase
      .from('pharma_callback_deliveries')
      .update({
        delivered_at: new Date().toISOString(),
        attempt_count: nextAttempt,
        response_status: status,
        response_body_truncated: respBody,
      })
      .eq('id', delivery.id);
    return { delivered: true, dead: false };
  }

  // 4xx is a contract bug the pharma side owns — retrying never helps, so dead-letter
  // immediately (matches the inline send's `res.status < 500 → break`, webhook.ts:272).
  // 5xx / network → exponential backoff until MAX_ATTEMPTS.
  const is4xx = status !== null && status >= 400 && status < 500;
  const dead = is4xx || nextAttempt >= MAX_ATTEMPTS;
  const next = dead ? null : nextRetryAt(nextAttempt);

  await supabase
    .from('pharma_callback_deliveries')
    .update({
      attempt_count: nextAttempt,
      response_status: status,
      response_body_truncated: respBody,
      next_retry_at: next ?? new Date().toISOString(),
      dead,
      last_error: errorMsg ?? `HTTP ${status}`,
    })
    .eq('id', delivery.id);

  return { delivered: false, dead };
}

// Constant-time secret compare (length-guarded — timingSafeEqual throws on length
// mismatch). Matches the receiver's timingSafeEqual usage.
function secretMatches(got: string): boolean {
  if (!NOTIFY_SECRET) return false;
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(NOTIFY_SECRET);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

Deno.serve(async (req) => {
  // Auth: shared secret header (no JWT — cron-only). Constant-time compare.
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (!secretMatches(got)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: pending, error: pendingErr } = await supabase
    .from('pharma_callback_deliveries')
    .select('id, courier_order_id, event_id, pharma_status, pharma_callback_url, request_body, attempt_count')
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

  // Batch-fetch per-order signing secrets (courier_order_secrets, RLS-locked;
  // service_role bypasses).
  const orderIds = [...new Set(deliveries.map((d) => d.courier_order_id))];
  const { data: secretRows } = await supabase
    .from('courier_order_secrets')
    .select('courier_order_id, pharma_callback_secret')
    .in('courier_order_id', orderIds);
  const secretMap = new Map<string, string>(
    ((secretRows ?? []) as Array<{ courier_order_id: string; pharma_callback_secret: string | null }>)
      .filter((r) => r.pharma_callback_secret)
      .map((r) => [r.courier_order_id, r.pharma_callback_secret as string]),
  );

  let delivered = 0;
  let failed = 0;
  let dead = 0;

  for (const d of deliveries) {
    const secret = secretMap.get(d.courier_order_id);
    if (!secret) {
      // Secret gone (order purged / never had a pharma secret) — can't sign, dead-letter.
      await supabase
        .from('pharma_callback_deliveries')
        .update({ dead: true, last_error: 'pharma_callback_secret_missing' })
        .eq('id', d.id);
      dead++;
      continue;
    }
    const res = await dispatchOne(supabase, d, secret);
    if (res.delivered) delivered++;
    else if (res.dead) dead++;
    else failed++;
  }

  return new Response(
    JSON.stringify({ processed: deliveries.length, delivered, failed, dead }),
    { headers: { 'content-type': 'application/json' } },
  );
});
