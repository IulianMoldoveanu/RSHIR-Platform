// WhatsApp Business Cloud API adapter (Meta).
//
// Docs:
//   https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Pricing 2026 (Rest of World tier — Romania falls here):
//   - Marketing conversation: ~$0.016
//   - Utility conversation: ~$0.008 (free in 24h user-initiated window)
//   - Service conversation: free
//
// Standard-plan cap (2026-05-27): 30 marketing conversations / tenant /
// month. Enforced via `sendMarketing(...)` which takes a `capChecker`
// callback the caller wires to checkAndIncrementUsage('whatsapp_marketing').
// Utility and service messages bypass the cap.
//
// Webhook signature: X-Hub-Signature-256: sha256=<hex>, computed over the
// raw request body using the App Secret. NEVER skip verification.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  ButtonSpec,
  IncomingMessage,
  MessagingProvider,
  ParseResult,
} from './base';

const META_GRAPH_VERSION = 'v21.0';
const WA_MAX_BUTTON_LABEL = 20;
const WA_MAX_BUTTONS = 3;
const WA_MAX_BUTTON_ID = 256;

/** Result of an external cap check (e.g. usage-caps RPC). Same shape as VideoGen. */
export interface WaCapCheckOutcome {
  allowed: boolean;
  message?: string;
  used?: number;
  cap?: number;
}

/** Caller-supplied gate for marketing sends. Receives tenantId, returns the outcome. */
export type WaMarketingCapChecker = (tenantId: string) => Promise<WaCapCheckOutcome>;

export class WhatsAppCapExceededError extends Error {
  readonly kind = 'cap_exceeded' as const;
  readonly used?: number;
  readonly cap?: number;
  constructor(message: string, opts?: { used?: number; cap?: number }) {
    super(message);
    this.name = 'WhatsAppCapExceededError';
    this.used = opts?.used;
    this.cap = opts?.cap;
  }
}

interface WhatsAppWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
          image?: { id?: string; mime_type?: string };
          video?: { id?: string; mime_type?: string };
          audio?: { id?: string; mime_type?: string };
        }>;
        statuses?: unknown[];
      };
    }>;
  }>;
}

export class WhatsAppProvider implements MessagingProvider {
  readonly name = 'whatsapp' as const;
  readonly supportsInteractiveButtons = true;
  readonly maxButtonsPerMessage = WA_MAX_BUTTONS;
  readonly costPerConversationCents = 2; // ~$0.016 marketing on RoW

  parseIncoming(webhookBody: unknown): ParseResult {
    const body = webhookBody as WhatsAppWebhookBody;

    // Drop verification / status / non-WA events early so the dispatcher
    // does not error out on Meta's "hub.mode" challenge or read receipts.
    if (!body || body.object !== 'whatsapp_business_account') {
      return { kind: 'ignored', reason: 'not_whatsapp_event' };
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    if (!change || change.field !== 'messages') {
      return { kind: 'ignored', reason: 'not_messages_change' };
    }

    const value = change.value;
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) {
      return { kind: 'ignored', reason: 'missing_phone_number_id' };
    }

    // Status updates (read/delivered/sent) come without a `messages[]`.
    const msg = value.messages?.[0];
    if (!msg || !msg.from || !msg.id || !msg.timestamp) {
      return { kind: 'ignored', reason: 'no_inbound_message' };
    }

    const sentAt = new Date(Number(msg.timestamp) * 1000);

    // Interactive button click — preferred path for approve/reject flows.
    if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
      const payload = msg.interactive.button_reply?.id;
      if (!payload) {
        return { kind: 'ignored', reason: 'button_reply_no_id' };
      }
      const message: IncomingMessage = {
        fromUserId: msg.from,
        brandChannelId: phoneNumberId,
        messageType: 'button_click',
        buttonPayload: payload,
        externalMessageId: msg.id,
        sentAt,
      };
      return { kind: 'message', message };
    }

    // Plain text — the free-form command path ("fă o reclamă pentru ...").
    if (msg.type === 'text' && msg.text?.body) {
      const message: IncomingMessage = {
        fromUserId: msg.from,
        brandChannelId: phoneNumberId,
        messageType: 'text',
        text: msg.text.body,
        externalMessageId: msg.id,
        sentAt,
      };
      return { kind: 'message', message };
    }

    // Media — we accept image / video / audio. The orchestrator may use
    // image as visual reference, audio as voice command (Whisper transcribe).
    if (msg.type === 'image' || msg.type === 'video' || msg.type === 'audio') {
      const mediaBucket =
        msg.type === 'image' ? msg.image : msg.type === 'video' ? msg.video : msg.audio;
      if (!mediaBucket?.id) {
        return { kind: 'ignored', reason: 'media_without_id' };
      }
      // The webhook only carries media IDs — the caller resolves a download
      // URL via a separate /v21.0/<media_id> call. We return the id here
      // and let the orchestrator decide whether to fetch.
      const message: IncomingMessage = {
        fromUserId: msg.from,
        brandChannelId: phoneNumberId,
        messageType: 'media',
        mediaUrl: mediaBucket.id, // caller resolves to signed URL
        mediaMimeType: mediaBucket.mime_type,
        externalMessageId: msg.id,
        sentAt,
      };
      return { kind: 'message', message };
    }

