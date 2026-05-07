// Edge Function: whatsapp-webhook
//
// Lane WHATSAPP-BUSINESS-API-SKELETON. Receives Meta WhatsApp Business
// Cloud API webhooks (verification GET + event POST), routes inbound
// messages to the Master Orchestrator dispatcher, sends replies via the
// Graph API. Skeleton — full intent surface lands in Sprint 15+.
//
// Endpoints:
//   GET  ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//        → echoes hub.challenge when verify_token matches WHATSAPP_VERIFY_TOKEN.
//        Required by Meta during webhook configuration.
//   POST { entry: [{ changes: [{ value: { messages: [...] } }] }] }
//        → HMAC-SHA256 verify against META_APP_SECRET (X-Hub-Signature-256
//          header), parse first message, route, send reply.
//
// Binding flow (mirror Hepy):
//   1. OWNER mints a nonce in /dashboard/settings/whatsapp.
//   2. UI returns wa.me/<biz_phone>?text=connect%20<nonce>.
//   3. OWNER taps the link in WhatsApp, sends "connect <nonce>".
//   4. This webhook consumes the nonce, writes whatsapp_owner_bindings,
//      replies "Hepy WhatsApp este conectat la <tenant>".
//   5. Subsequent messages from that wa_phone_number are scoped to the
//      bound tenant (skeleton: only logs + acks; Sprint 15 routes to
//      Master Orchestrator intents).
//
// Secrets (set via Mgmt API after Meta approval):
//   - META_APP_SECRET            — for HMAC verification of POST bodies
//   - WHATSAPP_VERIFY_TOKEN      — arbitrary string Iulian sets in Meta UI
//   - WHATSAPP_ACCESS_TOKEN      — long-lived system-user token for sends
//   - WHATSAPP_PHONE_ID          — numeric Phone Number ID from Meta
//
// When any secret is missing, GET verification still works (so the URL
// can be installed before secrets are pasted), but POST returns 503 with
// a structured body — never silently ACKs and loses messages.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRunLog } from '../_shared/log.ts';
import {
  verifyMetaSignature,
  classifySkeletonIntent,
} from '../_shared/whatsapp.ts';

const NONCE_TTL_MS = 60 * 60 * 1000; // 1h
const GRAPH_VERSION = 'v19.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-hub-signature-256',
};

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

// ────────────────────────────────────────────────────────────
// WhatsApp Cloud API — send a text message.
// Returns the wamid on success, null on failure (logged).
// ────────────────────────────────────────────────────────────
async function waSendText(
  phoneId: string,
  accessToken: string,
  toPhoneE164: string,
  body: string,
): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  // Strip leading '+' — the Graph API accepts both, but the wamid lookup
  // below joins on the canonical no-plus form, so normalise here.
  const to = toPhoneE164.replace(/^\+/, '');
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: body.slice(0, 4096) },
    }),
  });
  if (!r.ok) {
    console.warn('[whatsapp] send fail', r.status, await r.text().catch(() => ''));
    return null;
  }
  const j = await r.json().catch(() => ({}));
  return j?.messages?.[0]?.id ?? null;
}

// ────────────────────────────────────────────────────────────
// Persist a message log row. Best-effort; never blocks the reply path.
// ────────────────────────────────────────────────────────────
async function logMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: {
    tenantId: string | null;
    bindingId: string | null;
    direction: 'inbound' | 'outbound';
    waPhoneNumber: string;
    waMessageId: string | null;
    messageType: string;
    body: string | null;
    intent: string | null;
    rawPayload: unknown;
    errorText?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('whatsapp_messages').insert({
      tenant_id: row.tenantId,
      binding_id: row.bindingId,
      direction: row.direction,
      wa_phone_number: row.waPhoneNumber,
      wa_message_id: row.waMessageId,
      message_type: row.messageType,
      body: row.body?.slice(0, 4096) ?? null,
      intent: row.intent,
      raw_payload: row.rawPayload ?? null,
      error_text: row.errorText ?? null,
    });
    if (error) console.warn('[whatsapp] message log failed', error.message);
  } catch (e) {
    console.warn('[whatsapp] message log threw', (e as Error).message);
  }
}

