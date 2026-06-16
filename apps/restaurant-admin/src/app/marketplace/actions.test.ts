// Unit tests for vendor-side B2B marketplace server actions.
//
// Strategy Master Plan §5 (B2B Marketplace), Anti-Regression §5 (CLAUDE.md):
// before merging, every action must reject bad input WITHOUT writing,
// and the accept-offer flow must survive a lost race (two concurrent
// accepts on the same listing → exactly one succeeds, second sees the
// edge fn's `listing_already_matched` code).
//
// Mocks (declared BEFORE the SUT import):
//   - createServerClient → returns a session with a fake access token so
//     requireAuthedSession() resolves; setting session=null exercises the
//     "session expired" branch.
//   - createAdminClientUntyped → chainable .from() builder. cancelListing
//     tests aren't in this file (covered separately) but the import path
//     must still mock so SUT module-load succeeds.
//   - global fetch → vi.stubGlobal'd to intercept edge-function calls and
//     return scripted JSON bodies (200 happy path, 409 race, 503 flag off).
//   - next/cache → no-op revalidatePath.
//
// Pattern mirrored from partner-commission-calc-v3.test.ts (pure-logic
// fixtures) AND payout-actions.test.ts (action-level fetch + admin mocks):
// fixtures live in this file, no Supabase migration runs, schema is the
// real one (we exercise the *action* shape, not the database).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before the SUT import) ───────────────────────────────

const getSessionMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: () => getSessionMock(),
    },
  }),
}));

// Untyped admin client is only reached by cancelListingAction, which we
// don't exercise here — provide a stub so the SUT module loads.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
  createAdminClientUntyped: () => ({
    from: vi.fn(),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Stub global fetch — every edge-fn call goes through it.
const fetchMock = vi.fn();

// ── Import SUT after mocks ────────────────────────────────────────────────

import { createListingAction, acceptOfferAction } from './actions';

// ── Fixtures ──────────────────────────────────────────────────────────────

const VENDOR_TENANT = '11111111-1111-1111-1111-111111111111';
const LISTING_ID = '22222222-2222-2222-2222-222222222222';
const OFFER_ID = '33333333-3333-3333-3333-333333333333';
const MATCH_ID = '44444444-4444-4444-4444-444444444444';

const VALID_SESSION = {
  data: {
    session: {
      access_token: 'jwt-fake-token',
      user: { id: 'user-vendor-1' },
    },
  },
};

const NO_SESSION = { data: { session: null } };

/** Build a Response with JSON body + status code. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Construct a FormData with all required fields for createListingAction,
 * letting individual tests override individual fields.
 */
function buildCreateListingFormData(overrides: Record<string, string | null> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    vendor_tenant_id: VENDOR_TENANT,
    vertical: 'restaurant',
    delivery_window_start: '2026-12-01T12:00',
    delivery_window_end: '2026-12-01T13:00',
    pickup_street: 'Bd. Eroilor',
    pickup_number: '15',
    pickup_city: 'Brașov',
    dropoff_street: 'Str. Lungă',
    dropoff_number: '120',
    dropoff_city: 'Brașov',
    package_description: '2 cutii cu medicamente',
    package_temperature: 'ambient',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v === null) continue; // skip — exercises empty-field validation
    fd.set(k, v);
  }
  return fd;
}

// ── Lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  getSessionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // The action reads NEXT_PUBLIC_SUPABASE_URL from process.env; set a
  // deterministic value so the assembled URL is stable across tests.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qfme.supabase.co';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// createListingAction — validation errors must short-circuit BEFORE fetch
// ─────────────────────────────────────────────────────────────────────────

