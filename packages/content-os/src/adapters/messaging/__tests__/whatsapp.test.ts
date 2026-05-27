import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WhatsAppProvider,
  WhatsAppCapExceededError,
  type WaMarketingCapChecker,
} from '../whatsapp';

const provider = new WhatsAppProvider();

describe('WhatsAppProvider.parseIncoming', () => {
  it('returns ignored on non-WA payload', () => {
    expect(provider.parseIncoming({ foo: 'bar' })).toEqual({
      kind: 'ignored',
      reason: 'not_whatsapp_event',
    });
  });

  it('returns ignored on status-only events', () => {
    expect(
      provider.parseIncoming({
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '111' },
                  statuses: [{ id: 'wamid.xxx', status: 'delivered' }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({ kind: 'ignored', reason: 'no_inbound_message' });
  });

  it('parses text messages', () => {
    const result = provider.parseIncoming({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'PHONE_ID' },
                messages: [
                  {
                    from: '40773000000',
                    id: 'wamid.abc',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Fă reclamă' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.message.messageType).toBe('text');
      expect(result.message.text).toBe('Fă reclamă');
      expect(result.message.fromUserId).toBe('40773000000');
      expect(result.message.brandChannelId).toBe('PHONE_ID');
      expect(result.message.externalMessageId).toBe('wamid.abc');
    }
  });

  it('parses interactive button replies', () => {
    const result = provider.parseIncoming({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'PHONE_ID' },
                messages: [
                  {
                    from: '40773000000',
                    id: 'wamid.btn',
                    timestamp: '1700000100',
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: { id: 'approve_draft_xyz', title: 'Aprob' },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result.kind).toBe('message');
    if (result.kind === 'message') {
      expect(result.message.messageType).toBe('button_click');
      expect(result.message.buttonPayload).toBe('approve_draft_xyz');
    }
  });
});

describe('WhatsAppProvider.verifySignature', () => {
  it('rejects missing or malformed header', () => {
    expect(
      provider.verifySignature({
        rawBody: '{}',
        signatureHeader: null,
        webhookSecret: 'topsecret',
      }),
    ).toBe(false);
    expect(
      provider.verifySignature({
        rawBody: '{}',
        signatureHeader: 'md5=abc',
        webhookSecret: 'topsecret',
      }),
    ).toBe(false);
  });

  it('rejects when computed digest differs', () => {
    expect(
      provider.verifySignature({
        rawBody: '{"a":1}',
        signatureHeader: 'sha256=deadbeef',
        webhookSecret: 'topsecret',
      }),
    ).toBe(false);
  });

  it('accepts a correctly-signed payload', () => {
    const computed = createHmac('sha256', 'topsecret').update('{"a":1}').digest('hex');
    expect(
      provider.verifySignature({
        rawBody: '{"a":1}',
        signatureHeader: `sha256=${computed}`,
        webhookSecret: 'topsecret',
      }),
    ).toBe(true);
  });
});

describe('WhatsAppProvider.sendMarketing', () => {
  // We stub `fetch` so the test doesn't hit Meta. The cap-checker is
  // exercised BEFORE fetch — when it rejects, fetch must NEVER be called
  // (avoiding paid conversation consumption).
  const originalFetch = globalThis.fetch;
  let fetchCalls: Array<{ url: string; init?: RequestInit }>;

  beforeEach(() => {
    fetchCalls = [];
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws CapExceededError BEFORE calling Meta when cap-checker rejects', async () => {
    const checker: WaMarketingCapChecker = async () => ({
      allowed: false,
      message: 'cap atins',
      used: 30,
      cap: 30,
    });
    await expect(
      provider.sendMarketing({
        tenantId: 'tnt-1',
        channelExternalId: 'PHONE_ID',
        accessToken: 'tkn',
        toUserId: '40773000000',
        text: 'Pizza azi 25 RON',
        capChecker: checker,
      }),
    ).rejects.toBeInstanceOf(WhatsAppCapExceededError);
    expect(fetchCalls).toHaveLength(0);
  });

  it('calls Meta sendText when cap-checker allows', async () => {
    let called = 0;
    const checker: WaMarketingCapChecker = async (tenantId) => {
      called++;
      expect(tenantId).toBe('tnt-1');
      return { allowed: true, used: 1, cap: 30 };
    };
    await provider.sendMarketing({
      tenantId: 'tnt-1',
      channelExternalId: 'PHONE_ID',
      accessToken: 'tkn',
      toUserId: '40773000000',
      text: 'Pizza azi 25 RON',
      capChecker: checker,
    });
    expect(called).toBe(1);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('PHONE_ID/messages');
    const body = JSON.parse((fetchCalls[0].init?.body as string) ?? '{}');
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Pizza azi 25 RON');
  });

  it('dispatches buttons send when buttons[] is supplied', async () => {
    const checker: WaMarketingCapChecker = async () => ({ allowed: true });
    await provider.sendMarketing({
      tenantId: 'tnt-1',
      channelExternalId: 'PHONE_ID',
      accessToken: 'tkn',
      toUserId: '40773000000',
      text: 'Approve draft?',
      buttons: [{ id: 'yes', label: 'Da' }, { id: 'no', label: 'Nu' }],
      capChecker: checker,
    });
    const body = JSON.parse((fetchCalls[0].init?.body as string) ?? '{}');
    expect(body.type).toBe('interactive');
    expect(body.interactive.action.buttons).toHaveLength(2);
  });

  it('skips the cap-checker for HIR_INTERNAL (tenantId null)', async () => {
    let called = 0;
    const checker: WaMarketingCapChecker = async () => {
      called++;
      return { allowed: false };
    };
    await provider.sendMarketing({
      tenantId: null,
      channelExternalId: 'PHONE_ID',
      accessToken: 'tkn',
      toUserId: '40773000000',
      text: 'HIR self-marketing',
      capChecker: checker,
    });
    expect(called).toBe(0);
    expect(fetchCalls).toHaveLength(1);
  });

  it('throws when neither text nor media is supplied', async () => {
    await expect(
      provider.sendMarketing({
        tenantId: 'tnt-1',
        channelExternalId: 'PHONE_ID',
        accessToken: 'tkn',
        toUserId: '40773000000',
      }),
    ).rejects.toThrow(/text or media is required/);
  });
});
