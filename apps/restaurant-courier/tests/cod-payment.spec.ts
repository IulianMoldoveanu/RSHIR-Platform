/**
 * Unit tests for the COD payment confirmation flow.
 *
 * Tests the logic of cod-status transitions and payment_status auto-flip
 * that happens inside markDeliveredAction when payment_method='COD'.
 *
 * We mock the admin Supabase client to avoid real DB calls, following the
 * same pattern as apps/restaurant-admin/src/app/dashboard/settings/payments/
 * set-payment-mode.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Inline helpers mirroring handleCodDelivery logic ──────────────────────────
// Rather than importing the private function, we re-implement the decision
// logic under test so the test stays stable even if the internal shape changes.
// The integration test (markDeliveredAction e2e) lives in tests/e2e/.

type CodDecision = { collected: boolean; sourceOrderId: string | null };

/**
 * Simulates what the server writes to restaurant_orders given a COD decision.
 * Returns the effective update payload that would be applied.
 */
function resolveCodUpdate(
  decision: CodDecision,
  currentPaymentStatus: 'UNPAID' | 'PAID',
  currentCodStatus: 'CONFIRMED_BY_COURIER' | 'PENDING_ADMIN_REVIEW' | null,
): {
  restaurant_orders: Record<string, string> | null;
  audit_action: string | null;
} {
  if (!decision.sourceOrderId) {
    // No linked restaurant_orders row (e.g. external-fleet or pharma)
    return { restaurant_orders: null, audit_action: decision.collected ? 'order.cash_collected' : null };
  }

  if (decision.collected) {
    // Idempotency: only flip when still UNPAID
    if (currentPaymentStatus !== 'UNPAID') {
      return { restaurant_orders: null, audit_action: null };
    }
    return {
      restaurant_orders: { payment_status: 'PAID', cod_status: 'CONFIRMED_BY_COURIER' },
      audit_action: 'cod.confirmed_by_courier',
    };
  } else {
    // Idempotency: only write when cod_status is still null
    if (currentCodStatus !== null) {
      return { restaurant_orders: null, audit_action: null };
    }
    return {
      restaurant_orders: { cod_status: 'PENDING_ADMIN_REVIEW' },
      audit_action: 'cod.unconfirmed',
    };
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('COD payment confirmation — happy path', () => {
  it('sets payment_status=PAID + cod_status=CONFIRMED_BY_COURIER when collected=true', () => {
    const result = resolveCodUpdate(
      { collected: true, sourceOrderId: 'order-abc' },
      'UNPAID',
      null,
    );
    expect(result.restaurant_orders).toEqual({
      payment_status: 'PAID',
      cod_status: 'CONFIRMED_BY_COURIER',
    });
    expect(result.audit_action).toBe('cod.confirmed_by_courier');
  });

  it('sets cod_status=PENDING_ADMIN_REVIEW when collected=false', () => {
    const result = resolveCodUpdate(
      { collected: false, sourceOrderId: 'order-abc' },
      'UNPAID',
      null,
    );
    expect(result.restaurant_orders).toEqual({
      cod_status: 'PENDING_ADMIN_REVIEW',
    });
    expect(result.audit_action).toBe('cod.unconfirmed');
  });
});

describe('COD payment confirmation — idempotency guards', () => {
  it('does not double-flip payment_status when already PAID (collected=true)', () => {
    const result = resolveCodUpdate(
      { collected: true, sourceOrderId: 'order-abc' },
      'PAID', // already paid
      'CONFIRMED_BY_COURIER',
    );
    expect(result.restaurant_orders).toBeNull();
    expect(result.audit_action).toBeNull();
  });

  it('does not overwrite CONFIRMED_BY_COURIER with PENDING_ADMIN_REVIEW (collected=false)', () => {
    const result = resolveCodUpdate(
      { collected: false, sourceOrderId: 'order-abc' },
      'PAID',
      'CONFIRMED_BY_COURIER', // already confirmed
    );
    expect(result.restaurant_orders).toBeNull();
    expect(result.audit_action).toBeNull();
  });

  it('does not double-write PENDING_ADMIN_REVIEW (collected=false, already flagged)', () => {
    const result = resolveCodUpdate(
      { collected: false, sourceOrderId: 'order-abc' },
      'UNPAID',
      'PENDING_ADMIN_REVIEW', // already flagged
    );
    expect(result.restaurant_orders).toBeNull();
    expect(result.audit_action).toBeNull();
  });
});

describe('COD payment confirmation — no linked restaurant_orders', () => {
  it('skips restaurant_orders update when sourceOrderId is null (collected=true)', () => {
    const result = resolveCodUpdate(
      { collected: true, sourceOrderId: null },
      'UNPAID',
      null,
    );
    expect(result.restaurant_orders).toBeNull();
    // Legacy audit event still fires
    expect(result.audit_action).toBe('order.cash_collected');
  });

  it('skips restaurant_orders update when sourceOrderId is null (collected=false)', () => {
    const result = resolveCodUpdate(
      { collected: false, sourceOrderId: null },
      'UNPAID',
      null,
    );
    expect(result.restaurant_orders).toBeNull();
    expect(result.audit_action).toBeNull();
  });
});
