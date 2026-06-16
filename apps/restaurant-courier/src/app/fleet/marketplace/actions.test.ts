// Unit tests for fleet-side B2B marketplace server actions.
//
// Strategy Master Plan §5 (B2B Marketplace), Anti-Regression §5 (CLAUDE.md):
//
//   - submitOfferAction must reject bad input BEFORE calling the edge fn
//     (no money math leaks, no listing the fleet shouldn't see).
//   - The "listing not OPEN anymore" path is handled by the edge function
//     (status=409, error='listing_not_open'). The action must surface this
//     to the manager as a clear Romanian error instead of crashing.
//
// Mocks (declared BEFORE the SUT import):
//   - getFleetManagerContext → returns a fleet-manager context with
//     `isActive` toggleable per test (no isActive → "inactivă" branch).
//   - createServerClient → session with fake JWT (or null to test the
//     "session expired" branch).
//   - createAdminClient → only reached by withdrawOfferAction; we provide
//     a stub so the SUT loads.
//   - global fetch → intercepts edge fn calls and replays scripted JSON.
//   - next/cache → no-op revalidatePath.
//   - HIR_FEATURE_MARKETPLACE_ENABLED → set to 'true' in beforeEach so the
//     feature-flag gate doesn't short-circuit every test; one test toggles
//     it off to exercise the gate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────

const getFleetManagerContextMock = vi.fn();
vi.mock('@/lib/fleet-manager', () => ({
  getFleetManagerContext: () => getFleetManagerContextMock(),
}));

const getSessionMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: () => getSessionMock(),
    },
  }),
}));

// Only withdrawOfferAction touches the admin client — provide a stub builder
// so the SUT loads cleanly. submitOfferAction never reaches createAdminClient.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const fetchMock = vi.fn();

// ── Import SUT after mocks ────────────────────────────────────────────────

import { submitOfferAction } from './actions';

// ── Fixtures ──────────────────────────────────────────────────────────────

const LISTING_ID = '22222222-2222-2222-2222-222222222222';
const OFFER_ID = '33333333-3333-3333-3333-333333333333';
const FLEET_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const ACTIVE_FLEET = {
  userId: 'user-fleet-mgr-1',
  fleetId: FLEET_ID,
  slug: 'fleet-brasov',
  name: 'Fleet Brașov',
  brandColor: null,
  contactPhone: null,
  isActive: true,
};
const INACTIVE_FLEET = { ...ACTIVE_FLEET, isActive: false };

const VALID_SESSION = {
  data: {
    session: {
      access_token: 'jwt-fleet-token',
      user: { id: 'user-fleet-mgr-1' },
    },
  },
};

/** Far-future ISO so all "expires_at must be > now" checks pass. */
function futureIso(minutesFromNow = 30): string {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildOfferFormData(overrides: Record<string, string | null> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    listing_id: LISTING_ID,
    offered_price_ron: '25.50',
    eta_minutes: '20',
    expires_at: futureIso(15),
    notes: '',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v === null) continue;
    fd.set(k, v);
  }
  return fd;
}

// ── Lifecycle ────────────────────────────────────────────────────────────

