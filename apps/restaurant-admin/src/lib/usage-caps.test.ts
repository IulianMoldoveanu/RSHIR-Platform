// Tests for usage-caps.ts — the Standard-plan cap helper.
//
// We mock the admin Supabase client so the helper exercises its full
// happy-path / failure-path branches without a live database. The RPC
// itself is exercised by the migration smoke-test (a separate concern).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RpcResponse = { data: unknown; error: { message: string } | null };

let rpcResponses: RpcResponse[] = [];
let lastRpcCall: { fn: string; args: Record<string, unknown> } | null = null;
let selectResponse: { data: unknown; error: { message: string } | null } = { data: [], error: null };
let lastSelect: { table: string; filters: Record<string, unknown> } | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc(fn: string, args: Record<string, unknown>) {
      lastRpcCall = { fn, args };
      const next = rpcResponses.shift();
      return Promise.resolve(next ?? { data: null, error: { message: 'no_mock_response' } });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      lastSelect = { table, filters };
      const chain = {
        select(_cols: string) {
          return chain;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return chain;
        },
        in(col: string, vals: unknown[]) {
          filters[col] = vals;
          return Promise.resolve(selectResponse);
        },
      };
      return chain;
    },
  }),
}));

import {
  checkAndIncrementUsage,
  recordUsageOrLog,
  getUsageSnapshot,
  capExceededMessage,
  capResourceLabel,
  DEFAULT_CAPS,
} from './usage-caps';

const TENANT = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  rpcResponses = [];
  lastRpcCall = null;
  lastSelect = null;
  selectResponse = { data: [], error: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkAndIncrementUsage', () => {
  it('returns allowed=true with used+cap on a green path', async () => {
    rpcResponses.push({
      data: {
        allowed: true,
        used: 3,
        cap: 10,
        period_kind: 'daily',
        period_start: '2026-05-27T00:00:00+00:00',
      },
      error: null,
    });
    const result = await checkAndIncrementUsage(TENANT, 'hepi_conversations');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(3);
    expect(result.cap).toBe(10);
    expect(result.periodKind).toBe('daily');
    expect(result.message).toBeUndefined();
    expect(lastRpcCall).toEqual({
      fn: 'check_and_increment_usage',
      args: {
        p_tenant_id: TENANT,
        p_resource_kind: 'hepi_conversations',
        p_amount: 1,
      },
    });
  });

  it('returns allowed=false with a Romanian message when capped', async () => {
    rpcResponses.push({
      data: {
        allowed: false,
        used: 10,
        cap: 10,
        period_kind: 'daily',
        period_start: '2026-05-27T00:00:00+00:00',
      },
      error: null,
    });
    const result = await checkAndIncrementUsage(TENANT, 'hepi_conversations');
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(10);
    expect(result.cap).toBe(10);
    expect(result.message).toBeDefined();
    expect(result.message).toMatch(/Hai patroane/);
    expect(result.message).toMatch(/conversații cu Hepi/);
    expect(result.message).toMatch(/pe zi/);
    expect(result.message).toMatch(/mâine/);
  });

  it('forwards a custom amount to the RPC', async () => {
    rpcResponses.push({
      data: {
        allowed: true,
        used: 1500,
        cap: 50_000,
        period_kind: 'daily',
        period_start: '2026-05-27T00:00:00+00:00',
      },
      error: null,
    });
    await checkAndIncrementUsage(TENANT, 'anthropic_tokens', 1500);
    expect(lastRpcCall?.args.p_amount).toBe(1500);
    expect(lastRpcCall?.args.p_resource_kind).toBe('anthropic_tokens');
  });

  it('floors fractional amounts before sending to the RPC', async () => {
    rpcResponses.push({
      data: {
        allowed: true,
        used: 2,
        cap: 30,
        period_kind: 'monthly',
        period_start: '2026-05-01T00:00:00+00:00',
      },
      error: null,
    });
    await checkAndIncrementUsage(TENANT, 'whatsapp_marketing', 1.9);
    expect(lastRpcCall?.args.p_amount).toBe(1);
  });

  it('throws when the RPC returns an error', async () => {
    rpcResponses.push({ data: null, error: { message: 'boom' } });
    await expect(
      checkAndIncrementUsage(TENANT, 'hepi_conversations'),
    ).rejects.toThrow(/boom/);
  });

  it('throws when the RPC returns a malformed payload', async () => {
    rpcResponses.push({ data: { used: 5 }, error: null });
    await expect(
      checkAndIncrementUsage(TENANT, 'hepi_conversations'),
    ).rejects.toThrow(/missing allowed/);
  });

  it('rejects empty tenantId', async () => {
    await expect(
      checkAndIncrementUsage('', 'hepi_conversations'),
    ).rejects.toThrow(/tenantId is required/);
  });

  it('rejects non-positive amounts', async () => {
    await expect(
      checkAndIncrementUsage(TENANT, 'hepi_conversations', 0),
    ).rejects.toThrow(/amount must be > 0/);
    await expect(
      checkAndIncrementUsage(TENANT, 'hepi_conversations', -1),
    ).rejects.toThrow(/amount must be > 0/);
  });
});

