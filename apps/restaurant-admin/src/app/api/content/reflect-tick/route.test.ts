// Tests for POST /api/content/reflect-tick.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runReflectTickMock = vi.fn();
vi.mock('@/lib/content-os/reflect', () => ({
  runReflectTick: (opts: unknown) => runReflectTickMock(opts),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ __sentinel: true }),
}));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/content/reflect-tick', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  runReflectTickMock.mockReset();
  process.env.CONTENT_OS_CRON_TOKEN = 'test-token-abc';
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.CONTENT_OS_CRON_TOKEN;
});

describe('POST /api/content/reflect-tick', () => {
  it('returns 401 without bearer', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 + stats on success', async () => {
    runReflectTickMock.mockResolvedValue({
      processed: 5,
      metricsCollected: 4,
      metricsFailed: 1,
      templatesPromoted: 0,
    });
    const res = await POST(makeReq({ authorization: 'Bearer test-token-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.metricsCollected).toBe(4);
  });
});
