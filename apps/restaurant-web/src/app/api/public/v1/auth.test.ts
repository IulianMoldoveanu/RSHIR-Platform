// Regression lock for the bug that kept the whole public API dark.
//
// `authenticateBearerKey` had no tests at all: every route test mocks the
// function itself, so nothing ever executed this file. Meanwhile the real
// postgrest client returns a *thenable* from `.eq()` — an object with
// `then()` and no `catch()` — and the code called `.catch()` on it. Every
// request carrying a valid key threw a TypeError and answered 500 with an
// empty body, while unauthenticated requests kept returning a tidy 401
// because they returned before reaching that line.
//
// The mock below therefore refuses to be more generous than production: the
// update chain returns a bare thenable. A test double that handed back a
// real Promise would pass against the broken code and prove nothing.

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

type Row = { id: string; tenant_id: string; scopes: string[] } | null;

let keyRow: Row = null;
let lookedUpHash: string | null = null;
let updateCalls = 0;

/** Exactly what postgrest-js gives back: then(), and nothing else. */
function bareThenable<T>(value: T): PromiseLike<T> {
  return {
    then(onfulfilled, onrejected) {
      return Promise.resolve(value).then(onfulfilled, onrejected);
    },
  };
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, hash: string) => {
          lookedUpHash = hash;
          return {
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: table === 'tenant_api_keys' ? keyRow : null,
                  error: null,
                }),
            }),
          };
        },
      }),
      update: () => ({
        eq: () => {
          updateCalls += 1;
          return bareThenable({ data: null, error: null });
        },
      }),
    }),
  }),
}));

const { authenticateBearerKey } = await import('./auth');

beforeEach(() => {
  keyRow = null;
  lookedUpHash = null;
  updateCalls = 0;
});

describe('authenticateBearerKey', () => {
  test('a valid key resolves instead of throwing on the fire-and-forget update', async () => {
    keyRow = { id: 'key-1', tenant_id: 'tenant-1', scopes: ['orders.write', 'orders.read'] };

    const authed = await authenticateBearerKey('Bearer hir_live_secret');

    expect(authed).toEqual({
      tenantId: 'tenant-1',
      keyId: 'key-1',
      scopes: ['orders.write', 'orders.read'],
    });
    // The touch still goes out — it just must not take the request down.
    expect(updateCalls).toBe(1);
  });

  test('looks the key up by its sha256 digest, never by the raw token', async () => {
    keyRow = { id: 'key-1', tenant_id: 'tenant-1', scopes: ['orders.write'] };
    const raw = 'hir_live_secret';

    await authenticateBearerKey(`Bearer ${raw}`);

    expect(lookedUpHash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(lookedUpHash).not.toBe(raw);
  });

  test('surrounding whitespace in the header does not change the digest', async () => {
    keyRow = { id: 'key-1', tenant_id: 'tenant-1', scopes: [] };
    await authenticateBearerKey('Bearer   hir_live_secret   ');
    expect(lookedUpHash).toBe(createHash('sha256').update('hir_live_secret').digest('hex'));
  });

  test('returns null for a key that matches nothing, without touching last_used_at', async () => {
    keyRow = null;
    expect(await authenticateBearerKey('Bearer nope')).toBeNull();
    expect(updateCalls).toBe(0);
  });

  test.each([
    ['a missing header', null],
    ['a header that is not Bearer', 'Basic abc'],
    ['Bearer with an empty token', 'Bearer    '],
  ])('returns null for %s', async (_label, header) => {
    expect(await authenticateBearerKey(header)).toBeNull();
    expect(updateCalls).toBe(0);
  });
});