describe('recordUsageOrLog', () => {
  it('returns the cap result on the happy path', async () => {
    rpcResponses.push({
      data: {
        allowed: true,
        used: 500,
        cap: 50_000,
        period_kind: 'daily',
        period_start: '2026-05-27T00:00:00+00:00',
      },
      error: null,
    });
    const out = await recordUsageOrLog(TENANT, 'anthropic_tokens', 500, 'hepi-chat');
    expect(out?.allowed).toBe(true);
  });

  it('swallows RPC errors and returns null (never throws)', async () => {
    rpcResponses.push({ data: null, error: { message: 'database_offline' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await recordUsageOrLog(TENANT, 'anthropic_tokens', 100, 'menu-parse');
    expect(out).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('returns null without RPC for zero / negative amounts', async () => {
    const out1 = await recordUsageOrLog(TENANT, 'anthropic_tokens', 0, 'noop');
    const out2 = await recordUsageOrLog(TENANT, 'anthropic_tokens', -5, 'noop');
    expect(out1).toBeNull();
    expect(out2).toBeNull();
    expect(lastRpcCall).toBeNull();
  });

  it('logs a warning when the cap was exceeded', async () => {
    rpcResponses.push({
      data: {
        allowed: false,
        used: 50_000,
        cap: 50_000,
        period_kind: 'daily',
        period_start: '2026-05-27T00:00:00+00:00',
      },
      error: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await recordUsageOrLog(TENANT, 'anthropic_tokens', 1, 'hepi-chat');
    expect(out?.allowed).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('getUsageSnapshot', () => {
  it('returns one entry per known resource even when no rows exist', async () => {
    selectResponse = { data: [], error: null };
    const snap = await getUsageSnapshot(TENANT);
    expect(snap.map((s) => s.resourceKind).sort()).toEqual(
      [
        'anthropic_tokens',
        'content_os_videos',
        'hepi_conversations',
        'whatsapp_marketing',
      ].sort(),
    );
    for (const s of snap) {
      expect(s.used).toBe(0);
      expect(s.cap).toBe(DEFAULT_CAPS[s.resourceKind].cap);
      expect(s.atCap).toBe(false);
      expect(s.ratio).toBe(0);
    }
  });

  it('reads used+cap from matching rows and flags atCap/nearCap', async () => {
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    selectResponse = {
      data: [
        {
          resource_kind: 'hepi_conversations',
          used_count: 10,
          cap_count: 10,
          period_kind: 'daily',
          period_start: dayStart,
        },
        // 25/30 = 0.833 → near cap but not at cap.
        {
          resource_kind: 'whatsapp_marketing',
          used_count: 25,
          cap_count: 30,
          period_kind: 'monthly',
          period_start: monthStart,
        },
        // 1/3 = 0.33 → neither near nor at cap.
        {
          resource_kind: 'content_os_videos',
          used_count: 1,
          cap_count: 3,
          period_kind: 'monthly',
          period_start: monthStart,
        },
      ],
      error: null,
    };
    const snap = await getUsageSnapshot(TENANT);
    const hepi = snap.find((s) => s.resourceKind === 'hepi_conversations')!;
    const wa = snap.find((s) => s.resourceKind === 'whatsapp_marketing')!;
    const videos = snap.find((s) => s.resourceKind === 'content_os_videos')!;
    expect(hepi.atCap).toBe(true);
    expect(hepi.nearCap).toBe(false);
    expect(hepi.ratio).toBe(1);
    expect(wa.atCap).toBe(false);
    expect(wa.nearCap).toBe(true);
    expect(videos.atCap).toBe(false);
    expect(videos.nearCap).toBe(false);
  });

  it('treats a row missing in the snapshot as zero usage', async () => {
    selectResponse = {
      data: [
        {
          resource_kind: 'anthropic_tokens',
          used_count: 1234,
          cap_count: 50_000,
          period_kind: 'daily',
          period_start: new Date(
            Date.UTC(
              new Date().getUTCFullYear(),
              new Date().getUTCMonth(),
              new Date().getUTCDate(),
            ),
          ).toISOString(),
        },
      ],
      error: null,
    };
    const snap = await getUsageSnapshot(TENANT);
    const ant = snap.find((s) => s.resourceKind === 'anthropic_tokens')!;
    const hepi = snap.find((s) => s.resourceKind === 'hepi_conversations')!;
    expect(ant.used).toBe(1234);
    expect(hepi.used).toBe(0);
  });

  it('returns empty array on missing tenantId', async () => {
    const snap = await getUsageSnapshot('');
    expect(snap).toEqual([]);
  });
});

describe('capExceededMessage + capResourceLabel', () => {
  it('emits a polite NON-blame copy with the right period suffix', () => {
    const msg = capExceededMessage('content_os_videos', 3, 'monthly');
    expect(msg).toMatch(/Hai patroane/);
    expect(msg).toMatch(/3 reclame video/);
    expect(msg).toMatch(/pe lună/);
    expect(msg).toMatch(/luna viitoare/);
    expect(msg).toMatch(/\+40 723/);
  });

  it('uses Romanian label for every known resource', () => {
    expect(capResourceLabel('hepi_conversations')).toMatch(/Hepi/);
    expect(capResourceLabel('content_os_videos')).toMatch(/video/);
    expect(capResourceLabel('whatsapp_marketing')).toMatch(/WhatsApp/);
    expect(capResourceLabel('anthropic_tokens')).toMatch(/gândire AI/);
  });
});
