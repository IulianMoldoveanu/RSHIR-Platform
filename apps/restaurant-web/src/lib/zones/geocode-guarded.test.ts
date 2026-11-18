// The guard in front of Nominatim. Nominatim's policy is 1 request/second per
// IP and it bans on abuse, and a ban lands on our egress IP — so the throttle
// and the cache here are the only thing standing between a traffic burst and
// storefront checkout losing geocoding entirely.
//
// Module-level state (L1 cache, queue, lastFetchAt) is shared across these
// tests by design, since that is how it behaves in a warm serverless
// instance. Each test therefore uses distinct addresses.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const upstream = vi.fn(
  async (_q: string): Promise<{ lat: number; lng: number; displayName: string } | null> => ({
    lat: 44.4,
    lng: 26.1,
    displayName: 'stub',
  }),
);
vi.mock('./nominatim', () => ({
  geocodeAddressRoVerbose: (q: string) => upstream(q),
}));

// L2 is an optimisation that swallows its own errors. Reads are a clean miss
// so these tests exercise the queue rather than a database; the write delay is
// adjustable, to prove a slow upsert cannot hold back a finished lookup.
let upsertDelayMs = 0;
let selectDelayMs = 0;
const upsertSpy = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (selectDelayMs > 0) await new Promise((r) => setTimeout(r, selectDelayMs));
            return { data: null };
          },
        }),
      }),
      upsert: async (row: unknown) => {
        upsertSpy(row);
        if (upsertDelayMs > 0) await new Promise((r) => setTimeout(r, upsertDelayMs));
        return { error: null };
      },
    }),
  }),
}));

import { geocodeGuarded } from './geocode-guarded';

describe('geocodeGuarded', () => {
  beforeEach(() => {
    upstream.mockClear();
    upsertSpy.mockClear();
    upsertDelayMs = 0;
    selectDelayMs = 0;
    upstream.mockResolvedValue({ lat: 44.4, lng: 26.1, displayName: 'stub' });
  });

  it('returns the upstream hit and sends the full address', async () => {
    const res = await geocodeGuarded({ line1: 'Strada Unu 1', city: 'București' });
    expect(res.hit).toMatchObject({ lat: 44.4, lng: 26.1 });
    expect(res.cached).toBe(false);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe('Strada Unu 1, București, Romania');
  });

  it('serves a repeat from cache without touching upstream or the queue', async () => {
    await geocodeGuarded({ line1: 'Strada Doi 2', city: 'București' });
    upstream.mockClear();

    // Same address, different case and spacing: the key is normalised.
    const started = Date.now();
    const again = await geocodeGuarded({ line1: '  strada doi 2 ', city: 'BUCUREȘTI' });

    expect(again.cached).toBe(true);
    expect(again.hit).toMatchObject({ lat: 44.4, lng: 26.1 });
    expect(upstream).not.toHaveBeenCalled();
    // A cache hit must not pay the 1.1s spacing.
    expect(Date.now() - started).toBeLessThan(500);
  });

  // The reason timeoutMs exists. An abandoned lookup cannot jump the queue —
  // it still waits for whatever is ahead of it — but it must not hold a 1.1s
  // slot of its own, or a burst of 60 of them parks a minute of unusable work
  // in front of the orders that arrive next and starves those too.
  it('expired lookups release their slots, so the next live one is not starved', async () => {
    const live1 = geocodeGuarded({ line1: 'Strada Trei 3', city: 'București' });
    const abandoned = Array.from({ length: 5 }, (_, i) =>
      geocodeGuarded({ line1: `Abandonata ${i}`, city: 'București' }, { timeoutMs: 0 }),
    );
    const started = Date.now();
    const live2 = geocodeGuarded({ line1: 'Strada Sase 6', city: 'București' });

    const results = await Promise.all([live1, ...abandoned, live2]);
    const elapsed = Date.now() - started;

    for (const r of results.slice(1, 6)) {
      expect(r).toEqual({ hit: null, cached: false, expired: true });
    }
    expect(results[0].hit).not.toBeNull();
    expect(results[6].hit).not.toBeNull();

    // Only the two live lookups reached Nominatim.
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls.map((c) => c[0]).join('|')).toContain('Strada Sase 6');

    // Two live lookups cost ~2 x 1.1s. Had the five abandoned ones each held
    // a slot, this would have taken ~7 x 1.1s instead.
    expect(elapsed).toBeLessThan(4_000);
  });

  it('a generous deadline still lets the lookup through', async () => {
    const res = await geocodeGuarded(
      { line1: 'Strada Cinci 5', city: 'București' },
      { timeoutMs: 30_000 },
    );
    expect(res.expired).toBeUndefined();
    expect(res.hit).toMatchObject({ lat: 44.4, lng: 26.1 });
  });

  // The L2 write is there to spare other instances a lookup. Awaiting it could
  // push a result the caller already has past its deadline, leaving a delivery
  // unpriced for the sake of an optimisation.
  it('does not let a slow cache write hold back a finished lookup', async () => {
    upsertDelayMs = 3_000;

    const started = Date.now();
    const res = await geocodeGuarded({ line1: 'Strada Sapte 7', city: 'București' });
    const elapsed = Date.now() - started;

    expect(res.hit).toMatchObject({ lat: 44.4, lng: 26.1 });
    // 1.1s of spacing is expected; the 3s upsert must not be added to it.
    expect(elapsed).toBeLessThan(2_500);
    // ...and the write was still started, not skipped.
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  // The deadline has to start at entry, not after the cache reads. Computed
  // later it would be a fresh budget handed out after the caller gave up, and
  // the lookup would queue upstream work nobody can use — the very thing
  // timeoutMs exists to stop.
  it('counts a slow cache read against the deadline, not on top of it', async () => {
    selectDelayMs = 300;

    const res = await geocodeGuarded(
      { line1: 'Strada Opt 8', city: 'București' },
      { timeoutMs: 100 },
    );

    expect(res).toEqual({ hit: null, cached: false, expired: true });
    // Never reached Nominatim: no slot was taken for a result nobody wanted.
    expect(upstream).not.toHaveBeenCalled();
  });

  it('reports a genuine no-match differently from an expired queue slot', async () => {
    upstream.mockResolvedValue(null);
    const res = await geocodeGuarded({ line1: 'Nicăieri 99', city: 'București' });
    expect(res).toEqual({ hit: null, cached: false });
    expect(res.expired).toBeUndefined();
  });
});
