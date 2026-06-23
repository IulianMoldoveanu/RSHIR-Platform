// Unit tests for the Lane F pharma-callback durability contract (migration
// 20260630_039). notifyPharmaCallback must:
//   - enqueue a pharma_callback_deliveries row with the deterministic event_id +
//     the snapshotted callback URL (idempotent upsert), BEFORE sending;
//   - on inline 2xx → mark the row delivered (cron never re-sends);
//   - on 5xx/network → leave it pending with a future next_retry_at (dispatcher
//     takes over) — never lost;
//   - on 4xx → dead-letter immediately (pharma contract bug);
//   - never enqueue for a non-pharma order.
//
// Mocks declared BEFORE the SUT import.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// admin client — per-table stub that records writes to pharma_callback_deliveries.
type Scripts = {
  order: unknown;
  secret: unknown;
  upserts: Array<{ row: Record<string, unknown>; opts: unknown }>;
  updates: Array<Record<string, unknown>>;
};
const scripts: Scripts = { order: null, secret: null, upserts: [], updates: [] };

function adminStub() {
  return {
    from(table: string) {
      if (table === 'courier_orders') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: scripts.order }) }) }) };
      }
      if (table === 'courier_order_secrets') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: scripts.secret }) }) }) };
      }
      if (table === 'pharma_callback_deliveries') {
        return {
          upsert: async (row: Record<string, unknown>, opts: unknown) => {
            scripts.upserts.push({ row, opts });
            return { error: null };
          },
          update: (row: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                scripts.updates.push(row);
                return { error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminStub() }));
vi.mock('./supabase/admin', () => ({ createAdminClient: () => adminStub() }));
vi.mock('./audit', () => ({ logAudit: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ family: 4, address: '93.184.216.34' }], // public IP
}));
vi.mock('./url-safety', () => ({
  validateWebhookUrl: (raw: string) => ({ ok: true, url: new URL(raw) }),
  isPrivateIpv4: () => false,
  isPrivateIpv6: () => false,
}));

import { notifyPharmaCallback } from './webhook';

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const PHARMA_ORDER = 'pharma-abc';
const CB_URL = 'https://pharma.example.com/cb';

function pharmaOrder() {
  return { vertical: 'pharma', pharma_callback_url: CB_URL, external_ref: PHARMA_ORDER };
}

beforeEach(() => {
  scripts.order = pharmaOrder();
  scripts.secret = { pharma_callback_secret: 'sek-1' };
  scripts.upserts = [];
  scripts.updates = [];
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('notifyPharmaCallback — Lane F durability', () => {
  it('enqueues a row (deterministic event_id + url snapshot) before sending, then marks delivered on 2xx', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    await notifyPharmaCallback(ORDER_ID, 'DELIVERED');

    expect(scripts.upserts).toHaveLength(1);
    const { row, opts } = scripts.upserts[0];
    expect(row.courier_order_id).toBe(ORDER_ID);
    expect(row.event_id).toBe(`${ORDER_ID}:delivered`); // deterministic
    expect(row.pharma_status).toBe('delivered');
    expect(row.pharma_callback_url).toBe(CB_URL); // snapshot
    expect(opts).toMatchObject({ onConflict: 'courier_order_id,event_id', ignoreDuplicates: true });

    // delivered_at set, not dead, no future retry; single inline attempt recorded.
    expect(scripts.updates).toHaveLength(1);
    expect(scripts.updates[0]).toHaveProperty('delivered_at');
    expect(scripts.updates[0].dead).toBeUndefined();
    expect(scripts.updates[0].attempt_count).toBe(1);
  });

  it('leaves the row PENDING (future next_retry_at, not dead) on repeated 5xx — never lost', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503, text: async () => 'busy' });

    await notifyPharmaCallback(ORDER_ID, 'DELIVERED');

    expect(scripts.upserts).toHaveLength(1);
    expect(scripts.updates).toHaveLength(1);
    const upd = scripts.updates[0];
    expect(upd.delivered_at).toBeUndefined();
    expect(upd.dead).toBeUndefined();
    expect(upd.next_retry_at).toBeTruthy();
    expect(new Date(upd.next_retry_at as string).getTime()).toBeGreaterThan(Date.now());
    // Both inline attempts ran (5xx → retry → 5xx) → recorded as 2, so the
    // dispatcher's backoff continues from the right step (not under-counted).
    expect(upd.attempt_count).toBe(2);
  });

  it('dead-letters immediately on 4xx (pharma contract bug)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' });

    await notifyPharmaCallback(ORDER_ID, 'DELIVERED');

    expect(scripts.updates).toHaveLength(1);
    expect(scripts.updates[0].dead).toBe(true);
    expect(scripts.updates[0].delivered_at).toBeUndefined();
  });

  it('does not enqueue anything for a non-pharma order', async () => {
    scripts.order = { vertical: 'restaurant', pharma_callback_url: CB_URL, external_ref: PHARMA_ORDER };

    await notifyPharmaCallback(ORDER_ID, 'DELIVERED');

    expect(scripts.upserts).toHaveLength(0);
    expect(scripts.updates).toHaveLength(0);
    expect(fetch as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
