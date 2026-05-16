// Tests for the operator-actions health probes.
//
// Two flavours of probe in this module:
//   1. Pure env-presence probes (Stripe key, Anthropic credit, Twilio,
//      ANAF SPV, manual operator flags, offered-order auto-expiry).
//   2. Supabase metadata probes (Netopia/Viva psp_credentials existence,
//      courier-proofs bucket privacy).
//
// We exercise the pure probes against the real `process.env` and the
// Supabase-touching probes against a mocked `createAdminClient`. The
// smoke test below verifies that, with `process.env` cleared, every
// probe returns a structurally-valid result and never throws.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the admin client BEFORE importing health-checks so the import
// graph picks up our stub. Each test below replaces `mockState` to
// control what storage / psp_credentials returns.
type MockState = {
  pspCredentials?: { count: number | null; error: { message: string } | null };
  bucket?: { data: { public: boolean } | null; error: { message: string } | null };
  throwOnAdminCreate?: boolean;
};
const mockState: MockState = {};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (mockState.throwOnAdminCreate) throw new Error('admin client unavailable');
    return {
      from: (_table: string) => ({
        select: (_cols: string, _opts?: unknown) => ({
          eq: async (_col: string, _val: string) =>
            mockState.pspCredentials ?? { count: 0, error: null },
        }),
      }),
      storage: {
        getBucket: async (_name: string) =>
          mockState.bucket ?? { data: { public: false }, error: null },
      },
    };
  },
}));

import {
  checkStripePublishableKey,
  checkAnthropicCredit,
  checkAuditIntegrityAlertToken,
  checkTwilioCreds,
  checkWhatsAppCreds,
  checkOpenAIKey,
  checkMetaCreds,
  checkAnafSpvOauth,
  checkAppleDev,
  checkGooglePlay,
  checkDatecsHardware,
  checkCfZoneRegistration,
  checkSentryReplayPostDpa,
  checkOfferedOrderAutoExpiryDecision,
  checkNetopiaCreds,
  checkVivaCreds,
  checkCourierProofsBucketPrivate,
} from './health-checks';

const ENV_KEYS_TO_RESET = [
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'ANTHROPIC_CREDIT_BALANCE_CENTS',
  'AUDIT_INTEGRITY_ALERT_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'WHATSAPP_BUSINESS_TOKEN',
  'OPENAI_API_KEY',
  'META_APP_SECRET',
  'ANAF_OAUTH_CLIENT_ID',
  'ANAF_OAUTH_CLIENT_SECRET',
  'OPERATOR_FLAGS_APPLE_DEV',
  'OPERATOR_FLAGS_GOOGLE_PLAY',
  'OPERATOR_FLAGS_DATECS_HARDWARE',
  'OPERATOR_FLAGS_CF_ZONE_REGISTERED',
  'OPERATOR_FLAGS_SENTRY_REPLAY_POST_DPA',
  'OFFERED_ORDER_AUTO_EXPIRY_MIN',
];
const ENV_SNAPSHOT: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS_TO_RESET) {
    ENV_SNAPSHOT[k] = process.env[k];
    delete process.env[k];
  }
  delete mockState.pspCredentials;
  delete mockState.bucket;
  delete mockState.throwOnAdminCreate;
});

