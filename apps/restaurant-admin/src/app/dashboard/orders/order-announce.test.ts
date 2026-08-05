import { describe, it, expect } from 'vitest';
import { announceOnInsert, announceOnUpdate, isAwaitingCardPayment } from './order-announce';

// Observed on production 2026-08-05: the chime fired on INSERT with no regard
// for payment, so a card order rang in the kitchen before the customer had
// even reached the PSP page — and rang again for every checkout they
// abandoned there. These pin the corrected rule.

describe('announceOnInsert', () => {
  it('stays silent for a card order that has not been paid yet', () => {
    expect(
      announceOnInsert({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'CARD' }),
    ).toBe(false);
  });

  it('rings for cash on delivery, which is UNPAID by design', () => {
    expect(
      announceOnInsert({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'COD' }),
    ).toBe(true);
  });

  it('rings when a row somehow arrives already paid', () => {
    expect(
      announceOnInsert({ status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'CARD' }),
    ).toBe(true);
  });

  it('rings when the payment method is missing — a missed order costs more than a false ring', () => {
    expect(announceOnInsert({ status: 'PENDING', payment_status: 'UNPAID' })).toBe(true);
    expect(
      announceOnInsert({ status: 'PENDING', payment_status: 'UNPAID', payment_method: null }),
    ).toBe(true);
  });
});

describe('announceOnUpdate', () => {
  it('rings at the moment the card payment lands', () => {
    expect(
      announceOnUpdate({ status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'CARD' }),
    ).toBe(true);
  });

  it('stays silent when a COD order is settled at delivery', () => {
    // The reverse-sync trigger flips COD to PAID on DELIVERED. The kitchen
    // heard this order hours ago; ringing again would announce a delivery as
    // if it were a new order.
    expect(
      announceOnUpdate({ status: 'DELIVERED', payment_status: 'PAID', payment_method: 'COD' }),
    ).toBe(false);
  });

  it('stays silent for the courier-driven status walk of an already-paid order', () => {
    for (const status of ['PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY', 'DELIVERED']) {
      expect(announceOnUpdate({ status, payment_status: 'PAID', payment_method: 'CARD' })).toBe(
        false,
      );
    }
  });

  it('stays silent while the card payment is still pending or has failed', () => {
    expect(
      announceOnUpdate({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'CARD' }),
    ).toBe(false);
    expect(
      announceOnUpdate({ status: 'PENDING', payment_status: 'FAILED', payment_method: 'CARD' }),
    ).toBe(false);
  });

  it('stays silent for a cancelled order that was refunded', () => {
    expect(
      announceOnUpdate({ status: 'CANCELLED', payment_status: 'REFUNDED', payment_method: 'CARD' }),
    ).toBe(false);
  });
});

describe('isAwaitingCardPayment', () => {
  it('is the single condition that suppresses the insert chime', () => {
    expect(isAwaitingCardPayment({ payment_method: 'CARD', payment_status: 'UNPAID' })).toBe(true);
    expect(isAwaitingCardPayment({ payment_method: 'CARD', payment_status: 'PAID' })).toBe(false);
    expect(isAwaitingCardPayment({ payment_method: 'COD', payment_status: 'UNPAID' })).toBe(false);
  });
});
