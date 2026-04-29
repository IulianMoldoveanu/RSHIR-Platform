/**
 * Edge Function: courier-push-dispatch
 *
 * Sends a Web Push notification to all active couriers in a given fleet
 * when a new order arrives. Called from the order-create flow (server
 * action / webhook) or from a Postgres trigger via pg_net.
 *
 * POST /functions/v1/courier-push-dispatch
 * Auth: service-role key (internal only — not called from the browser)
 * Body: { fleet_id: string; order_id: string; title?: string; body?: string }
 *
 * VAPID env vars (set as Supabase secrets — see DEPLOY.md):
 *   VAPID_PUBLIC_KEY  — base64url VAPID public key
 *   VAPID_PRIVATE_KEY — base64url VAPID private key
 *   VAPID_SUBJECT     — mailto: or https: URI identifying the sender
 *
 * Generate keys with:
 *   npx web-push generate-vapid-keys
 *
 * Stale subscription endpoints (HTTP 410 / 404) are pruned from
 * courier_push_subscriptions automatically so the next dispatch runs
 * faster.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error — npm:web-push has no Deno types but works at runtime
import webpush from 'npm:web-push@3.6.7';

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

type Subscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:courier@hiraisolutions.ro';

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(
      JSON.stringify({
        error: 'vapid_not_configured',
        note: 'Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY as Supabase secrets',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const {
    fleet_id,
    order_id,
    title = 'HIR Courier — Comandă nouă',
    body = 'Ai o nouă comandă disponibilă.',
  } = payload;
  if (!fleet_id || !order_id) {
    return new Response(JSON.stringify({ error: 'fleet_id_and_order_id_required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profiles, error: profilesErr } = await supabase
    .from('courier_profiles')
    .select('user_id')
    .eq('fleet_id', fleet_id)
    .eq('status', 'ACTIVE');

  if (profilesErr) {
    console.error('[push-dispatch] profile fetch failed', profilesErr);
    return new Response(JSON.stringify({ error: 'db_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no_active_couriers' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userIds = profiles.map((p: { user_id: string }) => p.user_id);

  const { data: subscriptions, error: subsErr } = await supabase
    .from('courier_push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds);

  if (subsErr) {
    console.error('[push-dispatch] subs fetch failed', subsErr);
    return new Response(JSON.stringify({ error: 'db_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, note: 'no_subscriptions' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const notification = JSON.stringify({ title, body, orderId: order_id });

  const results = await Promise.allSettled(
    (subscriptions as Subscription[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
          { TTL: 60 },
        );
        return { ok: true as const, endpoint: s.endpoint };
      } catch (err) {
        // 410 Gone / 404 Not Found → subscription expired, prune it.
        // Anything else: log and continue.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (err as any)?.statusCode;
        if (status === 410 || status === 404) {
          await supabase
            .from('courier_push_subscriptions')
            .delete()
            .eq('endpoint', s.endpoint);
          return { ok: false as const, endpoint: s.endpoint, pruned: true, status };
        }
        return {
          ok: false as const,
          endpoint: s.endpoint,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error: (err as any)?.message ?? String(err),
        };
      }
    }),
  );

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
  const pruned = results.filter(
    (r) => r.status === 'fulfilled' && !r.value.ok && 'pruned' in r.value && r.value.pruned,
  ).length;
  const failed = results.length - sent - pruned;

  return new Response(
    JSON.stringify({ ok: true, sent, pruned, failed, total: subscriptions.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
