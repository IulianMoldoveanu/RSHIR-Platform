// Datecs FiscalNet-2 receipt builder — pure helper, no I/O.
//
// Converts an HIR `OrderPayload` into an abstract sequence of fiscal
// commands ("DatecsReceiptProgram"). The companion-side driver
// (tools/datecs-companion) takes this program and frames each step
// into the FiscalNet-2 wire protocol (0x01 LEN SEQ CMD DATA 0x05 BCC
// 0x03) before writing it to the serial port.
//
// Why split:
// 1. The byte-level FiscalNet-2 BCC + sequencer is stateful per device
//    session — it MUST live next to the serial-port write loop.
// 2. The product-shape mapping (HIR order → fiscal lines + tax group +
//    totals) is pure data transformation — perfect to unit-test here.
// 3. A future HIR-side dispatcher (Phase 2 — RabbitMQ-style proxy that
//    talks to a tenant's local FPCom.dll instead of a tunnel) reuses
//    this same builder; only the framing layer changes.
//
// Reference: Datecs FP-700 / FP-2000 / FMP-350 / DP-50 protocol manual,
// FiscalNet-2 commands 0x30 (open fiscal receipt), 0x31 (PLU sale),
// 0x35 (subtotal), 0x38 (payment + close), 0x39 (close receipt).
// VAT groups: A=19% B=9% C=5% D=0% (RO mapping per Datecs RO firmware).
// HoReCa default in HIR = 11% TVA REDUSĂ (Legea 141/2025) — Datecs
// firmware in RO does NOT have an 11% group out of the box; tenant
// must reprogram VAT group "B" (default 9%) to 11% via Datecs service
// menu before first use. Documented in companion README.
//
// All amounts are RON, expressed as integer bani (×100) in the wire
// protocol. The builder rounds to 2 decimals defensively (the upstream
// price might be float math).
//
// Pure module — no `fs`, no `serialport`, no `crypto`. Safe to import
// from both Edge runtime and Node companion.

import type { OrderPayload } from '../contract';

/**
 * VAT group letter that HIR maps to. The companion translates this to
 * the firmware byte (A=0x41, B=0x42, etc.).
 *
 * Mapping rationale (RO HoReCa):
 *   - 'B' = "TVA redusă" (alimente preparate). Default in Datecs RO
 *     firmware is 9%; tenant reprograms to 11% per Legea 141/2025.
 *     This is the HIR HoReCa default.
 *   - 'A' = 19% (alcool, băuturi nealcoolice cu zahăr/îndulcitor).
 *   - 'D' = 0% (rare — neimpozabil).
 *
 * The single-VAT-group simplification: V1 maps every line to 'B'.
 * Mixed-VAT (alcool vs mâncare) lands in V2 once we have
 * `menu_items.vat_group` plumbed through.
 */
export type DatecsVatGroup = 'A' | 'B' | 'C' | 'D';

/**
 * One step in the fiscal receipt program. The companion executes
 * these in order; any non-OK response from the printer aborts the
 * receipt (firmware auto-voids the open receipt after timeout).
 */
export type DatecsReceiptStep =
  | {
      kind: 'open_fiscal_receipt';
      /** Cashier code programmed in printer (1..16). HIR default: 1. */
      operatorCode: number;
      /** Cashier password (4 digits). HIR default placeholder, tenant overrides via env. */
      operatorPassword: string;
      /** Printer "till" / station number. HIR default: 1. */
      tillNumber: number;
    }
  | {
      kind: 'sale_line';
      /** Article description, max 36 chars (FiscalNet-2 line width). */
      description: string;
      /** VAT group (A/B/C/D). */
      vat: DatecsVatGroup;
      /** Unit price in RON, rounded to 2 decimals. */
      unitPriceRon: number;
      /** Quantity (decimal allowed, e.g. 0.5 kg). */
      quantity: number;
    }
  | {
      kind: 'free_text';
      /** Comment line printed on receipt body, max 36 chars. */
      text: string;
    }
  | {
      kind: 'subtotal';
      /** Print subtotal on the receipt body. */
      print: boolean;
    }
  | {
      kind: 'payment';
      /**
       * Payment method:
       *  - 'cash' → tip 1 (numerar)
       *  - 'card' → tip 2 (card bancar)
       * COD orders => 'cash'; CARD orders (paid via PSP) => 'card'
       * (the receipt is courtesy print; ANAF e-Factura covers the
       * legal record via SmartBill push).
       */
      method: 'cash' | 'card';
      /** Amount paid in RON, rounded to 2 decimals. */
      amountRon: number;
    }
  | {
      kind: 'close_fiscal_receipt';
    };

export type DatecsReceiptProgram = {
  /** HIR order ID — echoed back in the companion log + ack. */
  orderId: string;
  /**
   * Synthetic timestamp the receipt was BUILT at (UTC ISO). The actual
   * fiscal timestamp is set by the printer's RTC at close time —
   * regulatory requirement.
   */
  builtAtIso: string;
  /** Sequence of fiscal commands to execute. */
  steps: DatecsReceiptStep[];
};

