// Tests for the generate-tick orchestrator.
//
// We stub Supabase with an in-memory fake so the pipeline (brand → brief
// → draft) is exercised end-to-end without a real DB. The agents from
// `@hir/content-os` run unmocked — they are pure string assembly and the
// video provider falls back to mock when no API keys are present, so the
// whole chain is deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGenerateTick } from './generate';

// Don't call the real RPC; the default cap checker is replaced via opts.
vi.mock('@/lib/usage-caps', () => ({
  checkAndIncrementUsage: vi.fn().mockResolvedValue({
    allowed: true,
    used: 1,
    cap: 3,
    periodKind: 'monthly',
    periodStart: '',
  }),
}));

interface FakeBrandRow {
  id: string;
  tenant_id: string | null;
  brand_code: string;
  kind: 'HIR_INTERNAL' | 'TENANT_SAAS';
  business_type: string | null;
  display_name: string;
  tier: string;
  voice_json: Record<string, unknown> | null;
  visual_json: Record<string, unknown> | null;
  legal_json: Record<string, unknown> | null;
  competitors: string[] | null;
  monthly_budget_cents: number;
  preferred_messaging: string;
  is_active: boolean;
  created_at: string;
}

interface FakeTemplate {
  id: string;
  business_type: string;
  persona: string;
  goal: string;
  pillar: string;
  format: string;
  body_template: Record<string, unknown>;
  performance: Record<string, unknown>;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface FakeBrief { id: string; brand_id: string; created_at: string }
interface FakeDraft { id: string; brief_id: string; format: string; status: string }

class FakeSupabase {
  brands: FakeBrandRow[] = [];
  templates: FakeTemplate[] = [];
  briefs: FakeBrief[] = [];
  drafts: FakeDraft[] = [];
  briefInsertCount = 0;
  draftInsertCount = 0;

  from(table: string): any {
    const self = this;
    type Row = Record<string, unknown>;
    const filters: { col: string; op: 'eq' | 'in' | 'gte' | 'lte'; val: unknown }[] = [];
    let order: { col: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let mode: 'select' | 'insert' | 'update' = 'select';
    let insertRow: Row | null = null;
    const data = () => {
      switch (table) {
        case 'content_brand_contexts':
          return self.brands as unknown as Row[];
        case 'content_templates':
          return self.templates as unknown as Row[];
        case 'content_briefs':
          return self.briefs as unknown as Row[];
        case 'content_drafts':
          return self.drafts as unknown as Row[];
        default:
          return [];
      }
    };
    const applyFilters = (rows: Row[]): Row[] => {
      return rows.filter((r) =>
        filters.every((f) => {
          if (f.op === 'eq') return r[f.col] === f.val;
          if (f.op === 'in') return Array.isArray(f.val) && (f.val as unknown[]).includes(r[f.col]);
          if (f.op === 'gte') return String(r[f.col]) >= String(f.val);
          if (f.op === 'lte') return String(r[f.col]) <= String(f.val);
          return true;
        }),
      );
    };
    const exec = async (): Promise<{ data: unknown; error: null }> => {
      if (mode === 'insert' && insertRow) {
        if (table === 'content_briefs') {
          const row = { ...insertRow, id: `brief-${self.briefs.length + 1}`, created_at: new Date().toISOString() } as FakeBrief;
          self.briefs.push(row);
          self.briefInsertCount += 1;
          return { data: row as unknown, error: null };
        }
        if (table === 'content_drafts') {
          const row = { ...insertRow, id: `draft-${self.drafts.length + 1}` } as FakeDraft;
          self.drafts.push(row);
          self.draftInsertCount += 1;
          return { data: row as unknown, error: null };
        }
        return { data: null, error: null };
      }
      let rows = applyFilters(data());
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
      insert: (row: Row) => {
        mode = 'insert';
        insertRow = row;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ col, op: 'eq', val });
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push({ col, op: 'in', val: vals });
        // Some callers await directly after .in() (e.g. recentBriefs); thenable.
        return builder;
      },
      gte: (col: string, val: unknown) => {
        filters.push({ col, op: 'gte', val });
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
        if (Array.isArray(r.data)) {
          const list = r.data as Row[];
          return { data: list[0] ?? null, error: null };
        }
        return { data: (r.data as Row) ?? null, error: null };
      },
      single: async () => {
        const r = await exec();
        if (Array.isArray(r.data)) {
          const list = r.data as Row[];
          if (list.length === 0) return { data: null, error: { message: 'no_rows' } };
          return { data: list[0], error: null };
        }
        if (r.data == null) return { data: null, error: { message: 'no_rows' } };
        return { data: r.data as Row, error: null };
      },
      then: (resolve: (v: unknown) => void) => exec().then(resolve),
    };
    return builder;
  }
}

