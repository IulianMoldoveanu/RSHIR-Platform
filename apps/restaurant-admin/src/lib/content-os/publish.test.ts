// Tests for the publish-tick orchestrator.
//
// We stub Supabase + the publisher factory. The publisher factory mock
// returns a fake provider so we exercise the row state machine
// (queued → publishing → published / failed) without real HTTP.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publishMock = vi.fn();
const deleteMock = vi.fn();
const getMetricsMock = vi.fn();
vi.mock('@hir/content-os', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPublisherProvider: () => ({
      channel: 'facebook',
      maxCaptionChars: 63206,
      supportsScheduling: true,
      supportsVideo: true,
      supportsCarousel: true,
      supportsDelete: true,
      publish: (creds: unknown, req: unknown) => publishMock(creds, req),
      delete: (creds: unknown, id: string) => deleteMock(creds, id),
      getMetrics: (creds: unknown, id: string) => getMetricsMock(creds, id),
    }),
  };
});

import { runPublishTick } from './publish';

interface PubRow {
  id: string;
  draft_id: string;
  channel: string;
  channel_account: string;
  scheduled_for: string;
  status: string;
  external_id?: string | null;
  error_message?: string | null;
}

interface DraftRow {
  id: string;
  brief_id: string;
  body_json: Record<string, unknown>;
  status: string;
}

interface BriefRow {
  id: string;
  brand_id: string;
}

interface CredsRow {
  brand_id: string;
  provider_kind: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
}

class FakeSb {
  pubs: PubRow[] = [];
  drafts: DraftRow[] = [];
  briefs: BriefRow[] = [];
  creds: CredsRow[] = [];

  from(table: string): any {
    const self = this;
    const filters: { col: string; op: 'eq' | 'lte'; val: unknown }[] = [];
    let order: { col: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let mode: 'select' | 'update' = 'select';
    let updateRow: Record<string, unknown> | null = null;
    const dataOf = (): Record<string, unknown>[] => {
      switch (table) {
        case 'content_publications': return self.pubs as unknown as Record<string, unknown>[];
        case 'content_drafts': return self.drafts as unknown as Record<string, unknown>[];
        case 'content_briefs': return self.briefs as unknown as Record<string, unknown>[];
        case 'content_provider_credentials': return self.creds as unknown as Record<string, unknown>[];
        default: return [];
      }
    };
    const applyFilters = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
      rows.filter((r) =>
        filters.every((f) => {
          if (f.op === 'eq') return r[f.col] === f.val;
          if (f.op === 'lte') return String(r[f.col]) <= String(f.val);
          return true;
        }),
      );
    const exec = async (): Promise<{ data: unknown; error: null }> => {
      if (mode === 'update' && updateRow) {
        const rows = applyFilters(dataOf());
        for (const r of rows) Object.assign(r, updateRow);
        return { data: rows, error: null };
      }
      let rows = applyFilters(dataOf());
      if (order) {
        rows = rows.slice().sort((a, b) => {
          const av = String(a[order!.col] ?? '');
          const bv = String(b[order!.col] ?? '');
          return order!.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (limit !== null) rows = rows.slice(0, limit);
      return { data: rows, error: null };
    };
    const builder: any = {
      select: () => builder,
      update: (row: Record<string, unknown>) => {
        mode = 'update';
        updateRow = row;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ col, op: 'eq', val });
        return builder;
      },
      lte: (col: string, val: unknown) => {
        filters.push({ col, op: 'lte', val });
        return builder;
      },
      order: (col: string, opts: { ascending: boolean }) => {
        order = { col, ascending: opts.ascending };
        return builder;
      },
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      maybeSingle: async () => {
        const r = await exec();
        const list = (r.data as Record<string, unknown>[]) ?? [];
        return { data: list[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void) => exec().then(resolve),
    };
    return builder;
  }
}

const NOW = new Date('2026-06-01T12:00:00Z');

beforeEach(() => {
  publishMock.mockReset();
  deleteMock.mockReset();
  getMetricsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runPublishTick', () => {
  it('returns zero stats when queue empty', async () => {
    const sb = new FakeSb();
    const stats = await runPublishTick({ admin: sb as any, now: NOW });
    expect(stats).toEqual({ processed: 0, succeeded: 0, failed: 0, skippedNoCreds: 0 });
  });

  it('skips a queued row when no credentials present', async () => {
    const sb = new FakeSb();
    sb.pubs.push({
      id: 'pub-1',
      draft_id: 'draft-1',
      channel: 'facebook',
      channel_account: 'page-id',
      scheduled_for: '2026-06-01T11:00:00Z',
      status: 'queued',
    });
    sb.drafts.push({ id: 'draft-1', brief_id: 'brief-1', body_json: { hook: 'h' }, status: 'approved' });
    sb.briefs.push({ id: 'brief-1', brand_id: 'brand-1' });
    const stats = await runPublishTick({ admin: sb as any, now: NOW });
    expect(stats.processed).toBe(1);
    expect(stats.skippedNoCreds).toBe(1);
    expect(sb.pubs[0].status).toBe('failed');
    expect(sb.pubs[0].error_message).toContain('no_credentials_for_meta');
  });

  it('publishes successfully when creds + draft present', async () => {
    const sb = new FakeSb();
    sb.pubs.push({
      id: 'pub-1',
      draft_id: 'draft-1',
      channel: 'facebook',
      channel_account: 'page-id',
      scheduled_for: '2026-06-01T11:00:00Z',
      status: 'queued',
    });
    sb.drafts.push({
      id: 'draft-1',
      brief_id: 'brief-1',
      body_json: {
        hook: 'Pizza 🍕',
        body: 'La 25 RON',
        cta: 'Comandă',
        hashtags: ['#pizza'],
        visual: { videoUrl: 'https://example.com/video.mp4' },
      },
      status: 'approved',
    });
    sb.briefs.push({ id: 'brief-1', brand_id: 'brand-1' });
    sb.creds.push({
      brand_id: 'brand-1',
      provider_kind: 'meta',
      credentials: { accessToken: 't', accountId: 'page-id' },
      is_active: true,
    });
    publishMock.mockResolvedValue({
      externalId: 'fb-post-123',
      status: 'published',
    });
    const stats = await runPublishTick({ admin: sb as any, now: NOW });
    expect(stats.processed).toBe(1);
    expect(stats.succeeded).toBe(1);
    expect(sb.pubs[0].status).toBe('published');
    expect(sb.pubs[0].external_id).toBe('fb-post-123');
    expect(sb.drafts[0].status).toBe('published');
  });

  it('marks the row failed when publish throws', async () => {
    const sb = new FakeSb();
    sb.pubs.push({
      id: 'pub-1',
      draft_id: 'draft-1',
      channel: 'facebook',
      channel_account: 'page-id',
      scheduled_for: '2026-06-01T11:00:00Z',
      status: 'queued',
    });
    sb.drafts.push({ id: 'draft-1', brief_id: 'brief-1', body_json: { fullText: 'Hi' }, status: 'approved' });
    sb.briefs.push({ id: 'brief-1', brand_id: 'brand-1' });
    sb.creds.push({
      brand_id: 'brand-1',
      provider_kind: 'meta',
      credentials: { accessToken: 't', accountId: 'page-id' },
      is_active: true,
    });
    publishMock.mockRejectedValue(new Error('rate_limited_by_meta'));
    const stats = await runPublishTick({ admin: sb as any, now: NOW });
    expect(stats.failed).toBe(1);
    expect(sb.pubs[0].status).toBe('failed');
    expect(sb.pubs[0].error_message).toContain('rate_limited_by_meta');
  });
});
