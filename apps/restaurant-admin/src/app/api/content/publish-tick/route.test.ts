// Tests for POST /api/content/publish-tick. Auth surface only; orchestration
// covered by lib/content-os/publish tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runPublishTickMock = vi.fn();
vi.mock('@/lib/content-os/publish', () => ({
  runPublishTick: (opts: unknown) => runPublishTickMock(opts),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ __sentinel: true }),
}));

import { POST } from './route';

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/content/publish-tick', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  runPublishTickMock.mockReset();
  process.env.CONTENT_OS_CRON_TOKEN = 'test-token-abc';
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.CONTENT_OS_CRON_TOKEN;
});

describe('POST /api/content/publish-tick', () => {
  it('returns 401 without bearer', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 200 + stats on success', async () => {
    runPublishTickMock.mockResolvedValue({
      processed: 3,
      succeeded: 2,
      failed: 0,
      skippedNoCreds: 1,
    });
    const res = await POST(makeReq({ authorization: 'Bearer test-token-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.succeeded).toBe(2);
    expect(json.stats.skippedNoCreds).toBe(1);
  });

  it('returns 500 on orchestrator throw', async () => {
    runPublishTickMock.mockRejectedValue(new Error('queue_lock_timeout'));
    const res = await POST(makeReq({ authorization: 'Bearer test-token-abc' }));
    expect(res.status).toBe(500);
  });
});
