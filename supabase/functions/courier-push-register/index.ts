/**
 * Edge Function: courier-push-register
 *
 * Accepts a push registration from the courier client and stores it.
 *
 * Two flavours, distinguished by request body shape:
 *
 *   1. Web/PWA (VAPID Web Push):
 *      Body: { subscription: { endpoint: string; keys: { p256dh, auth } } }
 *      Storage: `courier_push_subscriptions`
 *
 *   2. Native (Capacitor — Android FCM / iOS APNs):
 *      Body: { native_token: string; platform: 'android' | 'ios' | 'web' }
 *      Storage: `courier_push_tokens` (upsert on (courier_id, platform))
 *
 * The web path is preserved verbatim — existing PWA users continue to work.
 *
 * POST /functions/v1/courier-push-register
 * Auth: Bearer <supabase access token>
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

type RegisterBody = {
  // Web VAPID path
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  // Native FCM/APNs path
  native_token?: string;
  platform?: 'android' | 'ios' | 'web';
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Native path: FCM/APNs token ──────────────────────────────────────
  if (body.native_token && body.platform) {
    const { native_token, platform } = body;
    if (!['android', 'ios', 'web'].includes(platform)) {
      return new Response(JSON.stringify({ error: 'invalid_platform' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve courier_profile.id from the authenticated user.
    const { data: profile, error: profileErr } = await supabase
      .from('courier_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      console.error('[courier-push-register] profile lookup failed', profileErr);
      return new Response(JSON.stringify({ error: 'no_courier_profile' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('courier_push_tokens')
      .upsert(
        {
          courier_id: profile.id,
          fcm_token: native_token,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'courier_id,platform' },
      );

    if (error) {
      console.error('[courier-push-register] native upsert failed', error);
      return new Response(JSON.stringify({ error: 'Failed to save native token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, kind: 'native' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Web VAPID path (preserved) ───────────────────────────────────────
  const { endpoint, keys } = body.subscription ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return new Response(JSON.stringify({ error: 'Missing subscription fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error } = await supabase
    .from('courier_push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    );

  if (error) {
    console.error('[courier-push-register] DB error', error);
    return new Response(JSON.stringify({ error: 'Failed to save subscription' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, kind: 'web' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
