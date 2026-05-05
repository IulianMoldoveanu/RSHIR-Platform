# POS Adapter Design Proposal — Y4

**Status:** Proposal — implementation deferred
**Owner:** rshir-coordinator (Iulian Moldoveanu)
**Created:** 2026-05-05
**Target start:** post-LIVE, after partner-support conversations with SmartCash + Otopos
**Distribution impact:** Signals POS integration is on the roadmap. Lets sales mention "POS-ready" to mid-tier restaurants. Commits zero code tonight.

---

## 1. Goal

Allow a HIR restaurant to push every confirmed order into its existing **POS / fiscal printer system** automatically, so kitchen tickets print and fiscal receipts are issued without the staff re-keying the order on the till.

Primary integration targets (Romanian market, in priority order):

1. **SmartCash** — dominant POS in Romanian HoReCa (estimated >40% of sit-down restaurants).
2. **Otopos** — common in cafés, fast-food, smaller chains.
3. **Generic** — a documented HTTP+HMAC contract a third-party developer or restaurant IT vendor can implement against.

## 2. Non-goals

- **Not** building a full POS replacement. HIR is order intake + delivery; the fiscal/inventory layer stays with the existing POS.
- **Not** synchronizing the menu *back* from POS to HIR (out of scope for v1; merchants edit menu in HIR).
- **Not** real-time stock decrement (POS already owns inventory).
- **Not** table-management sync with Y3 reservation feature (separate doc).
- **Not** offline / local-network bridge in v1 (cloud-to-cloud only; if POS has no public API, the merchant stays on manual until their POS vendor ships one).

---

## 3. Phased rollout

### P1 — Manual stub + routing (1-2 days, post-LIVE)

- Add `pos_provider` enum + `pos_config` jsonb on `tenant` (NULL = no POS, current behaviour).
- Admin UI: a "POS Integration" card with `provider = none | smartcash | otopos | custom_webhook` and a "Status: Coming soon" badge for non-`custom_webhook` values.
- `custom_webhook` works end-to-end: HIR POSTs every confirmed order to the URL the merchant provides, signed with HMAC-SHA256.
- No SmartCash/Otopos client yet — those slots return "Contactați-ne pentru activare".

This unblocks the **5% of Brașov pilot merchants who already have a custom webhook capability** (chain restaurants with internal IT) without any vendor dependency.

### P2 — First real adapter: SmartCash (1-2 weeks, after vendor doc lands)

- Implement `SmartCashAdapter implements POSAdapter`.
- Fields needed in `pos_config` (sketch — confirmed only after vendor call): `endpoint_url`, `api_key`, `location_id`, `cash_register_id`, `default_payment_method`, `vat_mapping` (HIR product category → SmartCash VAT class).
- Map HIR `Order` → SmartCash order schema. Print to the configured kitchen printer + fiscal receipt automatically.
- Test plan: parallel-run mode (HIR sends to SmartCash AND keeps the existing manual ticket flow for 1 week per pilot tenant) before flipping `pos_primary = true`.

### P3 — Generic framework + Otopos (after P2 validated)

- Refactor to `POSAdapter` registry pattern (see §5).
- Otopos as second concrete adapter — validates the abstraction.
- Public `docs/integrations/POS_WEBHOOK.md` so any POS vendor or restaurant IT can self-onboard.
- Optional: POS-side acknowledgement webhook (`order_printed`, `payment_settled`) flows back into HIR for delivery dispatch gating.

---

## 4. Schema sketch — NOT a migration

```sql
-- Illustrative only. Final shape decided at P1 implementation time.

CREATE TYPE pos_provider AS ENUM ('none', 'smartcash', 'otopos', 'custom_webhook');

ALTER TABLE tenant
  ADD COLUMN pos_provider pos_provider NOT NULL DEFAULT 'none',
  ADD COLUMN pos_config   jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN pos_enabled  boolean      NOT NULL DEFAULT false;

-- Outbound delivery log (idempotent retry, audit, debugging)
CREATE TABLE pos_dispatch_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  provider        pos_provider NOT NULL,
  attempt         int  NOT NULL DEFAULT 1,
  status          text NOT NULL CHECK (status IN ('pending','sent','acked','failed','skipped')),
  request_body    jsonb,
  response_body   jsonb,
  http_status     int,
  error_message   text,
  next_retry_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pos_dispatch_log_order ON pos_dispatch_log(order_id);
CREATE INDEX pos_dispatch_log_pending
  ON pos_dispatch_log(next_retry_at)
  WHERE status IN ('pending','failed');

-- RLS: PLATFORM_ADMIN + tenant OWNER read; service_role writes.
```

