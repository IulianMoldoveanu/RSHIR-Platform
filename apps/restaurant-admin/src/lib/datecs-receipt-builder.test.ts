// Unit tests for the Datecs FiscalNet-2 receipt builder.
//
// Builder lives in @hir/integration-core (pure module, no I/O); tests
// live here for the same reason custom-adapter tests do — reuse the
// existing restaurant-admin vitest harness until the package gets its
// own.

import { describe, expect, it } from 'vitest';
import {
  buildDatecsReceipt,
  chunkLine,
  roundRon,
  sanitizeLine,
} from '@hir/integration-core';
import type {
  DatecsReceiptStep,
  OrderPayload,
} from '@hir/integration-core';

function baseOrder(overrides: Partial<OrderPayload> = {}): OrderPayload {
  return {
    orderId: 'ord_abcdef1234567890',
    source: 'INTERNAL_STOREFRONT',
    status: 'DELIVERED',
    items: [
      { name: 'Pizza Margherita', qty: 1, priceRon: 35 },
      { name: 'Coca-Cola 0.5L', qty: 2, priceRon: 8 },
    ],
    totals: { subtotalRon: 51, deliveryFeeRon: 10, totalRon: 61 },
    customer: { firstName: 'Iulian', phone: '+40700000001' },
    dropoff: { line1: 'Str. Foișorului 1', city: 'Brașov' },
    notes: null,
    ...overrides,
  };
}

function findStep<K extends DatecsReceiptStep['kind']>(
  steps: DatecsReceiptStep[],
  kind: K,
): Extract<DatecsReceiptStep, { kind: K }> | undefined {
  return steps.find((s) => s.kind === kind) as
    | Extract<DatecsReceiptStep, { kind: K }>
    | undefined;
}

describe('buildDatecsReceipt — happy path', () => {
  it('emits open + sale lines + delivery + subtotal + payment + close in order', () => {
    const program = buildDatecsReceipt({
      order: baseOrder(),
      paymentMethod: 'COD',
    });
    const kinds = program.steps.map((s) => s.kind);
    expect(kinds[0]).toBe('open_fiscal_receipt');
    expect(kinds[kinds.length - 1]).toBe('close_fiscal_receipt');
    // Subtotal must come AFTER the last sale line and BEFORE payment.
    const subtotalIdx = kinds.indexOf('subtotal');
    const paymentIdx = kinds.indexOf('payment');
    const lastSaleIdx = kinds.lastIndexOf('sale_line');
    expect(lastSaleIdx).toBeGreaterThan(0);
    expect(subtotalIdx).toBeGreaterThan(lastSaleIdx);
    expect(paymentIdx).toBeGreaterThan(subtotalIdx);
  });

  it('echoes the orderId on the program envelope and includes a header free-text line', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({ orderId: 'ord_FOISORUL_test_01' }),
      paymentMethod: 'CARD',
    });
    expect(program.orderId).toBe('ord_FOISORUL_test_01');
    const header = program.steps.find(
      (s) => s.kind === 'free_text' && s.text.startsWith('HIR #'),
    );
    expect(header).toBeDefined();
  });

  it('rounds prices to bani (2 decimals) defensively', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [{ name: 'Float-priced item', qty: 1, priceRon: 12.500000001 }],
        totals: { subtotalRon: 12.5, deliveryFeeRon: 0, totalRon: 12.5 },
      }),
      paymentMethod: 'COD',
    });
    const sale = findStep(program.steps, 'sale_line');
    expect(sale?.unitPriceRon).toBe(12.5);
  });
});

describe('buildDatecsReceipt — payment mapping', () => {
  it('maps COD → cash', () => {
    const program = buildDatecsReceipt({
      order: baseOrder(),
      paymentMethod: 'COD',
    });
    const payment = findStep(program.steps, 'payment');
    expect(payment?.method).toBe('cash');
  });

  it('maps CARD → card', () => {
    const program = buildDatecsReceipt({
      order: baseOrder(),
      paymentMethod: 'CARD',
    });
    const payment = findStep(program.steps, 'payment');
    expect(payment?.method).toBe('card');
  });

  it('maps null payment_method → cash (safe default)', () => {
    const program = buildDatecsReceipt({
      order: baseOrder(),
      paymentMethod: null,
    });
    const payment = findStep(program.steps, 'payment');
    expect(payment?.method).toBe('cash');
  });

  it('payment amount equals totalRon (subtotal + delivery)', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        totals: { subtotalRon: 51, deliveryFeeRon: 10, totalRon: 61 },
      }),
      paymentMethod: 'COD',
    });
    const payment = findStep(program.steps, 'payment');
    expect(payment?.amountRon).toBe(61);
  });
});