export type BuildReceiptInput = {
  order: OrderPayload;
  /**
   * Payment method derived from the order. HIR `restaurant_orders`
   * stores `payment_method` ('CARD' | 'COD' | null); the dispatcher
   * passes it explicitly so the receipt print stays in sync with the
   * SmartBill `isCash` toggle. Null → defaults to 'cash' (worst-case
   * regulatory: numerar is acceptable for any payment in RO).
   */
  paymentMethod: 'CARD' | 'COD' | null;
  /**
   * Operator/till from companion env. Defaults applied if absent.
   */
  operatorCode?: number;
  operatorPassword?: string;
  tillNumber?: number;
  /**
   * Default VAT group. V1 = 'B' (HoReCa redusă). Override per-tenant
   * in companion env if a tenant sells e.g. only alcohol (group A).
   */
  defaultVatGroup?: DatecsVatGroup;
};

const MAX_LINE_WIDTH = 36;
const DEFAULT_OPERATOR_CODE = 1;
const DEFAULT_OPERATOR_PASSWORD = '0000';
const DEFAULT_TILL = 1;
const DEFAULT_VAT: DatecsVatGroup = 'B';

/**
 * Round to 2 decimals (RON cents). Defensive — upstream subtotal can
 * be a float artifact like 12.500000001.
 */
export function roundRon(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Truncate + sanitize a description for the 36-char FiscalNet-2 line.
 * Strips control chars (printer firmware crashes on \x00..\x1f), keeps
 * RO diacritics (firmware supports CP1250 / RO codepage).
 */
export function sanitizeLine(s: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = String(s ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');
  const trimmed = stripped.trim();
  if (trimmed.length <= MAX_LINE_WIDTH) return trimmed;
  return trimmed.slice(0, MAX_LINE_WIDTH);
}

/**
 * Build the abstract fiscal program for an HIR order.
 *
 * Contract:
 *  - At least one sale line (refuses to print empty receipts — Datecs
 *    firmware rejects `close` on a 0.00-RON open receipt anyway).
 *  - Total payment = `order.totals.totalRon` (subtotal + delivery fee).
 *    Delivery fee is appended as a separate sale line so it appears
 *    on the customer-facing tape, matching SmartBill invoice rows.
 *  - Notes (≤ 36 chars per chunk) printed as free-text comments
 *    AFTER the last sale line. Long notes are split into 36-char
 *    chunks; we cap at 4 chunks to avoid runaway free-text on a
 *    typo'd order note.
 */
export function buildDatecsReceipt(input: BuildReceiptInput): DatecsReceiptProgram {
  const { order, paymentMethod } = input;
  const operatorCode = input.operatorCode ?? DEFAULT_OPERATOR_CODE;
  const operatorPassword = input.operatorPassword ?? DEFAULT_OPERATOR_PASSWORD;
  const tillNumber = input.tillNumber ?? DEFAULT_TILL;
  const vat: DatecsVatGroup = input.defaultVatGroup ?? DEFAULT_VAT;

  const steps: DatecsReceiptStep[] = [];

  steps.push({
    kind: 'open_fiscal_receipt',
    operatorCode,
    operatorPassword,
    tillNumber,
  });

  // Header free-text — short HIR brand line + order shortId so the
  // tenant can reconcile printed tape with HIR dashboard.
  steps.push({
    kind: 'free_text',
    text: sanitizeLine(`HIR #${order.orderId.slice(0, 8)}`),
  });

  // Sale lines — every product as one line.
  for (const item of order.items) {
    const qty = item.qty > 0 ? item.qty : 1;
    const unit = roundRon(item.priceRon);
    if (unit <= 0) {
      // 0-RON or negative items skipped — printer rejects 0-RON sales
      // on most RO firmware revisions. Keep the receipt clean.
      continue;
    }
    steps.push({
      kind: 'sale_line',
      description: sanitizeLine(item.name || 'Produs'),
      vat,
      unitPriceRon: unit,
      quantity: qty,
    });
  }

  // Delivery fee as its own sale line (only if > 0). Same VAT group
  // as food in V1 — RO HoReCa convention is to invoice delivery at
  // the same reduced rate as the meal.
  const deliveryFee = roundRon(order.totals.deliveryFeeRon);
  if (deliveryFee > 0) {
    steps.push({
      kind: 'sale_line',
      description: 'Livrare',
      vat,
      unitPriceRon: deliveryFee,
      quantity: 1,
    });
  }

  // Defensive: if no sale lines made it through (all 0-RON), skip
  // close + abort. Companion will receive an empty program and
  // refuse to send to printer.
  const hasSale = steps.some((s) => s.kind === 'sale_line');
  if (!hasSale) {
    return {
      orderId: order.orderId,
      builtAtIso: new Date().toISOString(),
      steps: [],
    };
  }

  // Free-text note (split in chunks of 36, cap 4 chunks).
  if (order.notes && order.notes.trim().length > 0) {
    const chunks = chunkLine(order.notes.trim(), MAX_LINE_WIDTH).slice(0, 4);
    for (const c of chunks) {
      steps.push({ kind: 'free_text', text: c });
    }
  }

  steps.push({ kind: 'subtotal', print: true });

  // Payment. COD => cash; CARD => card; null => cash (safe default).
  const method: 'cash' | 'card' = paymentMethod === 'CARD' ? 'card' : 'cash';
  steps.push({
    kind: 'payment',
    method,
    amountRon: roundRon(order.totals.totalRon),
  });

  steps.push({ kind: 'close_fiscal_receipt' });

  return {
    orderId: order.orderId,
    builtAtIso: new Date().toISOString(),
    steps,
  };
}

/**
 * Split a string into N-char chunks, breaking on word boundary when
 * possible. Used for free-text comment lines.
 */
export function chunkLine(s: string, width: number): string[] {
  const out: string[] = [];
  let rest = s.trim();
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < width / 2) cut = width; // hard cut if no good space
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}
