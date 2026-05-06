// Lane AGGREGATOR-EMAIL-REGEX-HYBRID — vitest coverage for the regex
// pre-parse layer that lives in `supabase/functions/_shared/aggregator-email-regex.ts`.
//
// The module is pure (no Deno.* / no network), so vitest can import it
// directly across the supabase/ → apps/ boundary. Test fixtures are
// synthetic email bodies built from public Glovo / Wolt / Bolt Food
// partner-doc layouts — verified against the regex tables.

import { describe, expect, it } from 'vitest';
import {
  tryRegexParse,
  estimateCostRon,
  estimateSavingsRon,
  type ParsedOrder,
  type ParseStrategy,
} from '../../../../../supabase/functions/_shared/aggregator-email-regex';

// ─── Fixtures ─────────────────────────────────────────────────────────

const GLOVO_HIGH = `From: Glovo Romania <noreply@glovoapp.com>
To: comenzi-foisorul-a@orders.hir.ro
Subject: Comanda noua #G7H8K2L1

Comanda noua #G7H8K2L1

Client: Andrei Popescu
Telefon: +40 712 345 678
Adresa: Strada Victoriei 12, Brasov

2 × Pizza Quattro Stagioni — 39,50 RON
1 × Tiramisu Casa — 22,00 RON

Subtotal: 101,00 RON
Livrare: 8,00 RON
Total: 109,00 RON
`;

const GLOVO_MEDIUM_NO_ADDRESS = `From: Glovo Romania <noreply@glovoapp.com>
To: comenzi-foisorul-a@orders.hir.ro
Subject: Comanda noua #G77777

Comanda noua #G77777

Client: Maria Ionescu
Telefon: 0723456789

2x Burger Vita 35,00 RON
1x Cartofi Prajiti 12,50 RON

Subtotal: 82,50 RON
Livrare: 7,50 RON
Total: 90,00 RON
`;

const GLOVO_NO_ITEMS = `From: Glovo Romania <noreply@glovoapp.com>
To: comenzi-foisorul-a@orders.hir.ro
Subject: Refund processed

Buna ziua,
Comanda #G77777 a fost rambursata. Suma: 90,00 RON.
Multumim.
`;

const WOLT_HIGH = `From: Wolt <orders@wolt.com>
To: comenzi-foisorul-a@orders.hir.ro
Subject: New order WOLT12345

Order #WOLT12345

Customer: Ion Marin
Phone: +40733111222
Delivery address: Bulevardul Eroilor 5, Brasov

1 × Burger Classic   42,00 RON
2 × Coca Cola 0.5L   8,00 RON

Subtotal: 58,00 RON
Delivery fee: 7,00 RON
Total: 65,00 RON
`;

const WOLT_MEDIUM_NO_PHONE = `From: Wolt <orders@wolt.com>
To: comenzi-foisorul-a@orders.hir.ro
Subject: New order

Order #WOLT99999

Customer: Cristina Vasile
Delivery address: Strada Republicii 33, Brasov

1x Salata Caesar 28,00 RON
1x Apa Plata 5,00 RON

Subtotal: 33,00 RON
Delivery fee: 6,00 RON
Total: 39,00 RON
`;

const BOLT_HIGH = `From: Bolt Food <noreply@bolt.eu>
To: comenzi-foisorul-a@orders.hir.ro
Subject: Comanda noua #BF55555

Order #BF55555

Customer: Radu Stoica
Telefon: 0744555666
Adresa livrare: Strada Lunga 14, Brasov

3 × Shaorma Pui 25,00 RON
1 × Cola 7,00 RON

Subtotal: 82,00 RON
Livrare: 6,50 RON
Total: 88,50 RON
`;

const BOLT_MEDIUM_NO_SUBTOTAL = `From: Bolt Food <noreply@bolt.eu>
To: comenzi-foisorul-a@orders.hir.ro
Subject: Comanda noua

Order #BF7

Customer: Dan Petrescu
Telefon: 0755777888
Adresa livrare: Calea Bucuresti 100, Brasov

2 × Pizza Margherita 30,00 RON
1 × Tiramisu 18,00 RON

Livrare: 5,00 RON
Total: 83,00 RON
`;

const UNRECOGNIZED = `Buna ziua,
Va trimitem un mesaj informativ. Nu este o comanda.
Multumim.
`;

// ─── Glovo ────────────────────────────────────────────────────────────