beforeEach(() => {
  getFleetManagerContextMock.mockReset();
  getSessionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qfme.supabase.co';
  process.env.HIR_FEATURE_MARKETPLACE_ENABLED = 'true';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// submitOfferAction — price/ETA/window validation must short-circuit.
// ─────────────────────────────────────────────────────────────────────────

describe('submitOfferAction — feature flag gate', () => {
  it('returns Romanian "marketplace not active" when flag is off, before any context lookup', async () => {
    delete process.env.HIR_FEATURE_MARKETPLACE_ENABLED;
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Marketplace nu este activ/i);
    }
    expect(getFleetManagerContextMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flag explicitly "false" is treated the same as missing', async () => {
    process.env.HIR_FEATURE_MARKETPLACE_ENABLED = 'false';
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('submitOfferAction — auth + fleet context', () => {
  it('refuses when there is no fleet manager context', async () => {
    getFleetManagerContextMock.mockResolvedValue(null);
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Acces/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when fleet is inactive (paused/suspended)', async () => {
    getFleetManagerContextMock.mockResolvedValue(INACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/inactivă/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('submitOfferAction — listing_id validation', () => {
  it('rejects a non-uuid listing_id without calling fetch', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ listing_id: 'not-a-uuid' }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/invalidă/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty listing_id', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ listing_id: '' }));
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('submitOfferAction — price validation', () => {
  it('rejects a non-numeric offered_price_ron', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ offered_price_ron: 'free' }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Prețul/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a negative price', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ offered_price_ron: '-10' }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Prețul/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an absurdly large price (above 1,000,000 RON sanity ceiling)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(
      buildOfferFormData({ offered_price_ron: '2000000.00' }),
    );
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/prea mare|mare/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts both "." and "," as decimal separators (RO locale)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, offer_id: OFFER_ID }));

    const res = await submitOfferAction(buildOfferFormData({ offered_price_ron: '25,50' }));
    expect(res.ok).toBe(true);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.offered_price_cents).toBe(2550); // 25.50 RON → 2550 cents
  });

  it('rounds fractional bani to nearest cent (Math.round semantics)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, offer_id: OFFER_ID }));

    // 25.555 RON → 2555.5 cents → Math.round → 2556
    await submitOfferAction(buildOfferFormData({ offered_price_ron: '25.555' }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.offered_price_cents).toBe(2556);
  });
});

describe('submitOfferAction — ETA validation', () => {
  it('rejects ETA below the minimum (1)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ eta_minutes: '0' }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/ETA/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects ETA above the maximum (240)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ eta_minutes: '1000' }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/ETA/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer ETA', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ eta_minutes: 'soon' }));
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('submitOfferAction — expires_at validation', () => {
  it('rejects empty expires_at', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ expires_at: '' }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/valabilitate|durata/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects expires_at in the past', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const res = await submitOfferAction(buildOfferFormData({ expires_at: pastIso }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/viitor/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unparseable expires_at', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const res = await submitOfferAction(buildOfferFormData({ expires_at: 'tomorrow' }));
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('submitOfferAction — notes validation', () => {
  it('rejects notes over 1000 chars', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    const longNotes = 'a'.repeat(1001);
    const res = await submitOfferAction(buildOfferFormData({ notes: longNotes }));
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/1000 caractere/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// submitOfferAction — listing-status check (edge fn says listing not OPEN)
//
// The action itself does NOT pre-query the listing — that's the edge fn's
// job (single source of truth + RLS). When the edge fn returns the canonical
// `listing_not_open` / `listing_not_found` codes, the action must surface
// them clearly without throwing. This is the "listing status check" the
// task asks for: belt-and-suspenders for the case where the UI shows an
// OPEN listing but the row flipped to MATCHED/CANCELLED between render
// and click.
// ─────────────────────────────────────────────────────────────────────────

describe('submitOfferAction — listing status check (edge fn delegated)', () => {
  it('relays edge fn `listing_not_open` to the manager as the edge error string', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'listing_not_open' }, 409),
    );

    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      // submitOfferAction surfaces the raw edge error string verbatim.
      expect(res.error).toBe('listing_not_open');
    }
  });

  it('relays edge fn `listing_not_found` (race: listing deleted between render and click)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'listing_not_found' }, 404),
    );

    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toBe('listing_not_found');
    }
  });

  it('falls back to "HTTP <status>" when the edge fn returns a body without `error`', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, 500));

    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/HTTP 500/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// submitOfferAction — session + URL plumbing
// ─────────────────────────────────────────────────────────────────────────

describe('submitOfferAction — session and configuration', () => {
  it('rejects when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/Configurare/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the user has no Supabase session', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/expirat|Reconectează/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('happy path: posts the typed payload to marketplace-offer-submit with the bearer JWT', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, offer_id: OFFER_ID }));

    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/functions/v1/marketplace-offer-submit');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-fleet-token');

    const body = JSON.parse(init.body as string);
    expect(body.listing_id).toBe(LISTING_ID);
    expect(body.fleet_id).toBe(FLEET_ID);
    expect(body.offered_price_cents).toBe(2550); // 25.50 RON
    expect(body.eta_minutes).toBe(20);
    expect(typeof body.expires_at).toBe('string');
    expect(body.notes).toBeNull(); // empty notes → null
  });

  it('network failure is wrapped in a friendly error (no throw)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toBe('fetch failed');
    }
  });

  it('non-JSON response body produces a clear error (not a parse crash)', async () => {
    getFleetManagerContextMock.mockResolvedValue(ACTIVE_FLEET);
    getSessionMock.mockResolvedValue(VALID_SESSION);
    fetchMock.mockResolvedValueOnce(
      new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const res = await submitOfferAction(buildOfferFormData());
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.error).toMatch(/invalid|marketplace/i);
    }
  });
});