Open schema questions:

- Should `pos_config` secrets be encrypted at rest (pgcrypto / Supabase Vault) or rely on column-level RLS only? Lean toward Vault for `api_key`.
- Do we need a `pos_credential` table separate from `pos_config` for rotation history?

---

## 5. Adapter interface — TypeScript signature sketch

```ts
// packages/pos-adapter/src/types.ts (proposed package — does not exist yet)

export interface POSAdapter {
  /** Stable provider identifier matching the `pos_provider` enum. */
  readonly provider: 'smartcash' | 'otopos' | 'custom_webhook';

  /**
   * Validate the merchant-supplied config before persisting.
   * Throws POSConfigError with a translated RO message on invalid input.
   */
  validateConfig(config: unknown): Promise<ValidatedPOSConfig>;

  /**
   * Send a confirmed HIR order to the merchant's POS.
   * Must be idempotent — same orderId can be replayed safely.
   * Returns a dispatch record the caller persists into pos_dispatch_log.
   */
  dispatchOrder(input: {
    tenantId: string;
    order: HIROrder;       // typed from supabase-types
    config: ValidatedPOSConfig;
    idempotencyKey: string; // = `${tenantId}:${order.id}:${attempt}`
  }): Promise<POSDispatchResult>;

  /**
   * Optional health-check the admin UI calls when the merchant clicks
   * "Testează conexiunea". Should NOT print a real ticket.
   */
  ping?(config: ValidatedPOSConfig): Promise<POSPingResult>;
}

export type POSDispatchResult =
  | { status: 'sent';   externalOrderId: string; rawResponse: unknown }
  | { status: 'acked';  externalOrderId: string; rawResponse: unknown }
  | { status: 'failed'; retryable: boolean; error: string; rawResponse?: unknown };

// Registry — populated at module load
export const posAdapters: Record<string, POSAdapter> = {};
```

Open interface questions:

- Sync (await `dispatchOrder`) or queue (push to a Supabase Edge Function that polls)? Lean toward **queued** so a slow POS doesn't block order confirmation — same pattern as the existing courier dispatch.
- Should the order confirmation in HIR block on `pos.acked` or fire-and-forget? Default fire-and-forget; staff sees a yellow banner if dispatch fails after N retries.

---

## 6. Webhook contract sketch (HMAC-signed) — `custom_webhook` provider

When `pos_provider = custom_webhook`, HIR POSTs to the merchant's URL on every order state change worth printing.

```
POST {merchant.pos_config.webhook_url}
Content-Type: application/json
X-HIR-Event: order.confirmed
X-HIR-Tenant: {tenant_slug}
X-HIR-Delivery: {uuid}
X-HIR-Timestamp: {unix_seconds}
X-HIR-Signature: sha256={hex_hmac}

{
  "event": "order.confirmed",
  "tenant_id": "uuid",
  "order": {
    "id": "uuid",
    "external_number": "HIR-2026-001234",
    "placed_at": "2026-05-05T18:42:11Z",
    "fulfillment": "delivery" | "pickup" | "dine_in",
    "customer": { "name": "...", "phone": "+40...", "address": "..." },
    "items": [
      { "sku": "MENU-001", "name": "Ciorbă de burtă", "qty": 2,
        "unit_price_minor": 2500, "vat_rate": 9, "modifiers": [] }
    ],
    "totals": { "subtotal_minor": 5000, "delivery_minor": 1000,
                "total_minor": 6000, "currency": "RON" },
    "payment": { "method": "card_online" | "cash_on_delivery", "captured": true },
    "notes": "fără ardei"
  }
}
```

- Signature: `HMAC-SHA256(tenant.pos_config.signing_secret, "{timestamp}.{raw_body}")`, hex-encoded.
- Timestamp window: ±5 min, replay-protected via `X-HIR-Delivery` UUID.
- Retry policy: exponential backoff, 6 attempts over ~30 min, then `status='failed'` and Telegram alert to merchant operator.
- Events: `order.confirmed`, `order.cancelled`, `order.refunded` (no `order.created` — POS only cares once confirmed).

This contract is **the same shape we already use for `courier-mirror-pharma`** — reuses code in the Edge Function layer.

---

## 7. Open questions for partner-support calls