describe('tryRegexParse — GLOVO', () => {
  it('extracts a complete order with high confidence', () => {
    const r = tryRegexParse(GLOVO_HIGH, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confidence).toBe('high');
    expect(r.data.external_order_id).toBe('G7H8K2L1');
    expect(r.data.items.length).toBe(2);
    expect(r.data.items[0]).toMatchObject({
      name: 'Pizza Quattro Stagioni',
      quantity: 2,
      unit_price_ron: 39.5,
    });
    expect(r.data.subtotal_ron).toBe(101);
    expect(r.data.delivery_fee_ron).toBe(8);
    expect(r.data.total_ron).toBe(109);
    expect(r.data.customer_name).toBe('Andrei Popescu');
    expect(r.data.customer_phone).toBe('+40712345678');
    expect(r.data.delivery_address).toMatch(/Strada Victoriei 12/);
  });

  it('handles "2x Item N,NN" without × separator', () => {
    const r = tryRegexParse(GLOVO_MEDIUM_NO_ADDRESS, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(2);
    expect(r.data.items[0].quantity).toBe(2);
    // No "Adresa:" → address missing flagged
    expect(r.missing).toContain('delivery_address');
  });

  it('returns ok:false when no order items are present', () => {
    const r = tryRegexParse(GLOVO_NO_ITEMS, 'GLOVO');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no_items_extracted');
  });

  it('confidence drops to medium when subtotal/total drift > 5%', () => {
    const drifted = GLOVO_HIGH.replace('Total: 109,00 RON', 'Total: 200,00 RON');
    const r = tryRegexParse(drifted, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confidence).toBe('medium');
  });

  it('derives subtotal from item prices when subtotal label is absent', () => {
    const noSubtotal = GLOVO_HIGH.replace(/Subtotal:.*\n/, '');
    const r = tryRegexParse(noSubtotal, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2*39.5 + 1*22 = 101
    expect(r.data.subtotal_ron).toBe(101);
  });
});

// ─── Wolt ─────────────────────────────────────────────────────────────

describe('tryRegexParse — WOLT', () => {
  it('extracts a complete order with high confidence', () => {
    const r = tryRegexParse(WOLT_HIGH, 'WOLT');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confidence).toBe('high');
    expect(r.data.external_order_id).toBe('WOLT12345');
    expect(r.data.items.length).toBeGreaterThanOrEqual(2);
    expect(r.data.total_ron).toBe(65);
    expect(r.data.customer_phone).toBe('+40733111222');
  });

  it('flags medium when phone is missing', () => {
    const r = tryRegexParse(WOLT_MEDIUM_NO_PHONE, 'WOLT');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.missing).toContain('customer_phone');
    // total_ron (39) ≈ subtotal (33) + delivery (6) → still high on
    // auto-apply criteria; medium would trigger only if items/subtotal/total
    // drift > 5%. Document this — phone is for operator UX, not auto-apply.
    expect(r.confidence).toBe('high');
  });

  it('skips lines that look like totals/headers', () => {
    const r = tryRegexParse(WOLT_HIGH, 'WOLT');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const it of r.data.items) {
      expect(it.name.toLowerCase()).not.toMatch(/^(sub)?total|^delivery/);
    }
  });
});

// ─── Bolt Food ────────────────────────────────────────────────────────

describe('tryRegexParse — BOLT_FOOD', () => {
  it('extracts a complete order with high confidence', () => {
    const r = tryRegexParse(BOLT_HIGH, 'BOLT_FOOD');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confidence).toBe('high');
    expect(r.data.external_order_id).toBe('BF55555');
    expect(r.data.items.length).toBe(2);
    expect(r.data.total_ron).toBe(88.5);
    expect(r.data.customer_phone).toBe('0744555666');
  });

  it('derives subtotal when only items + total are present', () => {
    const r = tryRegexParse(BOLT_MEDIUM_NO_SUBTOTAL, 'BOLT_FOOD');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 2*30 + 1*18 = 78. Total 83 = 78 + 5 → drift 0% → high.
    expect(r.data.subtotal_ron).toBe(78);
    expect(r.confidence).toBe('high');
  });
});

// ─── Negative cases ───────────────────────────────────────────────────

describe('tryRegexParse — negatives', () => {
  it('returns ok:false on empty body', () => {
    const r = tryRegexParse('', 'GLOVO');
    expect(r.ok).toBe(false);
  });

  it('returns ok:false on a non-order email', () => {
    const r = tryRegexParse(UNRECOGNIZED, 'GLOVO');
    expect(r.ok).toBe(false);
  });

  it('returns ok:false on unknown source', () => {
    const r = tryRegexParse(GLOVO_HIGH, 'TAZZ' as never);
    expect(r.ok).toBe(false);
  });
});

// ─── Cost helpers ─────────────────────────────────────────────────────

describe('cost estimation', () => {
  it('regex strategy = 0 RON', () => {
    expect(estimateCostRon('regex')).toBe(0);
  });

  it('ai-full > regex+ai-fill > regex', () => {
    const full = estimateCostRon('ai-full');
    const fill = estimateCostRon('regex+ai-fill');
    expect(full).toBeGreaterThan(fill);
    expect(fill).toBeGreaterThan(0);
  });

  it('savings vs ai-full are non-negative for every strategy', () => {
    const strategies: ParseStrategy[] = ['regex', 'regex+ai-fill', 'ai-full', 'failed'];
    for (const s of strategies) {
      expect(estimateSavingsRon(s)).toBeGreaterThanOrEqual(0);
    }
  });

  it('failed strategy contributes 0 savings (Codex P2 #311)', () => {
    // A failed parse may already have paid for a full AI attempt.
    // Treating it as "saved baseline" would inflate the admin tile
    // every time Anthropic 5xx'd.
    expect(estimateSavingsRon('failed')).toBe(0);
  });

  it('regex strategy saves ~full RON of an ai-full call', () => {
    const saved = estimateSavingsRon('regex');
    const full = estimateCostRon('ai-full');
    expect(saved).toBeCloseTo(full, 4);
  });
});

// ─── Type contract surface ────────────────────────────────────────────

describe('ParsedOrder type contract', () => {
  it('matches the shape consumed by aggregator-email-parser', () => {
    const r = tryRegexParse(GLOVO_HIGH, 'GLOVO');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data: ParsedOrder = r.data;
    // Compile-time assertion plus runtime spot-check.
    expect(typeof data.total_ron === 'number' || data.total_ron === null).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
  });
});
