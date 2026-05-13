// HIR Restaurant Suite — Aggregator (Glovo / Wolt / Bolt Food) adapter
// contract. The aggregator KDS unification flow has 3 separate tiers
// (see 2026-05-12-STRATEGIC-MEGA-PLAN.md §3b):
//
//   Tier 1 — Official APIs (Wolt Merchant API, Glovo Partner API, Bolt
//            Food Partner API). Long-term path. Wolt is documented +
//            self-serve. Glovo + Bolt require partnership approval.
//   Tier 2 — HIR Companion Android app reading aggregator app
//            notifications via NotificationListenerService.
//   Tier 3 — Print intercept via Star CloudPRNT / ESC-POS parser.
//            Lowest-cost, ship-first fallback.
//
// All three tiers normalize to the same `AggregatorOrderEvent` payload
// and write to the same `restaurant_orders` table via the order-ingest
// pipeline. The KDS UI does not need to know which tier delivered an
// order — only `source_type` (AGGREGATOR_WOLT / AGGREGATOR_GLOVO /
// AGGREGATOR_BOLT) and `source_subtype` (API / COMPANION / PRINT).
//
// Default-off: every adapter ships behind a per-tenant feature flag.
// Tier 1 adapters require credentials in tenants.settings.aggregator.<provider>.
// Tier 2 + 3 require the companion app / printer paired.

export type AggregatorProviderKey = 'wolt' | 'glovo' | 'bolt';

export type AggregatorSourceSubtype = 'API' | 'COMPANION' | 'PRINT';

/** Per-tenant credentials for a Tier 1 official API adapter. */
export type AggregatorCredentials = {
  provider: AggregatorProviderKey;
  /**
   * Provider's venue / store id for THIS tenant. Required for the
   * adapter to know which venue the inbound webhook belongs to.
   *   - Wolt: venue_id
   *   - Glovo: store_id (assigned at partnership onboarding)
   *   - Bolt:  store_id (assigned at partnership onboarding)
   */
  venueId: string;
  /**
   * Decrypted API key / secret loaded server-side from Vault.
   * Never echoed to merchant UI.
   *   - Wolt: M-2026 partner key
   *   - Glovo: partner OAuth client_secret + access token
   *   - Bolt: partner OAuth client_secret + access token
   */
  apiKey: string;
  /**
   * Webhook signing secret. Used to HMAC-verify inbound order events.
   * Provider-issued separately from `apiKey`.
   */
  webhookSecret: string;
  live: boolean;
};

/** Normalized payload that every adapter MUST produce. */
export type AggregatorOrderEvent = {
  /** Unique ID issued by the aggregator. Idempotency anchor. */
  providerOrderId: string;
  /** Stable ref for venue (so the ingest can resolve the tenant). */
  providerVenueId: string;
  /** Where this event originated. */
  source: { type: AggregatorProviderKey; subtype: AggregatorSourceSubtype };
  /** Aggregator-side state machine event we received. */
  kind:
    | 'order.placed'
    | 'order.accepted'
    | 'order.cancelled'
    | 'order.picked_up'
    | 'order.delivered';
  /** ISO-8601 timestamp from the provider. Falls back to `now` if absent. */
  occurredAt: string;
  /** Customer-facing info as exposed by the provider; missing fields are null. */
  customer: {
    firstName: string | null;
    phone: string | null;
  };
  /** Line items if the provider exposes them; empty array for events that don't carry items. */
  items: ReadonlyArray<{
    name: string;
    quantity: number;
    unitPriceBani: number | null;
    modifiers?: ReadonlyArray<{ name: string; quantity: number }>;
    notes?: string;
  }>;
  /** Money totals in bani. Null when the provider doesn't disclose. */
  totals: {
    grossBani: number | null;
    deliveryFeeBani: number | null;
    serviceFeeBani: number | null;
    tipBani: number | null;
  };
  /** Pickup/delivery instructions per provider. */
  delivery: {
    /** Address line if the provider reveals it; null for own-fleet pickups. */
    addressLine: string | null;
    /** Coords if exposed. */
    lat: number | null;
    lng: number | null;
    /** Promised delivery window (ISO). */
    promisedAt: string | null;
  };
  /** Raw payload so audit / debugging can inspect anything we didn't normalize. */
  rawPayload: Record<string, unknown>;
};

/** Optional per-adapter capabilities. Used by the UI to enable/disable controls. */
export type AggregatorCapabilities = {
  /** Can we call back into the aggregator to accept an order? */
  canAcceptOrder: boolean;
  /** Can we call back to reject/cancel? */
  canRejectOrder: boolean;
  /** Can we mark `picked_up` / `delivered` via the API? */
  canReportFulfillment: boolean;
  /** Does the provider issue webhook signatures we MUST verify? */
  hasSignedWebhooks: boolean;
};

/** Adapter contract. Every aggregator integration tier implements this. */
export type AggregatorAdapter = {
  readonly key: AggregatorProviderKey;
  readonly subtype: AggregatorSourceSubtype;
  readonly capabilities: AggregatorCapabilities;

  /**
   * Verify + parse an inbound webhook (Tier 1) or push event (Tier 2/3).
   * Returns the normalized event when valid. Returns null when signature
   * fails OR the event kind isn't one we map; the route should answer
   * 400 on null to NOT trigger provider retries on permanent failures.
   */
  verifyWebhook(
    ctx: AggregatorContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<AggregatorOrderEvent | null>;

  /**
   * Optional — only Tier 1 adapters with `canAcceptOrder = true` implement.
   * Notifies the provider that HIR has accepted the order on the tenant's
   * behalf. No-op for Tier 2/3 (they're passive observers).
   */
  acceptOrder?(
    ctx: AggregatorContext,
    creds: AggregatorCredentials,
    providerOrderId: string,
  ): Promise<{ ok: boolean; error?: string }>;

  /**
   * Optional — only Tier 1 with `canRejectOrder`.
   */
  rejectOrder?(
    ctx: AggregatorContext,
    creds: AggregatorCredentials,
    providerOrderId: string,
    reason: string,
  ): Promise<{ ok: boolean; error?: string }>;
};

/** Shared runtime context — same shape as the PSP contract for symmetry. */
export type AggregatorContext = {
  fetch: typeof fetch;
  log: (
    level: 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>,
  ) => void;
};
