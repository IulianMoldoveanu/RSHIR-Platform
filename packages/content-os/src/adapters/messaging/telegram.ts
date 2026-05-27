// Telegram Bot API adapter.
//
// Docs: https://core.telegram.org/bots/api
//
// Telegram bot is free for both inbound and outbound. We use it as the
// no-cost fallback control plane for patroni who don't want WhatsApp
// Business API setup. Same MessagingProvider interface as WhatsApp so
// the orchestrator code is identical.
//
// Webhook signature: Telegram uses `X-Telegram-Bot-Api-Secret-Token` header,
// compared verbatim to the secret set via setWebhook. No HMAC.

import type {
  ButtonSpec,
  IncomingMessage,
  MessagingProvider,
  ParseResult,
} from './base';

const TG_API_BASE = 'https://api.telegram.org';

// Telegram inline button callback_data is capped at 64 bytes.
const TG_MAX_CALLBACK_DATA = 64;
// Buttons per row — we keep one button per row for mobile-friendly tap target.
const TG_BUTTONS_PER_ROW = 1;

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; username?: string };
    chat?: { id?: number; type?: string };
    date?: number;
    text?: string;
    photo?: Array<{ file_id?: string }>;
    video?: { file_id?: string; mime_type?: string };
    voice?: { file_id?: string; mime_type?: string };
    audio?: { file_id?: string; mime_type?: string };
  };
  callback_query?: {
    id?: string;
    from?: { id?: number };
    message?: { message_id?: number; chat?: { id?: number } };
    data?: string;
  };
}

export class TelegramProvider implements MessagingProvider {
  readonly name = 'telegram' as const;
  readonly supportsInteractiveButtons = true;
  readonly maxButtonsPerMessage = 8; // soft cap for screen real estate
  readonly costPerConversationCents = 0;

  parseIncoming(webhookBody: unknown): ParseResult {
    const upd = webhookBody as TelegramUpdate;
    if (!upd || typeof upd !== 'object') {
      return { kind: 'ignored', reason: 'not_telegram_update' };
    }

    // Callback query — inline button tapped. Preferred path for approvals.
    if (upd.callback_query) {
      const cq = upd.callback_query;
      const chatId = cq.message?.chat?.id;
      const fromId = cq.from?.id;
      const data = cq.data;
      if (!chatId || !fromId || !data) {
        return { kind: 'ignored', reason: 'callback_query_missing_fields' };
      }
      const message: IncomingMessage = {
        fromUserId: String(fromId),
        // For Telegram, brandChannelId is the bot's own identity. The webhook
        // route writes the brand binding into the secret, but operationally
        // we use the chat_id at the orchestrator layer to resolve which
        // brand the user is talking to (a single bot can serve multiple
        // brands by binding chat_id → brand in content_messaging_channels).
        brandChannelId: String(chatId),
        messageType: 'button_click',
        buttonPayload: data,
        externalMessageId: cq.id ?? String(cq.message?.message_id ?? ''),
        // callback_query doesn't include a server timestamp; the underlying
        // message.date is the closest signal we have for "when did this user
        // last interact with the bot."
        sentAt: new Date(),
      };
      return { kind: 'message', message };
    }

    // Standard message — text, media, or voice command.
    const msg = upd.message;
    if (!msg || !msg.chat?.id || !msg.from?.id) {
      return { kind: 'ignored', reason: 'no_message' };
    }
    const sentAt = msg.date ? new Date(msg.date * 1000) : new Date();
    const base = {
      fromUserId: String(msg.from.id),
      brandChannelId: String(msg.chat.id),
      externalMessageId: String(msg.message_id ?? ''),
      sentAt,
    };

    if (msg.text) {
      const message: IncomingMessage = {
        ...base,
        messageType: 'text',
        text: msg.text,
      };
      return { kind: 'message', message };
    }

    // Voice / audio for spoken commands ("Hepi, fă o reclamă la pizza").
    if (msg.voice?.file_id || msg.audio?.file_id) {
      const v = msg.voice ?? msg.audio!;
      const message: IncomingMessage = {
        ...base,
        messageType: 'media',
        mediaUrl: v.file_id, // caller resolves via getFile + file_path
        mediaMimeType: v.mime_type,
      };
      return { kind: 'message', message };
    }

    // Photo / video as visual reference for content generation.
    if (msg.photo?.length || msg.video?.file_id) {
      const fileId = msg.video?.file_id ?? msg.photo?.[msg.photo.length - 1]?.file_id;
      if (!fileId) {
        return { kind: 'ignored', reason: 'media_without_file_id' };
      }
      const message: IncomingMessage = {
        ...base,
        messageType: 'media',
        mediaUrl: fileId,
        mediaMimeType: msg.video?.mime_type,
      };
      return { kind: 'message', message };
    }

    return { kind: 'ignored', reason: 'unsupported_message_kind' };
  }

  verifySignature({
    signatureHeader,
    webhookSecret,
  }: {
    rawBody: string;
    signatureHeader: string | null;
    webhookSecret: string;
  }): boolean {
    // Telegram sends the secret token VERBATIM in `X-Telegram-Bot-Api-Secret-Token`
    // — no HMAC, no body involved. We still use a constant-time compare to be safe.
    if (!signatureHeader || !webhookSecret) return false;
    if (signatureHeader.length !== webhookSecret.length) return false;
    let diff = 0;
    for (let i = 0; i < signatureHeader.length; i++) {
      diff |= signatureHeader.charCodeAt(i) ^ webhookSecret.charCodeAt(i);
    }
    return diff === 0;
  }

  async sendText({
    accessToken,
    toUserId,
    text,
  }: {
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    text: string;
  }): Promise<void> {
    await this.postApi(accessToken, 'sendMessage', {
      chat_id: toUserId,
      text,
      parse_mode: 'HTML',
    });
  }

  async sendButtons({
    accessToken,
    toUserId,
    body,
    buttons,
  }: {
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    body: string;
    buttons: ButtonSpec[];
  }): Promise<void> {
    if (buttons.length === 0) {
      throw new Error('sendButtons: at least one button required');
    }
    for (const b of buttons) {
      if (Buffer.byteLength(b.id, 'utf8') > TG_MAX_CALLBACK_DATA) {
        throw new Error(
          `sendButtons: callback_data too long (max ${TG_MAX_CALLBACK_DATA} bytes) for Telegram`,
        );
      }
    }
    // Stack buttons one per row for mobile tap clarity.
    const inline_keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let i = 0; i < buttons.length; i += TG_BUTTONS_PER_ROW) {
      inline_keyboard.push(
        buttons.slice(i, i + TG_BUTTONS_PER_ROW).map((b) => ({
          text: b.label,
          callback_data: b.id,
        })),
      );
    }

    await this.postApi(accessToken, 'sendMessage', {
      chat_id: toUserId,
      text: body,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard },
    });
  }

  async sendMediaPreview({
    accessToken,
    toUserId,
    mediaUrl,
    mediaType,
    caption,
  }: {
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption: string;
  }): Promise<void> {
    const method = mediaType === 'image' ? 'sendPhoto' : 'sendVideo';
    const payload: Record<string, unknown> = {
      chat_id: toUserId,
      caption,
      parse_mode: 'HTML',
    };
    payload[mediaType === 'image' ? 'photo' : 'video'] = mediaUrl;
    await this.postApi(accessToken, method, payload);
  }

  private async postApi(
    botToken: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const url = `${TG_API_BASE}/bot${botToken}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Telegram ${method} failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }
}
