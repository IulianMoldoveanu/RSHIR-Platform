// Tests for POST /api/content/generate-tick.
//
// We mock the orchestrator + the admin client so the route's auth +
// transport surface is exercised without a real Supabase. The orchestrator
// itself is covered by lib/content-os tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runGenerateTickMock = vi.fn();
vi.mock('@/lib/content-os/generate', () => ({
  runGenerateTick: (opts: unknown) => runGenerateTickMock(opts),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ __sentinel: true }),
}));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/content/generate-tick', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  runGenerateTickMock.mockReset();
  process.env.CONTENT_OS_CRON_TOKEN = 'test-token-abc';
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.CONTENT_OS_CRON_TOKEN;
});

describe('POST /api/content/generate-tick', () => {
  it('returns 401 when authorization header is missing', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(runGenerateTickMock).not.toHaveBeenCalled();
  });

  it('returns 401 when bearer token does not match env', async () => {
    const res = await POST(makeReq({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when env var is unset (fail-closed)', async () => {
    delete process.env.CONTENT_OS_CRON_TOKEN;
    const res = await POST(makeReq({ authorization: 'Bearer anything' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 + stats on success', async () => {
    runGenerateTickMock.mockResolvedValue({
      processed: 2,
      succeeded: 1,
      failed: 1,
      capped: 0,
      notified: 1,
    });
    const res = await POST(makeReq({ authorization: 'Bearer test-token-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.stats.succeeded).toBe(1);
    expect(json.stats.notified).toBe(1);
    expect(typeof json.timestamp).toBe('string');
  });

  it('returns 500 when the orchestrator throws', async () => {
    runGenerateTickMock.mockRejectedValue(new Error('boom'));
    const res = await POST(makeReq({ authorization: 'Bearer test-token-abc' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('boom');
  });
});
