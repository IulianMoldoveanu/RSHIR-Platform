// Content OS — WhatsApp Business Cloud API webhook receiver.
//
// Receives both:
//   - Subscription verification (GET with hub.challenge)
//   - Inbound messages (POST with X-Hub-Signature-256)
//
// Flow:
//   1. Verify signature (HMAC-SHA256 against the app secret stored per
//      brand in content_messaging_channels.webhook_secret).
//   2. Parse payload via WhatsAppProvider.parseIncoming() — returns
//      {kind:'message'} or {kind:'ignored'}.
//   3. For 'ignored' (status updates, read receipts) → 200 OK.
//   4. For 'message' → resolve brand by phone_number_id, INSERT into
//      content_briefs with source='whatsapp' and metadata.text=<user_text>,
//      then 200 OK. Agents run async via cron + dispatcher.
//
// We keep this Edge Function thin — no LLM calls, no expensive work —
// so Meta's 20-second webhook timeout is never hit. Heavy lifting runs
// on a separate cron (content-os-generate).

// @ts-expect-error Deno remote import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

// Inline copy of WhatsApp parsing logic — packages/content-os is a Node
// workspace and Deno cannot import it directly. We re-implement the parts
// we need here (signature verify + parseIncoming) using Web Crypto APIs.

interface IncomingMessage {
  fromUserId: string;
  brandChannelId: string;
  messageType: 'text' | 'button_click' | 'media';
  text?: string;
  buttonPayload?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  externalMessageId: string;
  sentAt: Date;
}

async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith('sha256=')) return false;
  const expectedHex = header.slice('sha256='.length);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (expectedHex.length !== computedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ computedHex.charCodeAt(i);
  }
  return diff === 0;
}

function parseIncoming(body: unknown): { kind: 'message'; message: IncomingMessage } | { kind: 'ignored'; reason: string } {
  const b = body as Record<string, unknown>;
  if (!b || b.object !== 'whatsapp_business_account') {
    return { kind: 'ignored', reason: 'not_whatsapp_event' };
  }
  const entry = (b.entry as Array<Record<string, unknown>> | undefined)?.[0];
  const change = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  if (!change || change.field !== 'messages') {
    return { kind: 'ignored', reason: 'not_messages_change' };
  }
  const value = change.value as Record<string, unknown>;
  const metadata = value?.metadata as { phone_number_id?: string } | undefined;
  const phoneNumberId = metadata?.phone_number_id;
  if (!phoneNumberId) return { kind: 'ignored', reason: 'missing_phone_number_id' };

  const msg = (value?.messages as Array<Record<string, unknown>> | undefined)?.[0];
  if (!msg || !msg.from || !msg.id || !msg.timestamp) {
    return { kind: 'ignored', reason: 'no_inbound_message' };
  }
  const sentAt = new Date(Number(msg.timestamp) * 1000);
  const base = {
    fromUserId: String(msg.from),
    brandChannelId: phoneNumberId,
    externalMessageId: String(msg.id),
    sentAt,
  };
  if (msg.type === 'interactive') {
    const interactive = msg.interactive as { type?: string; button_reply?: { id?: string } } | undefined;
    if (interactive?.type === 'button_reply' && interactive.button_reply?.id) {
      return {
        kind: 'message',
        message: { ...base, messageType: 'button_click', buttonPayload: interactive.button_reply.id },
      };
    }
  }
  if (msg.type === 'text') {
    const text = (msg.text as { body?: string } | undefined)?.body;
    if (text) {
      return { kind: 'message', message: { ...base, messageType: 'text', text } };
    }
  }
  return { kind: 'ignored', reason: `unsupported_type:${msg.type ?? 'unknown'}` };
}

// @ts-expect-error Deno global
serve(async (req: Request) => {
  // Meta subscription verification (one-time during webhook config).
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    // @ts-expect-error Deno env
    const expectedToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && token === expectedToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const rawBody = await req.text();

  // @ts-expect-error Deno env
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // @ts-expect-error Deno env
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Parse payload once to find the brand channel.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const parsed = parseIncoming(payload);
  if (parsed.kind === 'ignored') {
    // Status updates / read receipts → 200 OK so Meta doesn't retry.
    return new Response('ignored', { status: 200 });
  }

  // Resolve brand by phone_number_id.
  const { data: channel, error: channelErr } = await supabase
    .from('content_messaging_channels')
    .select('id, brand_id, webhook_secret, is_active')
    .eq('channel_kind', 'whatsapp')
    .eq('external_id', parsed.message.brandChannelId)
    .maybeSingle();

  if (channelErr || !channel || !channel.is_active) {
    // Unknown brand channel. Still 200 OK to prevent Meta retries — log
    // server-side for triage.
    console.warn('content-whatsapp-webhook: unknown or inactive channel', {
      phoneNumberId: parsed.message.brandChannelId,
      err: channelErr?.message,
    });
    return new Response('unknown channel', { status: 200 });
  }

  if (!(await verifySignature(rawBody, req.headers.get('x-hub-signature-256'), channel.webhook_secret))) {
    return new Response('signature mismatch', { status: 401 });
  }

  // Insert a content_brief seeded by this user message. The cron job
  // content-os-generate picks it up next tick and runs the agent pipeline.
  const { error: insertErr } = await supabase.from('content_briefs').insert({
    brand_id: channel.brand_id,
    pillar: 'promo',          // default — Hepi NL classifier refines later
    goal: 'conversion',
    source: 'whatsapp',
    source_ref: parsed.message.externalMessageId,
    metadata: {
      from_user_id: parsed.message.fromUserId,
      message_type: parsed.message.messageType,
      text: parsed.message.text,
      button_payload: parsed.message.buttonPayload,
      sent_at: parsed.message.sentAt.toISOString(),
    },
  });

  if (insertErr) {
    console.error('content-whatsapp-webhook: brief insert failed', insertErr);
    // Return 200 anyway — Meta retry will not help DB errors.
    return new Response('logged', { status: 200 });
  }

  return new Response('ok', { status: 200 });
});
