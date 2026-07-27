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
  classifySkeletonIntent,
  decideHandshake,
  gatePostRequest,
} from '../_shared/whatsapp.ts';
import {
  classifyIntent,
  formatWhatsApp,
  type HepyIntent,
  type HepyPeriod,
} from '../_shared/hepy-brain.ts';
import { dispatchIntent } from '../_shared/master-orchestrator.ts';

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
// Real Hepy intents over WhatsApp. Uses the SHARED brain classifier
// (_shared/hepy-brain.ts) + the SAME Master Orchestrator dispatcher the
// Telegram webhook uses (dispatchIntent). Read intents run directly; write
// intents (offers, menu) go through dispatchIntent's trust gate, so a
// tenant with a PROPOSE_ONLY category gets a proposal to confirm — the
// owner-configured guardrails apply unchanged. Replies are WhatsApp plain
// text (no HTML), 4096-capped via formatWhatsApp.
// ────────────────────────────────────────────────────────────

function fmtRon(n: number): string {
  return `${n.toFixed(2)} RON`;
}

function helpReply(tenantName: string): string {
  return formatWhatsApp(
    [
      `Hepy · ${tenantName}`,
      '',
      'Întrebați-mă firesc, de ex.:',
      '· „câte comenzi am acum”',
      '· „cum a mers azi” / „vânzări azi”',
      '· „top produse săptămâna asta”',
      '· „câți curieri sunt online”',
      '· „ce recomandări am azi”',
      '',
      'Scrieți normal — vă răspund în secunde.',
    ].join('\n'),
  );
}