Iulian to ask SmartCash + Otopos in the post-LIVE conversations:

**SmartCash**
- Public REST or SOAP API? Authentication mechanism (API key, OAuth, basic)?
- Sandbox / staging environment URL?
- Order schema docs — do they support our `items[].modifiers` shape? VAT classes?
- Does "create order from external source" emit a kitchen ticket + fiscal receipt automatically, or do we need a second call?
- Idempotency: do they accept a client-side `Idempotency-Key` header?
- Rate limits per location?
- Any cost / partner-program / certification process?

**Otopos**
- Do they have a public API, or is it custom-per-deployment?
- Sync POST or async queue?
- Webhook back to us on print confirmation?
- VAT mapping — fixed list or merchant-configurable?

**Generic**
- Is there an industry standard worth aligning to (e.g. **OpenAPI POS Working Group**, Square / Toast formats)? Cheaper to copy than invent.

---

## 8. Manual partner-support email template (RO)

> **Subiect:** Integrare HIR — platformă de comenzi online + livrări pentru restaurante (parteneriat tehnic)
>
> Bună ziua,
>
> Sunt Iulian Moldoveanu, fondator HIR Restaurant Suite — o platformă românească de comenzi online + livrări proprii pentru restaurante (alternativă la Wolt/Glovo, cu comision fix de 3 RON / livrare în loc de 25-30%).
>
> Avem deja restaurante pilot în Brașov care folosesc {SmartCash | Otopos} și care ne cer integrare automată: comanda primită online să apară direct pe bonul de bucătărie + bonul fiscal, fără să fie reintrodusă manual pe casa de marcat.
>
> V-aș ruga, dacă există posibilitatea, să ne confirmați:
>
> 1. Există o documentație publică a API-ului {SmartCash | Otopos} pentru creare comenzi din surse externe?
> 2. Aveți un mediu de **sandbox / staging** pentru testare?
> 3. Care este procesul de **certificare / partener tehnic** pe care îl recomandați?
> 4. Există un cost pentru integrare (per locație / per tranzacție / one-off)?
>
> Volumul estimat în primele 6 luni: 20-50 restaurante, ~2000-5000 comenzi/zi cumulat.
>
> Aș fi recunoscător pentru un call de 30 de minute cu echipa tehnică, oricând în următoarele 2 săptămâni.
>
> Cu mulțumiri,
> Iulian Moldoveanu
> Fondator, HIR Restaurant Suite
> {telefon} · iulianm698@gmail.com · hir.delivery (TBD)

---

## 9. Risk analysis — why we are NOT building tonight

1. **Pre-launch window (~2h to LIVE).** Any code shipped tonight that touches order confirmation flow is a regression risk for the Brașov pilot. POS dispatch is *exactly* in the order-confirmation hot path.
2. **No real vendor docs.** Building a SmartCash adapter against guessed schema = guaranteed rework. We need the partner-support call first.
3. **No real merchant ask yet.** None of the 3 Brașov pilot restaurants has asked for POS integration as a blocker. Building before signal = wasted bandwidth that should be on reseller acquisition (per HIR-ACTION-PLAN-2026 distribution-first principle).
4. **Vendor relationship leverage.** SmartCash / Otopos are far more cooperative if we approach them with "here's our merchant pipeline, want to be our default POS partner?" than "here's our half-built integration, please review". Selling first, building second.
5. **Schema irreversibility.** Even an additive `pos_provider` enum is a schema commitment. If we discover post-call that the right model is *event-sourced* rather than per-tenant config, we'd regret the enum. Better to design after one real vendor conversation.

**What we ship tonight instead:** this document + a "POS integration coming soon" badge on the Settings page is fine to defer to a 5-line follow-up PR after LIVE — not blocking.

---

## 10. Decision log

| Date       | Decision                                                                 | Source                          |
|------------|--------------------------------------------------------------------------|---------------------------------|
| 2026-05-05 | Defer Y4 implementation until after LIVE + vendor partner-support calls. | Iulian, Lane Y4-DOC directive   |
| 2026-05-05 | P1 stub starts with `custom_webhook` only — no vendor dependency.        | Same                            |
| 2026-05-05 | Reuse `courier-mirror-pharma` HMAC contract shape for consistency.       | Chief, this doc §6              |

---

*This is a design proposal. No schema, no migration, no code, no Edge Function, no admin UI is being shipped with this PR. Implementation resumes only after Iulian's 30-min calls with SmartCash + Otopos partner support.*
