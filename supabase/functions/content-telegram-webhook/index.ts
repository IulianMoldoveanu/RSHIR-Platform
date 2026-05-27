// Content OS — Telegram Bot webhook receiver.
//
// Telegram sends updates via POST. Signature is the verbatim secret token
// in X-Telegram-Bot-Api-Secret-Token (compared in constant time).
//
// Parses message / callback_query, resolves brand by chat_id, inserts
// content_briefs. Same minimal hot path as WhatsApp variant — cron picks
// up briefs and runs the agent pipeline.

// @ts-expect-error Deno remote import
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

interface IncomingMessage {
  fromUserId: string;
  brandChannelId: string;
  messageType: 'text' | 'button_click' | 'media';
  text?: string;
  buttonPayload?: string;
  externalMessageId: string;
  sentAt: Date;
}

function verifySecret(header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  if (header.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) {
    diff |= header.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

function parseUpdate(
  body: unknown,
): { kind: 'message'; message: IncomingMessage } | { kind: 'ignored'; reason: string } {
  const upd = body as Record<string, unknown>;
  if (!upd || typeof upd !== 'object') {
    return { kind: 'ignored', reason: 'not_telegram_update' };
  }

  const callback = upd.callback_query as
    | { id?: string; from?: { id?: number }; message?: { chat?: { id?: number } }; data?: string }
    | undefined;
  if (callback?.data && callback.from?.id && callback.message?.chat?.id) {
    return {
      kind: 'message',
      message: {
        fromUserId: String(callback.from.id),
        brandChannelId: String(callback.message.chat.id),
        messageType: 'button_click',
        buttonPayload: callback.data,
        externalMessageId: callback.id ?? '',
        sentAt: new Date(),
      },
    };
  }

  const msg = upd.message as
    | { message_id?: number; from?: { id?: number }; chat?: { id?: number }; date?: number; text?: string }
    | undefined;
  if (msg?.chat?.id && msg.from?.id && msg.text) {
    return {
      kind: 'message',
      message: {
        fromUserId: String(msg.from.id),
        brandChannelId: String(msg.chat.id),
        messageType: 'text',
        text: msg.text,
        externalMessageId: String(msg.message_id ?? ''),
        sentAt: msg.date ? new Date(msg.date * 1000) : new Date(),
      },
    };
  }

  return { kind: 'ignored', reason: 'unsupported_update' };
}

// @ts-expect-error Deno global
serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // @ts-expect-error Deno env
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // @ts-expect-error Deno env
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const parsed = parseUpdate(payload);
  if (parsed.kind === 'ignored') {
    return new Response('ignored', { status: 200 });
  }

  // Resolve brand by chat_id.
  const { data: channel, error: channelErr } = await supabase
    .from('content_messaging_channels')
    .select('id, brand_id, webhook_secret, is_active')
    .eq('channel_kind', 'telegram')
    .eq('external_id', parsed.message.brandChannelId)
    .maybeSingle();

  if (channelErr || !channel || !channel.is_active) {
    console.warn('content-telegram-webhook: unknown or inactive channel', {
      chatId: parsed.message.brandChannelId,
      err: channelErr?.message,
    });
    return new Response('unknown channel', { status: 200 });
  }

  if (!verifySecret(req.headers.get('x-telegram-bot-api-secret-token'), channel.webhook_secret)) {
    return new Response('signature mismatch', { status: 401 });
  }

  const { error: insertErr } = await supabase.from('content_briefs').insert({
    brand_id: channel.brand_id,
    pillar: 'promo',
    goal: 'conversion',
    source: 'telegram',
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
    console.error('content-telegram-webhook: brief insert failed', insertErr);
    return new Response('logged', { status: 200 });
  }

  return new Response('ok', { status: 200 });
});
