// Lane RT-PUSH — track-broadcast.
//
// Triggered by AFTER UPDATE OF status on public.restaurant_orders (see
// 20260606_005_track_realtime_broadcast.sql). Fires for every meaningful
// status transition (CONFIRMED, PREPARING, READY, DISPATCHED, IN_DELIVERY,
// DELIVERED, CANCELLED) and broadcasts a small payload over the per-order
// Supabase Realtime channel `track:<public_track_token>`.
//
// The channel name carries the unguessable UUID `public_track_token` — same
// secret that gates the existing GET /api/track/:token. Anyone who has the
// link to the track page already has read access; broadcasting on that
// token-named channel keeps the same trust boundary without widening
// anonymous DB SELECT.
//
// We DO NOT include sensitive fields (customer email, address, exact
// courier identity) in the broadcast payload — clients re-fetch the
// authoritative record from /api/track/:token after they receive the
// `status_change` event. The broadcast is just an "invalidate now" hint.
//
// Env (Supabase function secrets):
//   HIR_NOTIFY_SECRET   shared secret with the DB trigger (already set)
// Auto-injected by the Supabase Edge runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Body = { order_id: string; tenant_id: string; status: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

const HANDLED = new Set([
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
]);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Constant-time secret-header check (matches notify-customer-status pattern).
  const expected = Deno.env.get('HIR_NOTIFY_SECRET');
  if (!expected) return json(500, { error: 'secret_not_configured' });
  const got = req.headers.get('x-hir-notify-secret') ?? '';
  if (got.length !== expected.length) return json(401, { error: 'unauthorized' });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) return json(401, { error: 'unauthorized' });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!isUuid(body.order_id) || !isUuid(body.tenant_id) || typeof body.status !== 'string') {
    return json(400, { error: 'invalid_body' });
  }
  if (!HANDLED.has(body.status)) {
    return json(200, { ok: true, skipped: 'status_not_handled', status: body.status });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'supabase_env_missing' });

  // Look up the order's public_track_token + updated_at. Service-role read.
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // We only need the public_track_token. We deliberately DO NOT re-read the
  // status from the DB: net.http_post is asynchronous, so two rapid
  // transitions can land in reverse order; reading `order.status` here would
  // emit the latest state for both webhooks and silently drop the intermediate
  // transition. Using `body.status` from the trigger payload preserves the
  // exact transition the trigger fired on (Codex P2, 2026-05-05).
  const { data: order, error: orderErr } = await supabase
    .from('restaurant_orders')
    .select('id, public_track_token')
    .eq('id', body.order_id)
    .eq('tenant_id', body.tenant_id)
    .maybeSingle();

  if (orderErr || !order) {
    if (orderErr) console.error('[track-broadcast] order lookup failed:', orderErr.message);
    return json(404, { error: 'order_not_found' });
  }
  if (!order.public_track_token) {
    return json(200, { ok: true, skipped: 'no_track_token' });
  }

  // Broadcast via Supabase Realtime REST. POST /realtime/v1/api/broadcast
  // with the service-role key takes a list of messages keyed by channel
  // name. No DB SELECT is required on the consumer side — clients
  // subscribe by channel name and receive whatever we send here.
  //
  // We send a minimal payload: the triggered status + the broadcast
  // timestamp (server clock). Clients use this purely as an "invalidate
  // the React Query cache now" signal and re-fetch /api/track/:token for
  // the authoritative record.
  const payload = {
    order_id: order.id,
    status: body.status,
    broadcast_at: new Date().toISOString(),
  };

  // SECURITY NOTE (Codex P1, 2026-05-05): this broadcast uses a public
  // (non-private) channel. A third party with the track token could ALSO
  // send `status_change` events on the same topic. The track page
  // mitigates this by treating broadcasts as a pure "invalidate the React
  // Query cache now" signal — the displayed state and the fired
  // notification both come from the authoritative /api/track/:token
  // refetch, NOT from the broadcast payload. The worst a spoofer can do
  // is force an extra server fetch.
  //
  // To eliminate even that, migrate to Realtime Authorization (private
  // channels + RLS on realtime.messages) — out of scope for this lane;
  // tracked separately.
  const broadcastUrl = `${SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/broadcast`;
  const r = await fetch(broadcastUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `track:${order.public_track_token}`,
          event: 'status_change',
          payload,
          private: false,
        },
      ],
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[track-broadcast] broadcast failed', r.status, text);
    return json(502, { error: 'broadcast_failed', upstream_status: r.status });
  }

  return json(200, { ok: true, status: body.status, token_short: order.public_track_token.slice(0, 8) });
});
