/**
 * Unit tests for demo-tenant-seed.ts.
 *
 * Supabase client is mocked — these tests assert the helper's idempotency
 * + insert shape WITHOUT hitting a real database. The real DB pass happens
 * via the Playwright suite against staging.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

// In-memory store mocked as the Supabase fluent client. Each table maps to
// an array of rows; the chainable .from().select()/insert()/update() methods
// read/write that store.
type Row = Record<string, unknown> & { id?: string };
type Store = Record<string, Row[]>;

function makeMockClient(store: Store) {
  let pkSeq = 0;
  const nextId = (): string => {
    pkSeq += 1;
    return `mock-id-${pkSeq.toString().padStart(4, '0')}`;
  };

  const builder = (table: string) => {
    let filters: Array<[string, unknown]> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let insertRows: Row[] = [];
    let updatePatch: Row | null = null;
    let insertResult: Row[] | null = null;

    const exec = () => {
      const rows = store[table] ?? (store[table] = []);
      const matches = (r: Row) => filters.every(([col, val]) => r[col] === val);

      if (mode === 'insert') {
        // If .select() ran after .insert() the insertResult is already
        // populated — return those rows instead of re-inserting.
        if (insertResult) return { data: insertResult, error: null };
        const created = insertRows.map((r) => ({ id: nextId(), ...r }));
        rows.push(...created);
        insertResult = created;
        return { data: created, error: null };
      }
      if (mode === 'update') {
        const updated: Row[] = [];
        for (const r of rows) {
          if (matches(r)) {
            Object.assign(r, updatePatch);
            updated.push(r);
          }
        }
        return { data: updated, error: null };
      }
      if (mode === 'delete') {
        const before = rows.length;
        store[table] = rows.filter((r) => !matches(r));
        return { data: null, error: null, count: before - store[table].length };
      }
      // select
      const found = rows.filter(matches);
      return { data: found, error: null };
    };

    const api = {
      select(_cols: string) {
        // .select() AFTER .insert() / .update() in supabase-js means
        // "return the affected rows", not "switch to query mode".
        if (mode === 'insert') {
          // Pre-execute the insert so insertResult is populated and the
          // subsequent .single()/.maybeSingle() returns the new row.
          exec();
          return api;
        }
        mode = 'select';
        return api;
      },
      insert(payload: Row | Row[]) {
        mode = 'insert';
        insertRows = Array.isArray(payload) ? payload : [payload];
        insertResult = null;
        return api;
      },
      update(patch: Row) {
        mode = 'update';
        updatePatch = patch;
        return api;
      },
      delete() {
        mode = 'delete';
        return api;
      },
      upsert(payload: Row, _opts?: { onConflict?: string }) {
        // For test purposes upsert == insert-or-update-by-onConflict. The
        // tests don't exercise upsert via the public seed function except
        // for tenant_members/courier_profiles, neither of which our two
        // tests below assert against — but we still implement it so
        // courier seeding doesn't crash if a test ever opts into it.
        mode = 'insert';
        insertRows = [payload];
        insertResult = null;
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return api;
      },
      maybeSingle() {
        const res = exec();
        return Promise.resolve({
          data: (res.data as Row[] | null)?.[0] ?? null,
          error: res.error,
        });
      },
      single() {
        const res = exec();
        return Promise.resolve({
          data: (res.data as Row[] | null)?.[0] ?? null,
          error: res.error,
        });
      },
      then(onFulfilled: (value: unknown) => unknown) {
        // Allow `await sb.from('x').delete().eq(...)` without .single() — the
        // teardown helper relies on this pattern.
        return Promise.resolve(exec()).then(onFulfilled);
      },
    };

    return api;
  };

  return {
    from: (table: string) => builder(table),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({
          data: { user: { id: 'mock-user-001' } },
          error: null,
        }),
        updateUserById: async () => ({ data: { user: null }, error: null }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
  };
}

const mockStore: Store = {};
const mockClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockClient.current,
}));

beforeEach(() => {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
  mockClient.current = makeMockClient(mockStore);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

describe('seedDemoTenant', () => {
  it('inserts a tenant + 3 menu items on first run', async () => {
    const { seedDemoTenant, DEMO_MENU_ITEMS, DEMO_TENANT_SLUG } = await import('./demo-tenant-seed');

    const result = await seedDemoTenant({ paymentMode: { mode: 'cod_only' } });

    expect(result.slug).toBe(DEMO_TENANT_SLUG);
    expect(result.tenantId).toMatch(/^mock-id-/);
    expect(result.menuItems).toHaveLength(DEMO_MENU_ITEMS.length);

    // Tenant row written with payments.mode = cod_only on settings.
    expect(mockStore.tenants).toHaveLength(1);
    const tenant = mockStore.tenants[0];
    expect(tenant.slug).toBe(DEMO_TENANT_SLUG);
    expect(tenant.status).toBe('ACTIVE');
    expect((tenant.settings as { payments: { mode: string } }).payments.mode).toBe('cod_only');

    // One category + three items written exactly once.
    expect(mockStore.restaurant_menu_categories).toHaveLength(1);
    expect(mockStore.restaurant_menu_items).toHaveLength(3);
    expect(mockStore.restaurant_menu_items.map((r) => r.name).sort()).toEqual(
      DEMO_MENU_ITEMS.map((i) => i.name).sort(),
    );
  });

  it('is idempotent — second run reuses existing rows', async () => {
    const { seedDemoTenant } = await import('./demo-tenant-seed');

    const first = await seedDemoTenant({ paymentMode: { mode: 'card_sandbox', provider: 'netopia' } });
    const second = await seedDemoTenant({ paymentMode: { mode: 'card_sandbox', provider: 'viva' } });

    // Same tenant id reused.
    expect(second.tenantId).toBe(first.tenantId);

    // No duplicate rows — still exactly one tenant + one category + three items.
    expect(mockStore.tenants).toHaveLength(1);
    expect(mockStore.restaurant_menu_categories).toHaveLength(1);
    expect(mockStore.restaurant_menu_items).toHaveLength(3);

    // Payment mode updated to the latest call (provider flipped netopia → viva).
    const settings = mockStore.tenants[0].settings as {
      payments: { mode: string; provider: string };
    };
    expect(settings.payments.mode).toBe('card_sandbox');
    expect(settings.payments.provider).toBe('viva');

    // Menu item ids stable across runs.
    expect(second.menuItems.map((m) => m.id).sort()).toEqual(
      first.menuItems.map((m) => m.id).sort(),
    );
  });
});
