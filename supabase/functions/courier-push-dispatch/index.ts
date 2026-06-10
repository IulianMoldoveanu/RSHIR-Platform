/**
 * Edge Function: courier-push-dispatch
 *
 * Sends push notifications to all active couriers in a given fleet when a new
 * order arrives. Called from the order-create flow (server action / webhook)
 * or from a Postgres trigger via pg_net (see migration
 * 20260629_001_courier_orders_push_trigger.sql).
 *
 * Fan-out targets:
 *   - `courier_push_subscriptions` → browser/PWA Web Push (VAPID)
 *   - `courier_push_tokens`        → native FCM (Android/iOS via FCM)
 *
 * POST /functions/v1/courier-push-dispatch
 * Auth: service-role key (internal only — not called from the browser)
 * Body: { fleet_id: string; order_id: string; title?: string; body?: string; urgent?: boolean }
 *
 * Web push (VAPID) env vars:
 *   VAPID_PUBLIC_KEY  — base64url VAPID public key
 *   VAPID_PRIVATE_KEY — base64url VAPID private key
 *   VAPID_SUBJECT     — mailto:/https: URI identifying the sender
 *
 * Native push (FCM) env vars (set ONE of):
 *   FCM_SERVICE_ACCOUNT_JSON — Full JSON of a Firebase service account.
 *                              Preferred. Uses FCM HTTP v1 API.
 *   FCM_SERVER_KEY           — Legacy server key. Fallback to legacy HTTP API.
 *
 * Idempotency:
 *   `courier_orders.courier_push_dispatched_at` is the canonical claim.
 *   The DB trigger sets it inside a `UPDATE ... WHERE IS NULL`. This EF
 *   additionally claims it (no-op if already set) so direct-from-route
 *   callers also benefit. A second invocation observes the column is
 *   non-null and exits early.
 *
 * Stale subscriptions/tokens are pruned automatically:
 *   - Web push 410/404 → delete from courier_push_subscriptions
 *   - FCM `UNREGISTERED` / `INVALID_ARGUMENT` → delete from courier_push_tokens
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error — npm:web-push has no Deno types but works at runtime
import webpush from 'npm:web-push@3.6.7';
import { withRunLog } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

type PushPayload = {
  fleet_id: string;
  order_id: string;
  /**
   * Directed offer: when set, push ONLY this courier (the one the order was
   * offered to) instead of fanning out to the whole fleet. Also skips the
   * `courier_push_dispatched_at` idempotency claim — that column is consumed by
   * the create-time FLEET push, so the directed OFFERED push must not be gated
   * by it (the DB trigger's transition guard is the dedupe). See
   * 20260630_030_courier_offer_push_trigger.sql.
   */
  target_user_id?: string;
  title?: string;
  body?: string;
  urgent?: boolean;
};

type WebSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
};

type NativeToken = {
  id: string;
  courier_user_id: string;
  fcm_token: string;
  platform: 'android' | 'ios' | 'web';
};