afterEach(() => {
  for (const k of ENV_KEYS_TO_RESET) {
    if (ENV_SNAPSHOT[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_SNAPSHOT[k];
  }
});

describe('env-presence probes', () => {
  it('Stripe publishable key — PENDING absent, DONE present', () => {
    expect(checkStripePublishableKey().status).toBe('PENDING');
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_xxx';
    expect(checkStripePublishableKey().status).toBe('DONE');
  });

  it('Audit integrity alert token — PENDING absent, DONE present', () => {
    expect(checkAuditIntegrityAlertToken().status).toBe('PENDING');
    process.env.AUDIT_INTEGRITY_ALERT_TOKEN = 'tk-abc';
    expect(checkAuditIntegrityAlertToken().status).toBe('DONE');
  });

  it('Twilio — needs BOTH sid + token for DONE', () => {
    expect(checkTwilioCreds().status).toBe('PENDING');
    process.env.TWILIO_ACCOUNT_SID = 'AC';
    expect(checkTwilioCreds().status).toBe('PENDING');
    process.env.TWILIO_AUTH_TOKEN = 'tk';
    expect(checkTwilioCreds().status).toBe('DONE');
  });

  it('ANAF SPV — needs both client id + secret for DONE', () => {
    expect(checkAnafSpvOauth().status).toBe('PENDING');
    process.env.ANAF_OAUTH_CLIENT_ID = 'id';
    expect(checkAnafSpvOauth().status).toBe('PENDING');
    process.env.ANAF_OAUTH_CLIENT_SECRET = 'secret';
    expect(checkAnafSpvOauth().status).toBe('DONE');
  });

  it('WhatsApp / OpenAI / Meta — single env var each', () => {
    expect(checkWhatsAppCreds().status).toBe('PENDING');
    expect(checkOpenAIKey().status).toBe('PENDING');
    expect(checkMetaCreds().status).toBe('PENDING');
    process.env.WHATSAPP_BUSINESS_TOKEN = 'x';
    process.env.OPENAI_API_KEY = 'x';
    process.env.META_APP_SECRET = 'x';
    expect(checkWhatsAppCreds().status).toBe('DONE');
    expect(checkOpenAIKey().status).toBe('DONE');
    expect(checkMetaCreds().status).toBe('DONE');
  });
});

describe('manual operator-flag probes', () => {
  it.each([
    ['APPLE_DEV', checkAppleDev],
    ['GOOGLE_PLAY', checkGooglePlay],
    ['DATECS_HARDWARE', checkDatecsHardware],
    ['CF_ZONE_REGISTERED', checkCfZoneRegistration],
    ['SENTRY_REPLAY_POST_DPA', checkSentryReplayPostDpa],
  ])('%s — PENDING by default, DONE when flag=done', (flag, fn) => {
    expect(fn().status).toBe('PENDING');
    process.env[`OPERATOR_FLAGS_${flag}`] = 'done';
    expect(fn().status).toBe('DONE');
  });
});

describe('Anthropic credit probe', () => {
  it('UNKNOWN when no snapshot', () => {
    expect(checkAnthropicCredit().status).toBe('UNKNOWN');
  });

  it('PENDING when snapshot is zero or negative', () => {
    process.env.ANTHROPIC_CREDIT_BALANCE_CENTS = '0';
    expect(checkAnthropicCredit().status).toBe('PENDING');
  });

  it('DONE when snapshot is positive', () => {
    process.env.ANTHROPIC_CREDIT_BALANCE_CENTS = '5000';
    expect(checkAnthropicCredit().status).toBe('DONE');
  });

  it('UNKNOWN when snapshot is non-numeric', () => {
    process.env.ANTHROPIC_CREDIT_BALANCE_CENTS = 'oops';
    expect(checkAnthropicCredit().status).toBe('UNKNOWN');
  });
});

describe('offered-order auto-expiry decision', () => {
  it('PENDING when unset / zero / invalid', () => {
    expect(checkOfferedOrderAutoExpiryDecision().status).toBe('PENDING');
    process.env.OFFERED_ORDER_AUTO_EXPIRY_MIN = '0';
    expect(checkOfferedOrderAutoExpiryDecision().status).toBe('PENDING');
    process.env.OFFERED_ORDER_AUTO_EXPIRY_MIN = 'oops';
    expect(checkOfferedOrderAutoExpiryDecision().status).toBe('PENDING');
  });

  it('DONE when set to positive integer', () => {
    process.env.OFFERED_ORDER_AUTO_EXPIRY_MIN = '10';
    expect(checkOfferedOrderAutoExpiryDecision().status).toBe('DONE');
  });
});

describe('Supabase-backed probes', () => {
  it('Netopia creds — DONE when at least 1 tenant row', async () => {
    mockState.pspCredentials = { count: 3, error: null };
    const r = await checkNetopiaCreds();
    expect(r.status).toBe('DONE');
  });

  it('Netopia creds — PENDING when zero rows', async () => {
    mockState.pspCredentials = { count: 0, error: null };
    const r = await checkNetopiaCreds();
    expect(r.status).toBe('PENDING');
  });

  it('Viva creds — UNKNOWN on query error', async () => {
    mockState.pspCredentials = { count: null, error: { message: 'boom' } };
    const r = await checkVivaCreds();
    expect(r.status).toBe('UNKNOWN');
  });

  it('Courier proofs bucket — DONE when public=false', async () => {
    mockState.bucket = { data: { public: false }, error: null };
    const r = await checkCourierProofsBucketPrivate();
    expect(r.status).toBe('DONE');
  });

  it('Courier proofs bucket — PENDING when public=true', async () => {
    mockState.bucket = { data: { public: true }, error: null };
    const r = await checkCourierProofsBucketPrivate();
    expect(r.status).toBe('PENDING');
  });

  it('Courier proofs bucket — PENDING when bucket not found', async () => {
    mockState.bucket = { data: null, error: { message: 'Bucket Not Found' } };
    const r = await checkCourierProofsBucketPrivate();
    expect(r.status).toBe('PENDING');
  });
});

describe('smoke: every probe runs without throwing on empty env', () => {
  it('all 17 probes return a structurally-valid result', async () => {
    const probes = [
      checkStripePublishableKey,
      checkAnthropicCredit,
      checkAuditIntegrityAlertToken,
      checkTwilioCreds,
      checkWhatsAppCreds,
      checkOpenAIKey,
      checkMetaCreds,
      checkAnafSpvOauth,
      checkAppleDev,
      checkGooglePlay,
      checkDatecsHardware,
      checkCfZoneRegistration,
      checkSentryReplayPostDpa,
      checkOfferedOrderAutoExpiryDecision,
      checkNetopiaCreds,
      checkVivaCreds,
      checkCourierProofsBucketPrivate,
    ];
    expect(probes).toHaveLength(17);
    for (const fn of probes) {
      const r = await fn();
      expect(['DONE', 'PENDING', 'UNKNOWN']).toContain(r.status);
    }
  });
});
