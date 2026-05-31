// Unit tests for POST /api/dispatch/reassign
//
// Covers:
//   - happy path: platform admin reassigns an OFFERED order
//   - status gate: order in DELIVERED (invalid) → 422
//   - same courier: new_courier_user_id === current assigned → 422
//   - missing courier: new courier has no courier_profiles row → 404
//
// All I/O dependencies are mocked — the test is hermetic and fast.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (declared before SUT import) ─────────────────────────────────────

const requirePlatformAdminMock = vi.fn();
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
  isPlatformAdminEmail: () => false,
}));

// createServerClient is only reached when requirePlatformAdmin fails.
// Provide a minimal stub so the import doesn't throw.
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminFromMock: vi.Mock;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => adminFromMock(t) }),
}));

const logAuditMock = vi.fn();
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

const notifyCourierUserMock = vi.fn();
vi.mock('@/lib/courier-push', () => ({
  notifyCourierUser: (...args: unknown[]) => notifyCourierUserMock(...args),
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────

import { POST } from './route';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_ADMIN = { ok: true as const, userId: 'admin-1', email: 'admin@hir.ro' };

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const OLD_COURIER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NEW_COURIER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FLEET_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/dispatch/reassign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a chainable query stub that resolves to `result`. */
function chainStub(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    update: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

function setupHappyPath() {
  // courier_orders lookup
  const orderChain = chainStub({
    data: {
      id: ORDER_ID,
      status: 'OFFERED',
      assigned_courier_user_id: OLD_COURIER,
      fleet_id: FLEET_ID,
      source_tenant_id: 'tenant-1',
    },
    error: null,
  });
  // courier_profiles lookup
  const profileChain = chainStub({
    data: { user_id: NEW_COURIER, fleet_id: FLEET_ID, status: 'ACTIVE' },
    error: null,
  });
  // update result
  const updateChain = chainStub({
    data: { id: ORDER_ID, status: 'OFFERED', assigned_courier_user_id: NEW_COURIER },
    error: null,
  });

  adminFromMock = vi.fn((table: string) => {
    if (table === 'courier_orders') return orderChain;
    if (table === 'courier_profiles') return profileChain;
    return chainStub({ data: null, error: null });
  });

  // Override update chain for courier_orders
  const updateResult = {
    select: () => updateResult,
    eq: () => updateResult,
    maybeSingle: () =>
      Promise.resolve({
        data: { id: ORDER_ID, status: 'OFFERED', assigned_courier_user_id: NEW_COURIER },
        error: null,
      }),
  };
  const orderChainWithUpdate = {
    select: () => orderChainWithUpdate,
    eq: () => orderChainWithUpdate,
    limit: () => orderChainWithUpdate,
    update: () => updateResult,
    maybeSingle: () =>
      Promise.resolve({
        data: {
          id: ORDER_ID,
          status: 'OFFERED',
          assigned_courier_user_id: OLD_COURIER,
          fleet_id: FLEET_ID,
          source_tenant_id: 'tenant-1',
        },
        error: null,
      }),
  };

  adminFromMock = vi.fn((table: string) => {
    if (table === 'courier_orders') return orderChainWithUpdate;
    if (table === 'courier_profiles') return profileChain;
    return chainStub({ data: null, error: null });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  requirePlatformAdminMock.mockReset();
  logAuditMock.mockReset();
  notifyCourierUserMock.mockReset();
  logAuditMock.mockResolvedValue(undefined);
  notifyCourierUserMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/dispatch/reassign', () => {
  it('happy path: platform admin reassigns OFFERED order, returns 200 with correct shape', async () => {
    requirePlatformAdminMock.mockResolvedValue(PLATFORM_ADMIN);
    setupHappyPath();

    const res = await POST(
      makeReq({
        courier_order_id: ORDER_ID,
        new_courier_user_id: NEW_COURIER,
        reason: 'Courier requested swap',
      }) as Request as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      order_id: ORDER_ID,
      previous_courier_id: OLD_COURIER,
      new_courier_id: NEW_COURIER,
      status: 'OFFERED',
    });

    // Audit was logged
    expect(logAuditMock).toHaveBeenCalledOnce();
    const auditCall = logAuditMock.mock.calls[0][0];
    expect(auditCall.action).toBe('courier.reassign');
    expect(auditCall.metadata.previous_courier_id).toBe(OLD_COURIER);
    expect(auditCall.metadata.new_courier_id).toBe(NEW_COURIER);

    // Push to new courier was fired
    expect(notifyCourierUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ courierUserId: NEW_COURIER }),
    );
  });

  it('returns 422 when order status is DELIVERED (not reassignable)', async () => {
    requirePlatformAdminMock.mockResolvedValue(PLATFORM_ADMIN);

    const deliveredChain = {
      select: () => deliveredChain,
      eq: () => deliveredChain,
      update: () => deliveredChain,
      limit: () => deliveredChain,
      maybeSingle: () =>
        Promise.resolve({
          data: {
            id: ORDER_ID,
            status: 'DELIVERED',
            assigned_courier_user_id: OLD_COURIER,
            fleet_id: FLEET_ID,
            source_tenant_id: 'tenant-1',
          },
          error: null,
        }),
    };
    adminFromMock = vi.fn(() => deliveredChain);

    const res = await POST(
      makeReq({
        courier_order_id: ORDER_ID,
        new_courier_user_id: NEW_COURIER,
        reason: 'test',
      }) as Request as NextRequest,
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('invalid_status');
  });

  it('returns 422 when new_courier_user_id equals current assigned courier', async () => {
    requirePlatformAdminMock.mockResolvedValue(PLATFORM_ADMIN);

    const sameChain = {
      select: () => sameChain,
      eq: () => sameChain,
      update: () => sameChain,
      limit: () => sameChain,
      maybeSingle: () =>
        Promise.resolve({
          data: {
            id: ORDER_ID,
            status: 'ACCEPTED',
            assigned_courier_user_id: NEW_COURIER, // same as requested new
            fleet_id: FLEET_ID,
            source_tenant_id: 'tenant-1',
          },
          error: null,
        }),
    };
    adminFromMock = vi.fn(() => sameChain);

    const res = await POST(
      makeReq({
        courier_order_id: ORDER_ID,
        new_courier_user_id: NEW_COURIER, // same as assigned
        reason: 'test',
      }) as Request as NextRequest,
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('same_courier');
  });

  it('returns 404 when new courier has no courier_profiles row', async () => {
    requirePlatformAdminMock.mockResolvedValue(PLATFORM_ADMIN);

    const orderChain = {
      select: () => orderChain,
      eq: () => orderChain,
      update: () => orderChain,
      limit: () => orderChain,
      maybeSingle: () =>
        Promise.resolve({
          data: {
            id: ORDER_ID,
            status: 'OFFERED',
            assigned_courier_user_id: OLD_COURIER,
            fleet_id: FLEET_ID,
            source_tenant_id: 'tenant-1',
          },
          error: null,
        }),
    };
    const missingProfileChain = {
      select: () => missingProfileChain,
      eq: () => missingProfileChain,
      update: () => missingProfileChain,
      limit: () => missingProfileChain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };

    adminFromMock = vi.fn((table: string) => {
      if (table === 'courier_orders') return orderChain;
      if (table === 'courier_profiles') return missingProfileChain;
      return orderChain;
    });

    const res = await POST(
      makeReq({
        courier_order_id: ORDER_ID,
        new_courier_user_id: NEW_COURIER,
        reason: 'test',
      }) as Request as NextRequest,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('courier_not_found');
  });
});

// Import type for the POST function signature check
import type { NextRequest } from 'next/server';
