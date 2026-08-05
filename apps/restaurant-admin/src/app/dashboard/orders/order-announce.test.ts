import { describe, it, expect } from 'vitest';
import { announceOnInsert, announceOnUpdate, isAwaitingCardPayment } from './order-announce';

// Observed on production 2026-08-05: the chime fired on INSERT with no regard
// for payment, so a card order rang in the kitchen before the customer had
// even reached the PSP page — and rang again for every checkout they
// abandoned there. These pin the corrected rule.

/** A storefront row, which is the only kind that exists before its payment. */
const shop = (row: Record<string, string | null>) => ({
  source: 'INTERNAL_STOREFRONT',
  ...row,
});

// Every source other than the storefront: payment is settled elsewhere, so no
// PSP webhook will ever flip these to PAID.
const FOREIGN_SOURCES = [
  'EXTERNAL_API',
  'POS_PUSH',
  'MANUAL_ADMIN',
  'GLOVO',
  'WOLT',
  'TAZZ',
  'FOODPANDA',
  'BOLT_FOOD',
  'VOICE',
];

describe('announceOnInsert', () => {
  it('stays silent for a storefront card order that has not been paid yet', () => {
    expect(
      announceOnInsert(shop({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'CARD' })),
    ).toBe(false);
  });

  it('rings for cash on delivery, which is UNPAID by design', () => {
    expect(
      announceOnInsert(shop({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'COD' })),
    ).toBe(true);
  });

  it('rings when a row somehow arrives already paid', () => {
    expect(
      announceOnInsert(shop({ status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'CARD' })),
    ).toBe(true);
  });

  it('rings for every non-storefront source, whose payment lives elsewhere', () => {
    // Codex P1 (#1062): these inherit payment_method='CARD' from the column
    // DEFAULT and stay UNPAID forever, which is exactly the shape the
    // suppression looks for. Silencing them would lose the order outright —
    // there is no later PAID update to rescue it.
    for (const source of FOREIGN_SOURCES) {
      expect(
        announceOnInsert({
          source,
          status: 'PENDING',
          payment_status: 'UNPAID',
          payment_method: 'CARD',
        }),
      ).toBe(true);
    }
  });

  it('rings when the source is missing — a missed order costs more than a false ring', () => {
    expect(
      announceOnInsert({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'CARD' }),
    ).toBe(true);
  });

  it('rings when the payment method is missing', () => {
    expect(announceOnInsert(shop({ status: 'PENDING', payment_status: 'UNPAID' }))).toBe(true);
    expect(
      announceOnInsert(shop({ status: 'PENDING', payment_status: 'UNPAID', payment_method: null })),
    ).toBe(true);
  });
});

describe('announceOnUpdate', () => {
  const unpaidCard = shop({ status: 'PENDING', payment_status: 'UNPAID', payment_method: 'CARD' });
  const paidCard = shop({ status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'CARD' });

  it('rings at the moment the card payment lands', () => {
    expect(announceOnUpdate(paidCard, unpaidCard)).toBe(true);
  });

  it('stays silent for a later update to an order that was already paid', () => {
    // Codex P2 (#1062): a tab that subscribed after the payment landed would
    // otherwise hear any subsequent update as a brand-new order, and its
    // session-local de-dupe set has never seen the id.
    expect(announceOnUpdate(paidCard, paidCard)).toBe(false);
  });

  it('rings when the previous row is missing, rather than going silent', () => {
    expect(announceOnUpdate(paidCard)).toBe(true);
  });

  it('stays silent for non-storefront orders, which already rang on INSERT', () => {
    for (const source of FOREIGN_SOURCES) {
      expect(
        announceOnUpdate(
          { source, status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'CARD' },
          { source, status: 'PENDING', payment_status: 'UNPAID', payment_method: 'CARD' },
        ),
      ).toBe(false);
    }
  });

  it('stays silent when an operator marks a COD order paid before delivery', () => {
    // COD reaches PAID twice over its life — reconciled by hand, and by the
    // reverse-sync trigger at DELIVERED. Neither is a new order.
    expect(
      announceOnUpdate(
        shop({ status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'COD' }),
        shop({ status: 'CONFIRMED', payment_status: 'UNPAID', payment_method: 'COD' }),
      ),
    ).toBe(false);
  });

  it('stays silent when a COD order is settled at delivery', () => {
    // The reverse-sync trigger flips COD to PAID on DELIVERED. The kitchen
    // heard this order hours ago; ringing again would announce a delivery as
    // if it were a new order.
    expect(
      announceOnUpdate(
        shop({ status: 'DELIVERED', payment_status: 'PAID', payment_method: 'COD' }),
        shop({ status: 'IN_DELIVERY', payment_status: 'UNPAID', payment_method: 'COD' }),
      ),
    ).toBe(false);
  });

  it('stays silent for the courier-driven status walk of an already-paid order', () => {
    for (const status of ['PREPARING', 'READY', 'DISPATCHED', 'IN_DELIVERY', 'DELIVERED']) {
      expect(
        announceOnUpdate(shop({ status, payment_status: 'PAID', payment_method: 'CARD' }), paidCard),
      ).toBe(false);
    }
  });

  it('stays silent while the card payment is still pending or has failed', () => {
    expect(announceOnUpdate(unpaidCard, unpaidCard)).toBe(false);
    expect(
      announceOnUpdate(
        shop({ status: 'PENDING', payment_status: 'FAILED', payment_method: 'CARD' }),
        unpaidCard,
      ),
    ).toBe(false);
  });

  it('stays silent for a cancelled order that was refunded', () => {
    expect(
      announceOnUpdate(
        shop({ status: 'CANCELLED', payment_status: 'REFUNDED', payment_method: 'CARD' }),
        paidCard,
      ),
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
