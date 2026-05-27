import { describe, expect, it } from 'vitest';
import { TelegramProvider } from '../telegram';

const provider = new TelegramProvider();

describe('TelegramProvider.parseIncoming', () => {
  it('returns ignored on empty payload', () => {
    expect(provider.parseIncoming(null)).toEqual({
      kind: 'ignored',
      reason: 'not_telegram_update',
    });
  });

  it('parses text messages', () => {
    const result = provider.parseIncoming({
      update_id: 1,
      message: {
        message_id: 42,
        from: { id: 12345 },
        chat: { id: 12345, type: 'private' },
        date: 1700000000,
        text: '/reclama Pizza Margherita',
      },
    });
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.message.text).toBe('/reclama Pizza Margherita');
      expect(result.message.fromUserId).toBe('12345');
      expect(result.message.brandChannelId).toBe('12345');
      expect(result.message.messageType).toBe('text');
    }
  });

  it('parses callback_query as button click', () => {
    const result = provider.parseIncoming({
      update_id: 2,
      callback_query: {
        id: 'q1',
        from: { id: 12345 },
        message: { message_id: 99, chat: { id: 12345 } },
        data: 'approve_draft_xyz',
      },
    });
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.message.messageType).toBe('button_click');
      expect(result.message.buttonPayload).toBe('approve_draft_xyz');
    }
  });

  it('parses voice messages as media', () => {
    const result = provider.parseIncoming({
      message: {
        message_id: 1,
        from: { id: 1 },
        chat: { id: 1 },
        date: 1700000000,
        voice: { file_id: 'voice123', mime_type: 'audio/ogg' },
      },
    });
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.message.messageType).toBe('media');
      expect(result.message.mediaUrl).toBe('voice123');
      expect(result.message.mediaMimeType).toBe('audio/ogg');
    }
  });

  it('returns ignored for unsupported message types', () => {
    expect(
      provider.parseIncoming({
        message: {
          message_id: 1,
          from: { id: 1 },
          chat: { id: 1 },
          date: 1700000000,
          // sticker — not a kind we handle
        },
      }),
    ).toEqual({ kind: 'ignored', reason: 'unsupported_message_kind' });
  });
});

describe('TelegramProvider.verifySignature', () => {
  it('rejects mismatched secret', () => {
    expect(
      provider.verifySignature({
        rawBody: '',
        signatureHeader: 'wrong',
        webhookSecret: 'right',
      }),
    ).toBe(false);
  });

  it('accepts exact secret match', () => {
    expect(
      provider.verifySignature({
        rawBody: '',
        signatureHeader: 'mysecret123',
        webhookSecret: 'mysecret123',
      }),
    ).toBe(true);
  });

  it('rejects nullable signature header', () => {
    expect(
      provider.verifySignature({
        rawBody: '',
        signatureHeader: null,
        webhookSecret: 'something',
      }),
    ).toBe(false);
  });
});

describe('TelegramProvider HTML escaping', () => {
  it('escapes <, >, & in sendText when parse_mode=HTML active', async () => {
    const captured: Array<{ url: string; body: string }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      captured.push({ url, body: String(init?.body ?? '') });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      await provider.sendText({
        channelExternalId: 'chat',
        accessToken: 'tok',
        toUserId: '1',
        text: 'R&D <Pizza> 5 > 2',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(captured).toHaveLength(1);
    const body = JSON.parse(captured[0].body);
    expect(body.text).toBe('R&amp;D &lt;Pizza&gt; 5 &gt; 2');
    expect(body.parse_mode).toBe('HTML');
  });
});