describe('createListingAction — validation errors', () => {
  it('returns "session expired" error when no session and never calls fetch', async () => {
    getSessionMock.mockResolvedValue(NO_SESSION);
    const res = await createListingAction(buildCreateListingFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Sesiune/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty vendor_tenant_id without calling fetch', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({ vendor_tenant_id: '' });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown vertical without calling fetch', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({ vertical: 'spaceship' });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Vertical/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects missing delivery window start without calling fetch', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({ delivery_window_start: null });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Interval/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when delivery_window_end <= delivery_window_start without calling fetch', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({
      delivery_window_start: '2026-12-01T13:00',
      delivery_window_end: '2026-12-01T12:00',
    });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      // "Sfârșitul intervalului trebuie să fie după început."
      expect(res.error).toMatch(/început|sfârșit/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when delivery_window_end === delivery_window_start (no zero-length windows)', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const same = '2026-12-01T12:00';
    const fd = buildCreateListingFormData({
      delivery_window_start: same,
      delivery_window_end: same,
    });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when pickup address is fully empty', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({
      pickup_street: '',
      pickup_number: '',
      pickup_city: '',
      pickup_notes: '',
    });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/ridicare/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when dropoff address is fully empty', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({
      dropoff_street: '',
      dropoff_number: '',
      dropoff_city: '',
      dropoff_notes: '',
    });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/livrare/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects empty package_description', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({ package_description: '' });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/pachet/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer or out-of-range package_weight_grams', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    for (const bad of ['60000', '-5', '12.5']) {
      const fd = buildCreateListingFormData({ package_weight_grams: bad });
      const res = await createListingAction(fd);
      expect(res.ok).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported package_temperature without calling fetch', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const fd = buildCreateListingFormData({ package_temperature: 'molten' });
    const res = await createListingAction(fd);
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/temperatur/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when NEXT_PUBLIC_SUPABASE_URL is not configured', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await createListingAction(buildCreateListingFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      // describeEdgeError fallback formatting
      expect(res.error).toMatch(/NEXT_PUBLIC_SUPABASE_URL|cod/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('happy path: posts the typed payload to marketplace-listing-create and returns listingId', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, listing_id: LISTING_ID, expires_at: '2026-12-01T11:55:00Z' }),
    );

    const res = await createListingAction(buildCreateListingFormData());
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.data.listingId).toBe(LISTING_ID);
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/functions/v1/marketplace-listing-create');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer jwt-fake-token');
    const body = JSON.parse(init.body as string);
    expect(body.vendor_tenant_id).toBe(VENDOR_TENANT);
    expect(body.vertical).toBe('restaurant');
    expect(body.pickup_address.city).toBe('Brașov');
    expect(body.dropoff_address.city).toBe('Brașov');
    expect(body.publish).toBe(true);
  });

  it('happy path: relays edge fn `marketplace_feature_not_enabled` to a Romanian message', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'marketplace_feature_not_enabled' }, 503),
    );
    const res = await createListingAction(buildCreateListingFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Marketplace nu este activ/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// acceptOfferAction — race protection (concurrent accepts on one listing)
//
// Anti-Regression §5: two managers click "accept" at near-identical times.
// The edge fn is responsible for the atomic CAS (FOR UPDATE on the listing
// + UNIQUE(listing_id) on marketplace_matches). From the action's POV,
// success on the first call AND `listing_already_matched` (HTTP 409) on
// the second is the correct end state.
// ─────────────────────────────────────────────────────────────────────────

describe('acceptOfferAction — race protection', () => {
  it('returns success when the edge fn returns ok:true with match details', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        match_id: MATCH_ID,
        listing_id: LISTING_ID,
        offer_id: OFFER_ID,
        final_price_cents: 3000,
        hir_fee_cents: 100,
      }),
    );

    const res = await acceptOfferAction({
      offerId: OFFER_ID,
      listingId: LISTING_ID,
      hirFeeCents: 100,
    });

    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.data.matchId).toBe(MATCH_ID);
      expect(res.data.finalPriceCents).toBe(3000);
      expect(res.data.hirFeeCents).toBe(100);
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/functions/v1/marketplace-match-accept');
    const body = JSON.parse(init.body as string);
    expect(body.offer_id).toBe(OFFER_ID);
    expect(body.hir_fee_cents).toBe(100);
  });

  it('losing-side race: returns Romanian `listing_already_matched` error and never throws', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    // 409 + the canonical race error code the edge fn emits when another
    // accept already flipped the listing to MATCHED.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'listing_already_matched' }, 409),
    );

    const res = await acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID });

    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/altă ofertă|deja acceptată/i);
    }
  });

  it('losing-side race variant: `offer_not_pending` from a withdrawn-then-re-clicked button', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'offer_not_pending' }, 409),
    );

    const res = await acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/preluată|retrasă/i);
    }
  });

  it('expired-offer race: `offer_expired` produces a clear vendor-facing message', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'offer_expired' }, 400),
    );
    const res = await acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/expirat/i);
    }
  });

  it('two concurrent accepts: exactly one returns success, the other returns the race error', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    // First fetch wins (200), second loses (409 listing_already_matched).
    // Promise.all with the SAME action ensures both go through the SAME
    // SUT and both go through fetchMock — order is deterministic because
    // fetchMock returns its queued values in call order.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          match_id: MATCH_ID,
          listing_id: LISTING_ID,
          offer_id: OFFER_ID,
          final_price_cents: 3000,
          hir_fee_cents: 100,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, error: 'listing_already_matched' }, 409),
      );

    const [a, b] = await Promise.all([
      acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID }),
      acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID }),
    ]);

    const successes = [a, b].filter((r) => r.ok === true);
    const failures = [a, b].filter((r) => r.ok === false);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0].ok === false) {
      expect(failures[0].error).toMatch(/altă ofertă|deja acceptată/i);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects empty offerId without calling fetch', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    const res = await acceptOfferAction({ offerId: '', listingId: LISTING_ID });
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no session: never calls the edge fn', async () => {
    getSessionMock.mockResolvedValue(NO_SESSION);
    const res = await acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID });
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns "invalid response" when edge fn returns ok:true but missing match_id', async () => {
    // Defense-in-depth: malformed edge response must not crash the action,
    // must return a clear error instead.
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, final_price_cents: 3000, hir_fee_cents: 100 }),
    );
    const res = await acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/invalid|server/i);
    }
  });

  it('network error: returns a sensible failure instead of throwing', async () => {
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await acceptOfferAction({ offerId: OFFER_ID, listingId: LISTING_ID });
    expect(res.ok).toBe(false);
    // describeEdgeError prefixes unknown codes; the "Edge function unreachable"
    // text comes via the unrecognized-code fallback path.
    if (res.ok === false) {
      expect(res.error.length).toBeGreaterThan(0);
    }
  });
});