describe('buildDatecsReceipt — delivery fee line', () => {
  it('appends delivery as a sale line when fee > 0', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        totals: { subtotalRon: 51, deliveryFeeRon: 10, totalRon: 61 },
      }),
      paymentMethod: 'COD',
    });
    const deliveryLine = program.steps.find(
      (s) => s.kind === 'sale_line' && s.description === 'Livrare',
    );
    expect(deliveryLine).toBeDefined();
  });

  it('omits delivery line when fee = 0 (pickup)', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        totals: { subtotalRon: 51, deliveryFeeRon: 0, totalRon: 51 },
      }),
      paymentMethod: 'COD',
    });
    const deliveryLine = program.steps.find(
      (s) => s.kind === 'sale_line' && s.description === 'Livrare',
    );
    expect(deliveryLine).toBeUndefined();
  });
});

describe('buildDatecsReceipt — defensive empty cases', () => {
  it('returns empty steps if every line is 0-RON or negative', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [
          { name: 'Free taster', qty: 1, priceRon: 0 },
          { name: 'Refund stub', qty: 1, priceRon: -5 },
        ],
        totals: { subtotalRon: 0, deliveryFeeRon: 0, totalRon: 0 },
      }),
      paymentMethod: 'COD',
    });
    expect(program.steps).toHaveLength(0);
  });
});

describe('buildDatecsReceipt — notes handling', () => {
  it('splits long notes into ≤36-char chunks, capped at 4', () => {
    const longNote =
      'A foarte lungă notă pentru curier care depășește patruzeci de caractere și apoi încă o dată și încă o dată și încă o dată ar trebui să fie tăiată dincolo de patru chunks fiindcă ar fi prea mult';
    const program = buildDatecsReceipt({
      order: baseOrder({ notes: longNote }),
      paymentMethod: 'COD',
    });
    const noteLines = program.steps.filter(
      (s) => s.kind === 'free_text' && !s.text.startsWith('HIR #'),
    );
    expect(noteLines.length).toBeLessThanOrEqual(4);
    for (const line of noteLines) {
      if (line.kind === 'free_text') {
        expect(line.text.length).toBeLessThanOrEqual(36);
      }
    }
  });

  it('omits note lines when notes is null', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({ notes: null }),
      paymentMethod: 'COD',
    });
    const noteLines = program.steps.filter(
      (s) => s.kind === 'free_text' && !s.text.startsWith('HIR #'),
    );
    expect(noteLines).toHaveLength(0);
  });
});

describe('buildDatecsReceipt — operator/till overrides', () => {
  it('applies HIR defaults when operator/till not provided', () => {
    const program = buildDatecsReceipt({
      order: baseOrder(),
      paymentMethod: 'COD',
    });
    const open = findStep(program.steps, 'open_fiscal_receipt');
    expect(open?.operatorCode).toBe(1);
    expect(open?.operatorPassword).toBe('0000');
    expect(open?.tillNumber).toBe(1);
  });

  it('applies tenant overrides when provided', () => {
    const program = buildDatecsReceipt({
      order: baseOrder(),
      paymentMethod: 'COD',
      operatorCode: 7,
      operatorPassword: '4242',
      tillNumber: 2,
    });
    const open = findStep(program.steps, 'open_fiscal_receipt');
    expect(open?.operatorCode).toBe(7);
    expect(open?.operatorPassword).toBe('4242');
    expect(open?.tillNumber).toBe(2);
  });
});

describe('helpers', () => {
  it('roundRon clamps non-finite to 0', () => {
    expect(roundRon(Number.NaN)).toBe(0);
    expect(roundRon(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundRon(12.345)).toBe(12.35);
    expect(roundRon(12.344)).toBe(12.34);
  });

  it('sanitizeLine strips control chars and truncates to 36', () => {
    expect(sanitizeLine('Pizza\x00Margherita')).toBe('Pizza Margherita');
    const long = 'A'.repeat(50);
    expect(sanitizeLine(long).length).toBe(36);
  });

  it('sanitizeLine preserves RO diacritics', () => {
    expect(sanitizeLine('Șorici țăran și mămăligă')).toBe(
      'Șorici țăran și mămăligă',
    );
  });

  it('chunkLine breaks on word boundary when possible', () => {
    const out = chunkLine('alfa beta gama delta epsilon zeta', 12);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(12);
    // Joined back with space should equal original (stripped of extra spaces).
    expect(out.join(' ')).toBe('alfa beta gama delta epsilon zeta');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Codex round-2 P1 — line totals must reconcile against payment.
// Datecs firmware refuses `close` when the running line subtotal is
// not equal to the payment amount; without these tests the receipt
// silently aborts on every order that has priced modifiers or a promo.
// ─────────────────────────────────────────────────────────────────────

describe('buildDatecsReceipt — modifiers (lineTotalRon)', () => {
  it('uses lineTotalRon to derive unit price when modifiers carry a delta', () => {
    // Pizza 35 + extra cheese (mod) 5 = 40 unit. qty 2 -> lineTotal 80.
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [
          { name: 'Pizza Margherita', qty: 2, priceRon: 35, lineTotalRon: 80 },
        ],
        totals: { subtotalRon: 80, deliveryFeeRon: 0, totalRon: 80 },
      }),
      paymentMethod: 'COD',
    });
    const sale = findStep(program.steps, 'sale_line');
    expect(sale?.unitPriceRon).toBe(40);
    expect(sale?.quantity).toBe(2);
    // Payment must equal the running line total — no synthetic discount
    // line should be emitted because there is no promo.
    const discount = program.steps.find(
      (s) => s.kind === 'sale_line' && s.description === 'Reducere',
    );
    expect(discount).toBeUndefined();
  });

  it('falls back to priceRon when lineTotalRon is absent (legacy callers)', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [{ name: 'Coca-Cola 0.5L', qty: 2, priceRon: 8 }],
        totals: { subtotalRon: 16, deliveryFeeRon: 0, totalRon: 16 },
      }),
      paymentMethod: 'COD',
    });
    const sale = findStep(program.steps, 'sale_line');
    expect(sale?.unitPriceRon).toBe(8);
  });
});

