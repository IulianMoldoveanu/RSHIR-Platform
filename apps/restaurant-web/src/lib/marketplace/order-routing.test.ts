// Lane HIRforYOU-MARKETPLACE (2026-05-28) — pure-function tests for the
// marketplace totals + customer validators. Heavy upsert logic that touches
// the DB is covered by integration tests under e2e/marketplace/ (followups).

import { describe, it, expect } from 'vitest';
import {
  computeMarketplaceTotals,
  validateMarketplaceCustomer,
  HIR_MARKETPLACE_TAKE_RON,
} from './order-routing';

describe('computeMarketplaceTotals', () => {
  it('sums line items × quantity', () => {
    const totals = computeMarketplaceTotals(
      [
        { itemId: 'a', name: 'Burger', priceRon: 30, quantity: 2 },
        { itemId: 'b', name: 'Fries', priceRon: 10, quantity: 1 },
      ],
      5,
    );
    expect(totals.subtotalRon).toBe(70);
    expect(totals.deliveryFeeRon).toBe(5);
    expect(totals.totalRon).toBe(75);
  });

  it('applies modifier price deltas per unit', () => {
    const totals = computeMarketplaceTotals(
      [
        {
          itemId: 'a',
          name: 'Pizza',
          priceRon: 40,
          quantity: 2,
          modifiers: [
            { id: 'm1', name: 'Extra cheese', priceDeltaRon: 5 },
            { id: 'm2', name: 'Spicy', priceDeltaRon: 0 },
          ],
        },
      ],
      0,
    );
    // (40 + 5 + 0) * 2 = 90
    expect(totals.subtotalRon).toBe(90);
    expect(totals.totalRon).toBe(90);
  });

  it('ignores zero-quantity lines', () => {
    const totals = computeMarketplaceTotals(
      [
        { itemId: 'a', name: 'Burger', priceRon: 30, quantity: 0 },
        { itemId: 'b', name: 'Fries', priceRon: 10, quantity: 1 },
      ],
      0,
    );
    expect(totals.subtotalRon).toBe(10);
  });

  it('clamps negative delivery fee to zero', () => {
    const totals = computeMarketplaceTotals(
      [{ itemId: 'a', name: 'Item', priceRon: 50, quantity: 1 }],
      -3,
    );
    expect(totals.deliveryFeeRon).toBe(0);
    expect(totals.totalRon).toBe(50);
  });

  it('computes HIR take rate at the configured flat amount', () => {
    const totals = computeMarketplaceTotals(
      [{ itemId: 'a', name: 'Item', priceRon: 100, quantity: 1 }],
      10,
    );
    expect(totals.hirTakeRon).toBe(HIR_MARKETPLACE_TAKE_RON);
    expect(totals.tenantNetRon).toBe(round2(110 - HIR_MARKETPLACE_TAKE_RON));
  });

  it('caps HIR take when total is smaller than the take rate', () => {
    const totals = computeMarketplaceTotals(
      [{ itemId: 'a', name: 'Cheap', priceRon: 1, quantity: 1 }],
      0,
    );
    expect(totals.totalRon).toBe(1);
    expect(totals.hirTakeRon).toBeLessThanOrEqual(1);
    expect(totals.tenantNetRon).toBeGreaterThanOrEqual(0);
  });

  it('rounds to 2 decimals to avoid floating-point dust', () => {
    const totals = computeMarketplaceTotals(
      [
        { itemId: 'a', name: 'A', priceRon: 0.1, quantity: 1 },
        { itemId: 'b', name: 'B', priceRon: 0.2, quantity: 1 },
      ],
      0,
    );
    // 0.1 + 0.2 = 0.30000000000000004 without rounding
    expect(totals.subtotalRon).toBe(0.3);
    expect(totals.totalRon).toBe(0.3);
  });
});

describe('validateMarketplaceCustomer', () => {
  it('rejects when neither email nor phone provided', () => {
    expect(validateMarketplaceCustomer({})).toEqual({ code: 'marketplace.customer.missing_contact' });
    expect(validateMarketplaceCustomer({ email: '', phone: '' })).toEqual({
      code: 'marketplace.customer.missing_contact',
    });
  });

  it('accepts a valid email', () => {
    expect(validateMarketplaceCustomer({ email: 'ana@example.com' })).toBeNull();
  });

  it('accepts a valid RO mobile phone', () => {
    expect(validateMarketplaceCustomer({ phone: '+40712345678' })).toBeNull();
    expect(validateMarketplaceCustomer({ phone: '0712 345 678' })).toBeNull();
  });

  it('rejects a malformed email', () => {
    expect(validateMarketplaceCustomer({ email: 'not-an-email' })).toEqual({
      code: 'marketplace.customer.invalid_email',
    });
  });

  it('rejects a clearly invalid phone', () => {
    expect(validateMarketplaceCustomer({ phone: 'abc' })).toEqual({
      code: 'marketplace.customer.invalid_phone',
    });
  });

  it('accepts when either contact channel is valid (email OR phone)', () => {
    expect(
      validateMarketplaceCustomer({ email: 'a@b.co', phone: '' }),
    ).toBeNull();
    expect(
      validateMarketplaceCustomer({ email: '', phone: '+40712345678' }),
    ).toBeNull();
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
