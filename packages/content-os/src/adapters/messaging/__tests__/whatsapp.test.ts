import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WhatsAppProvider } from '../whatsapp';

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
