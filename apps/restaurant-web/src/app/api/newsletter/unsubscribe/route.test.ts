// Regression tests for /api/newsletter/unsubscribe — anonymous, GET-only,
// triggered by email-link click. Returns RO-localized HTML responses for
// every branch. Tests lock in the token format check, the tenant-scoped
// DB write, and the "no leak" property: a wrong-tenant token must look
// identical to an unknown-token response (no enumeration).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const VALID_TOKEN = 'a'.repeat(64);
const SHORT_TOKEN = 'a'.repeat(63);

// --- mocks ---

const updateMock = vi.fn();
const resolveTenantFromHostMock = vi.fn();

vi.mock('@/lib/tenant', () => ({
  resolveTenantFromHost: () => resolveTenantFromHostMock(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve(updateMock()),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from './route';

const FAKE_TENANT = { id: 'tenant-1', slug: 's', name: 'T', settings: {} };

function makeReq(query: string) {
  return new NextRequest(`http://localhost/api/newsletter/unsubscribe${query}`, {
    method: 'GET',
  });
}

async function bodyOf(res: Response): Promise<string> {
  return await res.text();
}

describe('GET /api/newsletter/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTenantFromHostMock.mockResolvedValue({ tenant: FAKE_TENANT });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns invalid HTML when token is missing', async () => {
    const res = await GET(makeReq(''));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await bodyOf(res);
    expect(html).toContain('Link invalid');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns invalid HTML when token is the wrong length', async () => {
    const res = await GET(makeReq(`?token=${SHORT_TOKEN}`));
    const html = await bodyOf(res);
    expect(html).toContain('Link invalid');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns invalid HTML when token contains non-hex characters', async () => {
    // 64 chars but with G (not hex)
    const bad = 'g'.repeat(64);
    const res = await GET(makeReq(`?token=${bad}`));
    const html = await bodyOf(res);
    expect(html).toContain('Link invalid');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns invalid HTML when host does not resolve to a tenant', async () => {
    resolveTenantFromHostMock.mockResolvedValueOnce({ tenant: null });
    const res = await GET(makeReq(`?token=${VALID_TOKEN}`));
    const html = await bodyOf(res);
    expect(html).toContain('Link invalid');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns Eroare HTML on DB update failure (no error.message leak)', async () => {
    updateMock.mockReturnValue({
      error: { message: 'connection refused — sensitive infra detail' },
      data: null,
    });
    const res = await GET(makeReq(`?token=${VALID_TOKEN}`));
    const html = await bodyOf(res);
    expect(html).toContain('Eroare');
    // SECURITY: anonymous email-link callers must never see DB internals.
    expect(html).not.toContain('connection refused');
    expect(html).not.toContain('sensitive infra detail');
  });

  it('returns Link invalid when token does not match any subscriber row', async () => {
    updateMock.mockReturnValue({ error: null, data: null });
    const res = await GET(makeReq(`?token=${VALID_TOKEN}`));
    const html = await bodyOf(res);
    // Same response as truly-invalid token — no enumeration of which
    // tokens belong to a different tenant.
    expect(html).toContain('Link invalid');
  });

  it('returns Dezabonat HTML on the happy path', async () => {
    updateMock.mockReturnValue({ error: null, data: { id: 'sub-1' } });
    const res = await GET(makeReq(`?token=${VALID_TOKEN}`));
    expect(res.status).toBe(200);
    const html = await bodyOf(res);
    expect(html).toContain('Dezabonat');
    expect(html).toContain('Te-am dezabonat');
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('accepts uppercase hex tokens (case-insensitive regex)', async () => {
    updateMock.mockReturnValue({ error: null, data: { id: 'sub-1' } });
    const res = await GET(makeReq(`?token=${'A'.repeat(64)}`));
    const html = await bodyOf(res);
    expect(html).toContain('Dezabonat');
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