// Run one classified Hepy intent for a bound tenant and return a
// WhatsApp-ready reply string. Mirrors the Telegram runIntent read paths;
// analytics/growth intents flow through the shared orchestrator.
async function runWhatsAppIntent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string,
  tenantName: string,
  intent: HepyIntent,
  period: HepyPeriod | undefined,
): Promise<string> {
  if (intent === 'orders_now') {
    const { count } = await supabase
      .from('restaurant_orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY']);
    const c = count ?? 0;
    return formatWhatsApp(
      `📋 ${tenantName} — comenzi în desfășurare\n${c} comen${c === 1 ? 'dă' : 'zi'} active acum.`,
    );
  }

  if (intent === 'couriers_online') {
    const { count } = await supabase
      .from('courier_shifts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ONLINE');
    const c = count ?? 0;
    return formatWhatsApp(`🛵 Curieri online acum\n${c} curier${c === 1 ? '' : 'i'} în tură.`);
  }

  if (intent === 'orders_summary') {
    const r = await dispatchIntent(supabase, {
      tenantId,
      channel: 'whatsapp',
      intent: 'analytics.summary',
      payload: { period: period ?? 'today' },
    });
    if (!(r.ok && r.state === 'EXECUTED')) {
      return formatWhatsApp(`📊 ${tenantName}\nNu am putut citi sumarul momentan.`);
    }
    const d = r.data as {
      label: string;
      orders: number;
      revenue_ron: number;
      cancelled: number;
      orders_delta: string;
      revenue_delta: string;
      top_products: Array<{ name: string; qty: number; revenue: number }>;
    };
    const lines = [
      `📊 ${tenantName} — cum a mers ${d.label}`,
      '',
      `Comenzi: ${d.orders}  ${d.orders_delta}`,
      `Încasări: ${fmtRon(Number(d.revenue_ron))}  ${d.revenue_delta}`,
    ];
    if (d.cancelled > 0) lines.push(`Anulate: ${d.cancelled}`);
    if (d.top_products.length) {
      lines.push('', 'Top produse:');
      for (const t of d.top_products) {
        lines.push(`· ${t.name} — ${t.qty} buc · ${fmtRon(Number(t.revenue))}`);
      }
    }
    return formatWhatsApp(lines.join('\n'));
  }

  if (intent === 'top_products') {
    const r = await dispatchIntent(supabase, {
      tenantId,
      channel: 'whatsapp',
      intent: 'analytics.top_products',
      payload: { period: period ?? 'week', limit: 10 },
    });
    if (!(r.ok && r.state === 'EXECUTED')) {
      return formatWhatsApp(`🍽️ ${tenantName}\nNu am putut citi topul produselor momentan.`);
    }
    const d = r.data as { label: string; products: Array<{ name: string; qty: number; revenue: number }> };
    if (d.products.length === 0) {
      return formatWhatsApp(`🍽️ ${tenantName} — top produse (${d.label})\nNiciun produs vândut în această perioadă.`);
    }
    const lines = [`🍽️ ${tenantName} — top produse (${d.label})`];
    for (const p of d.products) {
      lines.push(`· ${p.name} — ${p.qty} buc · ${fmtRon(Number(p.revenue))}`);
    }
    return formatWhatsApp(lines.join('\n'));
  }

  if (intent === 'recommendations_today') {
    const r = await dispatchIntent(supabase, {
      tenantId,
      channel: 'whatsapp',
      intent: 'analytics.recommendations_today',
      payload: { days: 7 },
    });
    if (!(r.ok && r.state === 'EXECUTED')) {
      return formatWhatsApp(`💡 ${tenantName} — recomandări\nNu am putut citi recomandările momentan.`);
    }
    const d = r.data as {
      days: number;
      recommendations: Array<{ priority: string; category: string; title_ro: string; suggested_action_ro: string }>;
    };
    if (!d.recommendations || d.recommendations.length === 0) {
      return formatWhatsApp(`💡 ${tenantName} — recomandări\nNicio recomandare nouă în ultimele ${d.days} zile.`);
    }
    const prioEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
    const lines = [`💡 ${tenantName} — recomandări (ultimele ${d.days} zile)`];
    for (const rec of d.recommendations.slice(0, 5)) {
      const e = prioEmoji[rec.priority] ?? '·';
      lines.push('', `${e} ${rec.title_ro}`, `${rec.category} · ${(rec.suggested_action_ro || '').slice(0, 180)}`);
    }
    return formatWhatsApp(lines.join('\n'));
  }

  // Unknown / NONE — nudge toward help.
  return formatWhatsApp(
    `Nu am înțeles exact. Trimiteți „ajutor” pentru ce pot face, sau întrebați firesc (ex. „câte comenzi am acum”).`,
  );
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
      const challenge = url.searchParams.get('hub.challenge');
      const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
      const echo = decideHandshake(mode, token, challenge, expected);
      if (echo !== null) {
        setMetadata({ verify: 'ok' });
        return new Response(echo, { status: 200, headers: corsHeaders });
      }
      setMetadata({ verify: 'failed' });
      return new Response('forbidden', { status: 403, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    // Feature flag → secrets → signature → JSON: the ladder runs in one
    // pure helper so vitest can cover every branch without booting Deno.
    const appSecret = Deno.env.get('META_APP_SECRET');
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneId = Deno.env.get('WHATSAPP_PHONE_ID');
    const rawBody = await req.text();
    const sig = req.headers.get('x-hub-signature-256');
    const gate = await gatePostRequest({
      enabled: Deno.env.get('WHATSAPP_ENABLED') === 'true',
      appSecret,
      accessToken,
      phoneId,
      rawBody,
      signatureHeader: sig,
    });
    if (gate.status !== 200) {
      setMetadata({ gate: gate.kind });
      const errMap = {
        disabled: 'whatsapp_disabled',
        secrets_missing: 'whatsapp_secrets_missing',
        invalid_signature: 'invalid_signature',
        invalid_json: 'invalid_json',
      } as const;
      return json(gate.status, { error: errMap[gate.kind] });
    }

    // Gate passed → JSON.parse will succeed (gate already validated it).
    const payload: Record<string, unknown> = JSON.parse(rawBody);

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

    // Post-binding routing uses the REAL shared brain (same classifier as
    // Telegram) + the Master Orchestrator dispatcher. `classifySkeletonIntent`
    // above is retained only to detect the connect handshake / nonce.
    let reply: string;
    let ranIntent: string = classified.intent;
    if (classified.intent === 'help') {
      reply = helpReply(binding.tenant_name);
      ranIntent = 'help';
    } else {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
      const nlu = await classifyIntent(body, anthropicKey);
      ranIntent = nlu.intent;
      reply = await runWhatsAppIntent(
        supabase,
        binding.tenant_id,
        binding.tenant_name,
        nlu.intent,
        nlu.period,
      );
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
      intent: ranIntent,
      rawPayload: null,
      errorText: sentId ? null : 'send_failed',
    });

    setMetadata({ tenant_id: binding.tenant_id });
    return json(200, { ok: true });
  });
});