type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return withRunLog('courier-push-dispatch', async ({ setMetadata }) => {
    const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:courier@hiraisolutions.ro';
    const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');

    const webPushConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
    const fcmConfigured = Boolean(FCM_SERVICE_ACCOUNT_JSON || FCM_SERVER_KEY);

    if (!webPushConfigured && !fcmConfigured) {
      return new Response(
        JSON.stringify({
          error: 'push_not_configured',
          note:
            'Set VAPID_PUBLIC_KEY+VAPID_PRIVATE_KEY (web) and/or FCM_SERVICE_ACCOUNT_JSON | FCM_SERVER_KEY (native)',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (webPushConfigured) {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
    }

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
      target_user_id,
      title = 'HIR Courier — Comandă nouă',
      body = 'Ai o nouă comandă disponibilă.',
    } = payload;
    if (!fleet_id || !order_id) {
      return new Response(JSON.stringify({ error: 'fleet_id_and_order_id_required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Directed offer → push exactly one courier; otherwise fan out to the fleet.
    const directed = Boolean(target_user_id);
    setMetadata({ fleet_id, order_id, directed });

    // ── Idempotency claim (FLEET push only) ──────────────────────────────
    // The INSERT trigger does `UPDATE ... WHERE IS NULL` before invoking us;
    // this second claim covers direct-from-route.ts callers and gives a clean
    // "already_dispatched" exit for replays. A DIRECTED (OFFERED) push must
    // NOT be gated by this column — it's already consumed by the create-time
    // fleet push, so we skip the claim entirely when targeting one courier
    // (the DB trigger's CREATED→OFFERED transition guard is the dedupe).
    if (!directed) {
      const { data: claimed, error: claimErr } = await supabase
        .from('courier_orders')
        .update({ courier_push_dispatched_at: new Date().toISOString() })
        .eq('id', order_id)
        .is('courier_push_dispatched_at', null)
        .select('id')
        .maybeSingle();

      if (claimErr) {
        // Treat claim failure as non-fatal — the column may not exist on
        // older schemas. Log and continue so we still dispatch.
        console.warn('[push-dispatch] idempotency claim failed', claimErr.message);
      } else if (!claimed) {
        setMetadata({ skipped: 'already_dispatched' });
        return new Response(
          JSON.stringify({ ok: true, sent: 0, note: 'already_dispatched' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Resolve the recipient list ───────────────────────────────────────
    // Directed: just the one offered courier. Fleet: every ACTIVE courier in
    // the fleet. Both courier_push_subscriptions + courier_push_tokens key off
    // user_id, so we only need a list of user ids.
    let userIds: string[];
    if (directed) {
      userIds = [target_user_id!];
    } else {
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
        return new Response(
          JSON.stringify({ ok: true, sent: 0, note: 'no_active_couriers' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      userIds = profiles.map((p: { user_id: string }) => p.user_id);
    }

    // ── Fetch web push subscriptions + native FCM tokens in parallel ─────
    const [{ data: subscriptions, error: subsErr }, { data: tokens, error: tokensErr }] =
      await Promise.all([
        supabase
          .from('courier_push_subscriptions')
          .select('endpoint, p256dh, auth, user_id')
          .in('user_id', userIds),
        supabase
          .from('courier_push_tokens')
          .select('id, courier_user_id, fcm_token, platform')
          .in('courier_user_id', userIds),
      ]);

    if (subsErr) console.error('[push-dispatch] web subs fetch failed', subsErr);
    if (tokensErr) console.error('[push-dispatch] native tokens fetch failed', tokensErr);

    const webSubs: WebSubscription[] = (subscriptions ?? []) as WebSubscription[];
    const nativeTokens: NativeToken[] = (tokens ?? []) as NativeToken[];

    if (webSubs.length === 0 && nativeTokens.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, note: 'no_subscriptions_or_tokens' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const notification = { title, body, orderId: order_id };
    const webPayload = JSON.stringify(notification);

    // ── Web push fan-out (existing path, unchanged behaviour) ────────────
    const webResults = webPushConfigured
      ? await Promise.allSettled(
          webSubs.map(async (s) => {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                webPayload,
                { TTL: 60 },
              );
              return { ok: true as const, endpoint: s.endpoint };
            } catch (err) {
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
        )
      : [];

    // ── Native FCM fan-out ───────────────────────────────────────────────
    let fcmAccessToken: string | null = null;
    let fcmServiceAccount: FcmServiceAccount | null = null;
    let fcmLegacyKey: string | null = null;

    if (nativeTokens.length > 0 && fcmConfigured) {
      if (FCM_SERVICE_ACCOUNT_JSON) {
        try {
          fcmServiceAccount = JSON.parse(FCM_SERVICE_ACCOUNT_JSON) as FcmServiceAccount;
          fcmAccessToken = await getFcmAccessToken(fcmServiceAccount);
        } catch (err) {
          console.error('[push-dispatch] FCM v1 access token error', err);
          fcmServiceAccount = null;
          fcmAccessToken = null;
        }
      }
      if (!fcmAccessToken && FCM_SERVER_KEY) {
        fcmLegacyKey = FCM_SERVER_KEY;
      }
    }

    const fcmResults = nativeTokens.length > 0 && (fcmAccessToken || fcmLegacyKey)
      ? await Promise.allSettled(
          nativeTokens.map(async (t) => {
            const prune = async () => {
              await supabase.from('courier_push_tokens').delete().eq('id', t.id);
            };

            if (fcmAccessToken && fcmServiceAccount) {
              return sendFcmV1({
                accessToken: fcmAccessToken,
                projectId: fcmServiceAccount.project_id,
                token: t.fcm_token,
                title,
                body,
                orderId: order_id,
                prune,
              });
            }
            return sendFcmLegacy({
              serverKey: fcmLegacyKey!,
              token: t.fcm_token,
              title,
              body,
              orderId: order_id,
              prune,
            });
          }),
        )
      : [];

    // ── Tally ────────────────────────────────────────────────────────────
    const webSent = webResults.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    const webPruned = webResults.filter(
      (r) => r.status === 'fulfilled' && !r.value.ok && 'pruned' in r.value && r.value.pruned,
    ).length;
    const fcmSent = fcmResults.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
    const fcmPruned = fcmResults.filter(
      (r) => r.status === 'fulfilled' && !r.value.ok && 'pruned' in r.value && r.value.pruned,
    ).length;

    const sent = webSent + fcmSent;
    const pruned = webPruned + fcmPruned;
    const total = webSubs.length + nativeTokens.length;
    const failed = total - sent - pruned;

    setMetadata({
      sent,
      pruned,
      failed,
      total,
      web_total: webSubs.length,
      native_total: nativeTokens.length,
      web_sent: webSent,
      fcm_sent: fcmSent,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        pruned,
        failed,
        total,
        web: { sent: webSent, pruned: webPruned, total: webSubs.length },
        native: { sent: fcmSent, pruned: fcmPruned, total: nativeTokens.length },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// FCM v1: OAuth2 access token via JWT signed with the service account.
// ────────────────────────────────────────────────────────────────────────

async function getFcmAccessToken(sa: FcmServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT' };

  const enc = (obj: unknown) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(claims)}`;

  const key = await importRsaKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;

  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`FCM token exchange failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('FCM token exchange returned no access_token');
  return json.access_token;
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const der = base64Decode(pemBody);
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type FcmSendArgs = {
  token: string;
  title: string;
  body: string;
  orderId: string;
  prune: () => Promise<void>;
};

async function sendFcmV1(
  args: FcmSendArgs & { accessToken: string; projectId: string },
): Promise<{ ok: true; token: string } | { ok: false; token: string; pruned?: boolean; error?: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${args.projectId}/messages:send`;
  const body = {
    message: {
      token: args.token,
      notification: { title: args.title, body: args.body },
      data: { orderId: args.orderId },
      android: { priority: 'HIGH' as const },
      apns: { headers: { 'apns-priority': '10' } },
    },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, token: args.token };
    const errText = await res.text().catch(() => '');
    // FCM error responses: UNREGISTERED / INVALID_ARGUMENT / NOT_FOUND → prune.
    if (
      res.status === 404 ||
      /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(errText)
    ) {
      await args.prune();
      return { ok: false, token: args.token, pruned: true, error: errText };
    }
    return { ok: false, token: args.token, error: `${res.status} ${errText}` };
  } catch (err) {
    return { ok: false, token: args.token, error: String(err) };
  }
}

async function sendFcmLegacy(
  args: FcmSendArgs & { serverKey: string },
): Promise<{ ok: true; token: string } | { ok: false; token: string; pruned?: boolean; error?: string }> {
  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${args.serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: args.token,
        priority: 'high',
        notification: { title: args.title, body: args.body },
        data: { orderId: args.orderId },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, token: args.token, error: `${res.status} ${errText}` };
    }
    const json = (await res.json()) as {
      success?: number;
      failure?: number;
      results?: Array<{ error?: string; message_id?: string }>;
    };
    const result = json.results?.[0];
    if (result?.error) {
      if (/NotRegistered|InvalidRegistration/i.test(result.error)) {
        await args.prune();
        return { ok: false, token: args.token, pruned: true, error: result.error };
      }
      return { ok: false, token: args.token, error: result.error };
    }
    return { ok: true, token: args.token };
  } catch (err) {
    return { ok: false, token: args.token, error: String(err) };
  }
}
