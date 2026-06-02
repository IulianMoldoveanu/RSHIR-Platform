// Security crux: a Hepi action proposal must be un-forgeable and un-tamperable.
// The /execute endpoint trusts ONLY what verifyProposal returns, so these tests
// pin the HMAC + TTL guarantees.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// secret() reads env at call time — set a deterministic key before importing.
beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key-for-hmac';
});

import { signProposal, verifyProposal } from './proposals';

afterEach(() => {
  vi.useRealTimers();
});

describe('Hepi proposals', () => {
  it('round-trips a valid proposal', () => {
    const token = signProposal('activate_city', { city: 'cluj-napoca' });
    const payload = verifyProposal(token);
    expect(payload).not.toBeNull();
    expect(payload!.actionId).toBe('activate_city');
    expect(payload!.params).toEqual({ city: 'cluj-napoca' });
  });

  it('rejects a tampered payload body (params changed)', () => {
    const token = signProposal('set_tenant_status', { tenant: 'foisorul-a', status: 'SUSPENDED' });
    const [, mac] = token.split('.');
    // Forge a body that suspends a DIFFERENT tenant but reuse the original signature.
    const forgedBody = Buffer.from(
      JSON.stringify({ actionId: 'set_tenant_status', params: { tenant: 'victim', status: 'SUSPENDED' }, exp: Date.now() + 60000 }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifyProposal(`${forgedBody}.${mac}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signProposal('activate_county_capitals', {});
    const [body] = token.split('.');
    expect(verifyProposal(`${body}.deadbeef`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyProposal('')).toBeNull();
    expect(verifyProposal('no-dot')).toBeNull();
    expect(verifyProposal('a.b.c')).toBeNull();
  });

  it('rejects an expired proposal (past TTL)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T10:00:00Z'));
    const token = signProposal('activate_city', { city: 'sibiu' });
    expect(verifyProposal(token)).not.toBeNull(); // still fresh
    vi.advanceTimersByTime(10 * 60 * 1000 + 1); // past the 10-min TTL
    expect(verifyProposal(token)).toBeNull();
  });

  it('a proposal signed under a different secret does not verify', () => {
    const token = signProposal('activate_city', { city: 'arad' });
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-different-key';
    expect(verifyProposal(token)).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key-for-hmac';
  });
});