describe('buildDatecsReceipt — promo discount reconciliation', () => {
  it('emits a synthetic negative-price "Reducere" line when totalRon < line sum + delivery', () => {
    // Two items 35 + 16 = 51 + delivery 10 = 61. Promo -10 -> total 51.
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [
          { name: 'Pizza Margherita', qty: 1, priceRon: 35, lineTotalRon: 35 },
          { name: 'Coca-Cola 0.5L', qty: 2, priceRon: 8, lineTotalRon: 16 },
        ],
        totals: { subtotalRon: 51, deliveryFeeRon: 10, totalRon: 51 },
      }),
      paymentMethod: 'COD',
    });
    const discount = program.steps.find(
      (s) => s.kind === 'sale_line' && s.description === 'Reducere',
    );
    expect(discount).toBeDefined();
    if (discount?.kind === 'sale_line') {
      expect(discount.unitPriceRon).toBe(-10);
      expect(discount.quantity).toBe(1);
    }
    const payment = findStep(program.steps, 'payment');
    expect(payment?.amountRon).toBe(51);
    // The reconciled running total = sum(positive lines) + delivery + discount.
    const lineSum = program.steps
      .filter((s): s is Extract<DatecsReceiptStep, { kind: 'sale_line' }> => s.kind === 'sale_line')
      .reduce((acc, s) => acc + s.unitPriceRon * s.quantity, 0);
    expect(Math.round(lineSum * 100) / 100).toBe(51);
  });

  it('orders the discount line AFTER the products + delivery and BEFORE subtotal', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [
          { name: 'Pizza Margherita', qty: 1, priceRon: 35, lineTotalRon: 35 },
        ],
        totals: { subtotalRon: 35, deliveryFeeRon: 10, totalRon: 40 },
      }),
      paymentMethod: 'CARD',
    });
    const kinds = program.steps.map((s) => s.kind);
    const subtotalIdx = kinds.indexOf('subtotal');
    // The "Reducere" sale_line must precede subtotal (it's part of the
    // running tally) and must be the LAST sale_line.
    const discountIdx = program.steps.findIndex(
      (s) => s.kind === 'sale_line' && s.description === 'Reducere',
    );
    expect(discountIdx).toBeGreaterThan(0);
    expect(discountIdx).toBeLessThan(subtotalIdx);
    const lastSaleIdx = kinds.lastIndexOf('sale_line');
    expect(lastSaleIdx).toBe(discountIdx);
  });

  it('does not emit a discount line when totals match exactly', () => {
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [
          { name: 'Pizza Margherita', qty: 1, priceRon: 35, lineTotalRon: 35 },
          { name: 'Coca-Cola 0.5L', qty: 2, priceRon: 8, lineTotalRon: 16 },
        ],
        totals: { subtotalRon: 51, deliveryFeeRon: 10, totalRon: 61 },
      }),
      paymentMethod: 'COD',
    });
    const discount = program.steps.find(
      (s) => s.kind === 'sale_line' && s.description === 'Reducere',
    );
    expect(discount).toBeUndefined();
  });

  it('reconciles modifier delta + promo together so payment = sum of emitted lines', () => {
    // Pizza base 35 + extra cheese 5 = unit 40, qty 2 -> lineTotal 80.
    // Cola base 8, qty 1 -> lineTotal 8. Subtotal lines 88.
    // Delivery 10. Total before promo 98. Promo -8 -> totalRon 90.
    const program = buildDatecsReceipt({
      order: baseOrder({
        items: [
          { name: 'Pizza Margherita', qty: 2, priceRon: 35, lineTotalRon: 80 },
          { name: 'Coca-Cola 0.5L', qty: 1, priceRon: 8, lineTotalRon: 8 },
        ],
        totals: { subtotalRon: 88, deliveryFeeRon: 10, totalRon: 90 },
      }),
      paymentMethod: 'CARD',
    });
    const lineSum = program.steps
      .filter((s): s is Extract<DatecsReceiptStep, { kind: 'sale_line' }> => s.kind === 'sale_line')
      .reduce((acc, s) => acc + s.unitPriceRon * s.quantity, 0);
    const payment = findStep(program.steps, 'payment');
    // The whole point of the fix: running line total must equal the
    // payment amount, otherwise Datecs firmware aborts the receipt.
    expect(Math.round(lineSum * 100) / 100).toBe(payment?.amountRon);
    expect(payment?.amountRon).toBe(90);
  });
});