    return { kind: 'ignored', reason: `unsupported_type:${msg.type ?? 'unknown'}` };
  }

  verifySignature({
    rawBody,
    signatureHeader,
    webhookSecret,
  }: {
    rawBody: string;
    signatureHeader: string | null;
    webhookSecret: string;
  }): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }
    const expected = signatureHeader.slice('sha256='.length);
    const computed = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (expected.length !== computed.length) return false;
    try {
      return timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(computed, 'hex'),
      );
    } catch {
      return false;
    }
  }

  async sendText({
    channelExternalId,
    accessToken,
    toUserId,
    text,
  }: {
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    text: string;
  }): Promise<void> {
    await this.postMessages(channelExternalId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toUserId,
      type: 'text',
      text: { preview_url: false, body: text },
    });
  }

  async sendButtons({
    channelExternalId,
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
    if (buttons.length > WA_MAX_BUTTONS) {
      throw new Error(
        `sendButtons: WhatsApp supports max ${WA_MAX_BUTTONS} quick-reply buttons, got ${buttons.length}`,
      );
    }
    for (const b of buttons) {
      if (b.id.length > WA_MAX_BUTTON_ID) {
        throw new Error(`sendButtons: button.id too long (max ${WA_MAX_BUTTON_ID})`);
      }
      if (b.label.length > WA_MAX_BUTTON_LABEL) {
        throw new Error(
          `sendButtons: button.label too long (max ${WA_MAX_BUTTON_LABEL}) for WhatsApp`,
        );
      }
    }

    await this.postMessages(channelExternalId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toUserId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.label },
          })),
        },
      },
    });
  }

  async sendMediaPreview({
    channelExternalId,
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
    await this.postMessages(channelExternalId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toUserId,
      type: mediaType,
      [mediaType]: { link: mediaUrl, caption },
    });
  }

  /**
   * Marketing-category send. Gated by the Standard-plan cap of 30
   * marketing conversations / tenant / month. Throws
   * `WhatsAppCapExceededError` BEFORE hitting the Meta API on over-cap,
   * so no paid conversation is consumed.
   *
   * Use this instead of `sendText` / `sendButtons` / `sendMediaPreview`
   * whenever the message is a promotion, broadcast, or content-os push.
   * Utility (order updates, OTP) and service (reply within 24h window)
   * messages must keep using the plain `sendText` path — they're free
   * on WhatsApp and outside the cap envelope.
   */
  async sendMarketing(opts: {
    /** Tenant whose cap to consume. Omit for HIR_INTERNAL brands. */
    tenantId: string | null;
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    /** Either text body OR (mediaUrl + mediaType) must be set. */
    text?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    caption?: string;
    buttons?: ButtonSpec[];
    /** Cap gate. Caller wires this to checkAndIncrementUsage('whatsapp_marketing'). */
    capChecker?: WaMarketingCapChecker;
  }): Promise<void> {
    if (opts.capChecker && opts.tenantId) {
      const outcome = await opts.capChecker(opts.tenantId);
      if (!outcome.allowed) {
        throw new WhatsAppCapExceededError(
          outcome.message ??
            `Cap atins pentru WhatsApp marketing (${outcome.used ?? '?'}/${outcome.cap ?? '?'} luna asta).`,
          { used: outcome.used, cap: outcome.cap },
        );
      }
    }

    if (opts.mediaUrl && opts.mediaType) {
      return this.sendMediaPreview({
        channelExternalId: opts.channelExternalId,
        accessToken: opts.accessToken,
        toUserId: opts.toUserId,
        mediaUrl: opts.mediaUrl,
        mediaType: opts.mediaType,
        caption: opts.caption ?? opts.text ?? '',
      });
    }
    if (opts.buttons && opts.buttons.length > 0) {
      return this.sendButtons({
        channelExternalId: opts.channelExternalId,
        accessToken: opts.accessToken,
        toUserId: opts.toUserId,
        body: opts.text ?? opts.caption ?? '',
        buttons: opts.buttons,
      });
    }
    if (!opts.text) {
      throw new Error('sendMarketing: text or media is required');
    }
    return this.sendText({
      channelExternalId: opts.channelExternalId,
      accessToken: opts.accessToken,
      toUserId: opts.toUserId,
      text: opts.text,
    });
  }

  private async postMessages(
    phoneNumberId: string,
    accessToken: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WhatsApp send failed: ${res.status} ${text.slice(0, 500)}`);
    }
  }
}