function makeBrand(over: Partial<FakeBrandRow> = {}): FakeBrandRow {
  return {
    id: 'brand-1',
    tenant_id: 'tenant-1',
    brand_code: 'demo-brand',
    kind: 'TENANT_SAAS',
    business_type: 'pizza',
    display_name: 'Pizza Demo',
    tier: 'basic',
    voice_json: { tone: 'amical' },
    visual_json: { palette: ['#FF6B35'] },
    legal_json: null,
    competitors: ['Glovo'],
    monthly_budget_cents: 5000,
    preferred_messaging: 'whatsapp',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeTemplate(over: Partial<FakeTemplate> = {}): FakeTemplate {
  return {
    id: 'tpl-1',
    business_type: 'pizza',
    persona: 'modern',
    goal: 'awareness',
    pillar: 'promo',
    format: 'reel_ig',
    body_template: {
      hook_template: 'Pizza {emoji}',
      body_template: '{businessName} are pizza la {price} RON',
      cta_template: 'Comandă pe {websiteUrl}',
      hashtags: ['pizza', '{businessName}'],
      visual_brief: 'Top-down pizza shot',
    },
    performance: {},
    is_active: true,
    created_by: 'seed',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runGenerateTick', () => {
  it('returns zero stats when no active brands', async () => {
    const fake = new FakeSupabase();
    const stats = await runGenerateTick({ admin: fake as any });
    expect(stats).toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
      capped: 0,
      notified: 0,
    });
  });

  it('skips a brand that already received a brief in last 24h', async () => {
    const fake = new FakeSupabase();
    fake.brands.push(makeBrand());
    fake.templates.push(makeTemplate());
    fake.briefs.push({
      id: 'existing-brief',
      brand_id: 'brand-1',
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const stats = await runGenerateTick({ admin: fake as any });
    expect(stats.processed).toBe(1);
    expect(stats.succeeded).toBe(0);
    expect(fake.briefInsertCount).toBe(0);
    expect(fake.draftInsertCount).toBe(0);
  });

  it('generates a brief + draft when no recent brief exists', async () => {
    const fake = new FakeSupabase();
    fake.brands.push(makeBrand());
    fake.templates.push(makeTemplate());
    const stats = await runGenerateTick({
      admin: fake as any,
      capChecker: async () => ({ allowed: true, used: 1, cap: 3 }),
    });
    expect(stats.processed).toBe(1);
    expect(stats.succeeded).toBe(1);
    expect(fake.briefInsertCount).toBe(1);
    expect(fake.draftInsertCount).toBe(1);
  });

  it('records `capped` when video gen hits the cap, still emits draft without video', async () => {
    const fake = new FakeSupabase();
    fake.brands.push(makeBrand());
    fake.templates.push(makeTemplate());
    const stats = await runGenerateTick({
      admin: fake as any,
      capChecker: async () => ({ allowed: false, message: 'over cap', used: 3, cap: 3 }),
    });
    // Brand is processed; a draft still lands without a videoUrl, but the
    // CapExceededError surfaces as `capped += 1`.
    expect(stats.processed).toBe(1);
    expect(stats.capped).toBe(1);
    // The draft INSERT happens after the cap-check is caught, so we
    // still expect at least one draft row.
    expect(fake.draftInsertCount).toBe(1);
  });

  it('skips cap checker for HIR_INTERNAL brands', async () => {
    const fake = new FakeSupabase();
    fake.brands.push(
      makeBrand({ kind: 'HIR_INTERNAL', tenant_id: null }),
    );
    fake.templates.push(makeTemplate());
    let capChecks = 0;
    const stats = await runGenerateTick({
      admin: fake as any,
      capChecker: async () => {
        capChecks += 1;
        return { allowed: true, used: 1, cap: 3 };
      },
    });
    expect(stats.succeeded).toBe(1);
    expect(capChecks).toBe(0);
  });

  it('calls notifyHepi on success', async () => {
    const fake = new FakeSupabase();
    fake.brands.push(makeBrand());
    fake.templates.push(makeTemplate());
    const notifyHepi = vi.fn().mockResolvedValue(undefined);
    const stats = await runGenerateTick({
      admin: fake as any,
      capChecker: async () => ({ allowed: true, used: 1, cap: 3 }),
      notifyHepi,
    });
    expect(stats.notified).toBe(1);
    expect(notifyHepi).toHaveBeenCalledTimes(1);
    expect(notifyHepi.mock.calls[0][1]).toContain('draft nou');
  });
});