// ────────────────────────────────────────────────────────────
// Resolve which tenant a wa_phone_number is bound to. Returns null when
// the number is not bound (caller decides whether to prompt for connect).
// ────────────────────────────────────────────────────────────
async function resolveBinding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  waPhoneNumber: string,
): Promise<{ binding_id: string; tenant_id: string; tenant_name: string; owner_user_id: string } | null> {
  const { data } = await supabase
    .from('whatsapp_owner_bindings')
    .select('id, tenant_id, owner_user_id, tenants(name)')
    .eq('wa_phone_number', waPhoneNumber)
    .is('unbound_at', null)
    .order('bound_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (data as any).tenants;
  return {
    binding_id: data.id as string,
    tenant_id: data.tenant_id as string,
    tenant_name: t?.name ?? '(restaurant)',
    owner_user_id: data.owner_user_id as string,
  };
}

// ────────────────────────────────────────────────────────────
// Consume a connect nonce — atomic via UPDATE ... WHERE consumed_at IS
// NULL (race-safe). Returns the (tenant_id, owner_user_id) on success.
// ────────────────────────────────────────────────────────────
async function consumeNonce(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  nonce: string,
  waPhoneNumber: string,
): Promise<{ tenant_id: string; owner_user_id: string } | null> {
  const { data: nonceRow } = await supabase
    .from('whatsapp_connect_nonces')
    .select('nonce, tenant_id, owner_user_id, created_at, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle();
  if (!nonceRow) return null;
  if (nonceRow.consumed_at) return null;
  if (Date.now() - new Date(nonceRow.created_at).getTime() > NONCE_TTL_MS) return null;

  // Atomic claim — prevent double-bind on rapid resend.
  const { data: claimed, error: claimErr } = await supabase
    .from('whatsapp_connect_nonces')
    .update({ consumed_at: new Date().toISOString(), consumed_by_wa: waPhoneNumber })
    .eq('nonce', nonce)
    .is('consumed_at', null)
    .select('nonce')
    .maybeSingle();
  if (claimErr || !claimed) return null;

  // Unbind any prior active binding for this phone or this owner+tenant.
  await supabase
    .from('whatsapp_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('wa_phone_number', waPhoneNumber)
    .is('unbound_at', null);
  await supabase
    .from('whatsapp_owner_bindings')
    .update({ unbound_at: new Date().toISOString() })
    .eq('owner_user_id', nonceRow.owner_user_id)
    .eq('tenant_id', nonceRow.tenant_id)
    .is('unbound_at', null);

  return { tenant_id: nonceRow.tenant_id, owner_user_id: nonceRow.owner_user_id };
}

// ────────────────────────────────────────────────────────────
// Read-only intent stubs — Sprint 15 replaces with Master Orchestrator
// dispatch. Skeleton just queries the obvious tables and replies.
// ────────────────────────────────────────────────────────────
async function intentOrdersNow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<string> {
  // restaurant_orders schema (20260425_000_initial.sql):
  //   tenant_id uuid (NOT restaurant_id)
  //   status check (PENDING|CONFIRMED|PREPARING|READY|DISPATCHED|IN_DELIVERY|DELIVERED|CANCELLED)
  // "Active" = anything not yet delivered or cancelled.
  const { count } = await supabase
    .from('restaurant_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY']);
  const n = count ?? 0;
  return `Aveți ${n} ${n === 1 ? 'comandă activă' : 'comenzi active'} acum.`;
}

async function intentSalesToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
): Promise<string> {
  // restaurant_orders.total_ron numeric(10,2) is the canonical total.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('restaurant_orders')
    .select('total_ron')
    .eq('tenant_id', tenantId)
    .eq('status', 'DELIVERED')
    .gte('created_at', start.toISOString());
  const sum = (data ?? []).reduce(
    (acc: number, r: { total_ron: number | string | null }) => acc + Number(r.total_ron ?? 0),
    0,
  );
  return `Vânzări astăzi: ${sum.toFixed(2)} RON.`;
}

function helpReply(tenantName: string): string {
  return [
    `Hepy WhatsApp · ${tenantName}`,
    '',
    'Comenzi disponibile:',
    '· „comenzi" — câte sunt active acum',
    '· „vânzări" — total astăzi',
    '· „ajutor" — această listă',
    '',
    'Doar citire pentru moment. Mai multe comenzi în curând.',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────
function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return withRunLog('whatsapp-webhook', async ({ setMetadata }) => {
    const url = new URL(req.url);

    // ── GET: webhook verification handshake ────────────────
    if (req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge') ?? '';
      const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
      if (mode === 'subscribe' && expected && token === expected) {
        setMetadata({ verify: 'ok' });
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }
      setMetadata({ verify: 'failed' });
      return new Response('forbidden', { status: 403, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    const appSecret = Deno.env.get('META_APP_SECRET');
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
    if (!appSecret || !accessToken || !phoneId) {
      setMetadata({ secrets_missing: true });
      return json(503, { error: 'whatsapp_secrets_missing' });
    }

    const rawBody = await req.text();
    const sig = req.headers.get('x-hub-signature-256');
    const valid = await verifyMetaSignature(rawBody, sig, appSecret);
    if (!valid) {
      setMetadata({ hmac: 'invalid' });
      return json(401, { error: 'invalid_signature' });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json(400, { error: 'invalid_json' });
    }

    // Meta envelope: { entry: [{ changes: [{ value: { messages: [...], contacts: [...] } }] }] }
    // We only handle the first message in the first change of the first entry — Meta
    // batches up to ~200 events per webhook but pricing/skeleton scope is one-at-a-time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (payload as any)?.entry?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const change = entry?.changes?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = change?.value;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = value?.messages?.[0];
    if (!message) {
      // Status update or other non-message event — ACK without action.
      setMetadata({ event: 'non_message' });
      return json(200, { ok: true, ignored: true });
    }

    const fromRaw: string = message.from ?? '';
    const waPhoneNumber = fromRaw.startsWith('+') ? fromRaw : `+${fromRaw}`;
    const waMessageId: string | null = message.id ?? null;
    const messageType: string = message.type ?? 'unknown';
    const body: string = messageType === 'text' ? (message.text?.body ?? '') : '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Multimedia / unsupported types — log and gently nudge to text.
    if (messageType !== 'text') {
      await logMessage(supabase, {
        tenantId: null,
        bindingId: null,
        direction: 'inbound',
        waPhoneNumber,
        waMessageId,
        messageType,
        body: null,
        intent: 'unsupported',
        rawPayload: payload,
      });
      const reply = 'Mesajele media nu sunt suportate momentan. Trimiteți un mesaj text.';
      const sentId = await waSendText(phoneId, accessToken, waPhoneNumber, reply);
      await logMessage(supabase, {
        tenantId: null,
        bindingId: null,
        direction: 'outbound',
        waPhoneNumber,
        waMessageId: sentId,
        messageType: 'text',
        body: reply,
        intent: 'unsupported_reply',
        rawPayload: null,
        errorText: sentId ? null : 'send_failed',
      });
      setMetadata({ message_type: messageType });
      return json(200, { ok: true });
    }

    const classified = classifySkeletonIntent(body);
    setMetadata({ intent: classified.intent });

    // Connect flow ──────────────────────────────────────────
    if (classified.intent === 'connect' && classified.nonce) {
      const consumed = await consumeNonce(supabase, classified.nonce, waPhoneNumber);
      await logMessage(supabase, {
        tenantId: consumed?.tenant_id ?? null,
        bindingId: null,
        direction: 'inbound',
        waPhoneNumber,
        waMessageId,
        messageType: 'text',
        body,
        intent: 'connect',
        rawPayload: payload,
      });
      if (!consumed) {
        const reply = 'Linkul a expirat sau a fost deja folosit. Generați altul din /dashboard/settings/whatsapp.';
        const sentId = await waSendText(phoneId, accessToken, waPhoneNumber, reply);
        await logMessage(supabase, {
          tenantId: null,
          bindingId: null,
          direction: 'outbound',
          waPhoneNumber,
          waMessageId: sentId,
          messageType: 'text',
          body: reply,
          intent: 'connect_failed',
          rawPayload: null,
          errorText: sentId ? null : 'send_failed',
        });
        return json(200, { ok: true });
      }

      // Insert the new binding.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profileName = (value as any)?.contacts?.[0]?.profile?.name ?? null;
      const { data: newBinding } = await supabase
        .from('whatsapp_owner_bindings')
        .insert({
          wa_phone_number: waPhoneNumber,
          tenant_id: consumed.tenant_id,
          owner_user_id: consumed.owner_user_id,
          wa_display_name: profileName,
          last_active_at: new Date().toISOString(),
        })
        .select('id, tenants(name)')
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenantName = (newBinding as any)?.tenants?.name ?? '(restaurant)';
      const reply = `Conectat la ${tenantName}. Trimiteți „ajutor" pentru lista de comenzi.`;
      const sentId = await waSendText(phoneId, accessToken, waPhoneNumber, reply);
      await logMessage(supabase, {
        tenantId: consumed.tenant_id,
        bindingId: (newBinding?.id as string | undefined) ?? null,
        direction: 'outbound',
        waPhoneNumber,
        waMessageId: sentId,
        messageType: 'text',
        body: reply,
        intent: 'connect_ok',
        rawPayload: null,
        errorText: sentId ? null : 'send_failed',
      });
      return json(200, { ok: true, bound: true });
    }

    // All other intents require an active binding.
    const binding = await resolveBinding(supabase, waPhoneNumber);
    await logMessage(supabase, {
      tenantId: binding?.tenant_id ?? null,
      bindingId: binding?.binding_id ?? null,
      direction: 'inbound',
      waPhoneNumber,
      waMessageId,
      messageType: 'text',
      body,
      intent: classified.intent,
      rawPayload: payload,
    });

    if (!binding) {
      const reply = 'Numărul nu este conectat la un restaurant. Generați un link din /dashboard/settings/whatsapp și trimiteți „connect <cod>".';
      const sentId = await waSendText(phoneId, accessToken, waPhoneNumber, reply);
      await logMessage(supabase, {
        tenantId: null,
        bindingId: null,
        direction: 'outbound',
        waPhoneNumber,
        waMessageId: sentId,
        messageType: 'text',
        body: reply,
        intent: 'unbound_prompt',
        rawPayload: null,
        errorText: sentId ? null : 'send_failed',
      });
      return json(200, { ok: true, unbound: true });
    }

    // Update last_active_at (best-effort).
    await supabase
      .from('whatsapp_owner_bindings')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', binding.binding_id)
      .then(() => undefined, () => undefined);

    let reply: string;
    switch (classified.intent) {
      case 'orders_now':
        reply = await intentOrdersNow(supabase, binding.tenant_id);
        break;
      case 'sales_today':
        reply = await intentSalesToday(supabase, binding.tenant_id);
        break;
      case 'help':
        reply = helpReply(binding.tenant_name);
        break;
      default:
        reply = `Comanda nu este recunoscută. Trimiteți „ajutor" pentru lista de comenzi disponibile.`;
        break;
    }

    const sentId = await waSendText(phoneId, accessToken, waPhoneNumber, reply);
    await logMessage(supabase, {
      tenantId: binding.tenant_id,
      bindingId: binding.binding_id,
      direction: 'outbound',
      waPhoneNumber,
      waMessageId: sentId,
      messageType: 'text',
      body: reply,
      intent: classified.intent,
      rawPayload: null,
      errorText: sentId ? null : 'send_failed',
    });

    setMetadata({ tenant_id: binding.tenant_id });
    return json(200, { ok: true });
  });
});
