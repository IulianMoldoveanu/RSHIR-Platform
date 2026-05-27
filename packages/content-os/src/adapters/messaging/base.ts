// MessagingProvider — channel-agnostic control plane for Hepi (WhatsApp + Telegram).
//
// Inbound: webhook receiver parses platform-specific payload → IncomingMessage.
// Outbound: send text / buttons / media. The orchestrator never touches the
// raw platform API — it calls these methods on whichever provider the brand
// chose at onboarding (preferred_messaging on BrandContext).

import type { MessagingKind } from '../../types';

export interface ButtonSpec {
  // Stable identifier persisted as button_payload in IncomingMessage.
  // Used to dispatch action without re-parsing free text. Max 256 chars.
  id: string;
  // Visible label. Max 20 chars on WhatsApp quick_reply, 64 on Telegram.
  label: string;
}

export type IncomingMessageType = 'text' | 'button_click' | 'media';

export interface IncomingMessage {
  // Platform-specific user identifier:
  //   - WhatsApp: phone number in E.164 (e.g. "40773XXXXXX")
  //   - Telegram: chat_id as string (e.g. "123456789")
  fromUserId: string;

  // Which brand received this message. Resolved by the webhook by looking
  // up `content_messaging_channels` via the platform's "to" identifier.
  brandChannelId: string;

  messageType: IncomingMessageType;

  // Populated when messageType === 'text'.
  text?: string;

  // Populated when messageType === 'button_click'. Mirrors ButtonSpec.id
  // from the most recent outbound prompt.
  buttonPayload?: string;

  // Populated when messageType === 'media'. Short-lived URL the bot can
  // download (WhatsApp media stays addressable ~5 days, Telegram URL has
  // its own TTL — caller should snapshot if needed long-term).
  mediaUrl?: string;
  mediaMimeType?: string;

  // Provider-specific reference for idempotency + audit (WA wamid, TG message_id).
  externalMessageId: string;

  // When the platform reports the message was sent. Used to drop stale events
  // on cold starts and to compute WhatsApp 24h utility-template window.
  sentAt: Date;
}

/**
 * Result of a parseIncoming call. Returns null when the webhook payload
 * is a non-message event (status update, read receipt, verification ping)
 * that the orchestrator does not handle — caller responds 200 OK and exits.
 */
export type ParseResult =
  | { kind: 'message'; message: IncomingMessage }
  | { kind: 'ignored'; reason: string };

export interface MessagingProvider {
  readonly name: MessagingKind;
  readonly supportsInteractiveButtons: boolean;
  readonly maxButtonsPerMessage: number;
  /** Cost per outbound conversation in cents (USD). Telegram = 0. */
  readonly costPerConversationCents: number;

  /**
   * Parse a raw webhook body (already JSON-decoded) into IncomingMessage.
   * Implementations MUST be pure — no DB writes, no side effects.
   * Caller is responsible for signature verification BEFORE calling parse.
   */
  parseIncoming(webhookBody: unknown): ParseResult;

  /**
   * Verify the signature header on a webhook delivery. Returns true when
   * the request is authentic. Must reject early on signature mismatch.
   */
  verifySignature(opts: {
    rawBody: string;
    signatureHeader: string | null;
    webhookSecret: string;
  }): boolean;

  /** Send plain text. Used for ack messages and short replies. */
  sendText(opts: {
    channelExternalId: string;     // brand's phone_number_id (WA) or bot_token holder (TG)
    accessToken: string;           // bearer for WA; bot_token for TG
    toUserId: string;
    text: string;
  }): Promise<void>;

  /**
   * Send text + 1-N interactive buttons. WhatsApp quick_reply caps at 3 buttons;
   * Telegram inline_keyboard supports more. Caller MUST respect maxButtonsPerMessage.
   */
  sendButtons(opts: {
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    body: string;
    buttons: ButtonSpec[];
  }): Promise<void>;

  /**
   * Send a media (image/video) preview with caption. Used to present a
   * generated content draft for approval.
   */
  sendMediaPreview(opts: {
    channelExternalId: string;
    accessToken: string;
    toUserId: string;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption: string;
  }): Promise<void>;
}
