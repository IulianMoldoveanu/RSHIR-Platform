/**
 * Edge Function: courier-push-dispatch
 *
 * Sends a Web Push notification to all registered couriers in a given fleet
 * when a new order arrives. Intended to be called from a Postgres trigger
 * (via pg_net or Supabase Webhooks) or manually from the dispatcher.
 *
 * POST /functions/v1/courier-push-dispatch
 * Auth: service-role key (internal only — not called from the browser)
 * Body: { fleet_id: string; order_id: string; title?: string; body?: string }
 *
 * VAPID integration: requires env vars:
 *   VAPID_PUBLIC_KEY  — base64url VAPID public key
 *   VAPID_PRIVATE_KEY — base64url VAPID private key
 *   VAPID_SUBJECT     — mailto: or https: URI identifying the sender
 *
 * Generate a VAPID key pair once:
 *   npx web-push generate-vapid-keys
 * Then set them as Supabase Edge Function secrets (see DEPLOY.md).
 *
 * TODO: integrate VAPID signing using the Web Crypto API (Deno-native).
 * The subscription fetch + fan-out skeleton is complete; the actual
 * push send is stubbed below pending VAPID key provisioning.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

type PushPayload = {
  fleet_id: string;
  order_id: string;
  title?: string;
  body?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { fleet_id, order_id, title = 'HIR Courier — Comandă nouă', body = 'Ai o nouă comandă disponibilă.' } = payload;
  if (!fleet_id || !order_id) {
    return new Response(JSON.stringify({ error: 'fleet_id and order_id are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch all courier user_ids in this fleet.
  const { data: profiles, error: profilesErr } = await supabase
    .from('courier_profiles')
    .select('user_id')
    .eq('fleet_id', fleet_id)
    .eq('status', 'ACTIVE');

  if (profilesErr) {
    console.error('[push-dispatch] Failed to fetch couriers', profilesErr);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, note: 'No active couriers in fleet' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userIds = profiles.map((p: { user_id: string }) => p.user_id);

  // Fetch push subscriptions for those couriers.
  const { data: subscriptions, error: subsErr } = await supabase
    .from('courier_push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds);

  if (subsErr) {
    console.error('[push-dispatch] Failed to fetch subscriptions', subsErr);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, note: 'No push subscriptions found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // TODO: integrate VAPID signing and actually send push notifications.
  // VAPID keys must be set as Supabase secrets (see DEPLOY.md):
  //   supabase secrets set VAPID_PUBLIC_KEY=<key>
  //   supabase secrets set VAPID_PRIVATE_KEY=<key>
  //   supabase secrets set VAPID_SUBJECT=mailto:courier@hiraisolutions.ro
  //
  // Use the Web Crypto API (available in Deno) to sign the JWT:
  //   https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign
  //
  // Reference Deno VAPID implementation:
  //   https://github.com/negrel/webpush (Deno-compatible)
  //
  // The push payload to send to each subscription.endpoint:
  const notificationPayload = JSON.stringify({ title, body, orderId: order_id });
  console.log(`[push-dispatch] Would send to ${subscriptions.length} subscription(s):`, notificationPayload);

  // Stale subscription cleanup: remove 410 Gone endpoints.
  // This is done in the VAPID send loop once implemented.
  // For now, log subscriptions for debugging.
  console.log('[push-dispatch] Subscriptions:', subscriptions.map((s: { endpoint: string; user_id: string }) => ({
    user_id: s.user_id,
    endpoint: s.endpoint.substring(0, 60) + '...',
  })));

  return new Response(
    JSON.stringify({
      ok: true,
      sent: 0,
      total_subscriptions: subscriptions.length,
      note: 'VAPID signing not yet implemented — see TODO in courier-push-dispatch/index.ts',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
