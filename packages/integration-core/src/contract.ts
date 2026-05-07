// HIR Restaurant Suite — Integration adapter contract.
// Every POS / external system that wants to talk to HIR implements this
// interface. The Mock adapter is the reference implementation; future
// vendor adapters (iiko, Freya, etc.) live alongside it in /adapters.

export type ProviderKey =
  | 'mock'
  | 'iiko'
  | 'smartcash'
  | 'freya'
  | 'posnet'
  | 'custom';

export type IntegrationMode =
  | 'STANDALONE'
  | 'POS_PUSH'
  | 'POS_PULL'
  | 'BIDIRECTIONAL';

export type OrderSource =
  | 'INTERNAL_STOREFRONT'
  | 'EXTERNAL_API'
  | 'POS_PUSH'
  | 'MANUAL_ADMIN';

export type AdapterContext = {
  tenantId: string;
  provider: {
    key: ProviderKey;
    config: Record<string, unknown>;
    webhookSecret: string;
  };
  fetch: typeof fetch;
  log: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
};

export type OrderPayload = {
  orderId: string;
  source: OrderSource;
  status: string;
  items: Array<{
    name: string;
    qty: number;
    /**
     * Base unit price (menu price BEFORE modifiers). Kept as a stable
     * field so existing adapters (mock/freya/iiko/posnet) keep working.
     */
    priceRon: number;
    /**
     * Optional final line total in RON: `roundRon(unitPriceWithModifiers
     * × qty)`. Producers (checkout/intent + bus hydration + admin
     * reprint action) populate this so adapters that need to print a
     * receipt where line subtotal must match payment (Datecs fiscal
     * printer) can avoid the modifier/promo skew. Adapters that don't
     * care can keep ignoring it.
     */
    lineTotalRon?: number;
    modifiers?: string[];
  }>;
  totals: {
    subtotalRon: number;
    deliveryFeeRon: number;
    totalRon: number;
  };
  customer: {
    firstName: string;
    phone: string;
  };
  dropoff: {
    line1: string;
    city: string;
    lat?: number;
    lng?: number;
  } | null;
  notes: string | null;
};

export type MenuItemPayload = {
  itemId: string;
  name: string;
  description: string | null;
  priceRon: number;
  isAvailable: boolean;
  categoryId: string;
};

export type OrderEventName = 'created' | 'status_changed' | 'cancelled';
export type MenuEventName = 'upserted' | 'availability_changed' | 'removed';

export type AdapterResult =
  | { ok: true }
  | { ok: false; retry: boolean; error: string };

export type WebhookEvent =
  | { kind: 'order.created'; payload: OrderPayload }
  | { kind: 'order.status_changed'; orderId: string; status: string }
  | null;

export interface IntegrationAdapter {
  readonly providerKey: ProviderKey;

  /** Mode B/C: HIR notifies the POS that an order was created/updated. */
  onOrderEvent(
    ctx: AdapterContext,
    event: OrderEventName,
    payload: OrderPayload,
  ): Promise<AdapterResult>;

  /** Mode C: HIR notifies the POS that a menu item changed. */
  onMenuEvent(
    ctx: AdapterContext,
    event: MenuEventName,
    payload: MenuItemPayload,
  ): Promise<AdapterResult>;

  /** Verify and parse an inbound webhook from the POS. */
  verifyWebhook(
    ctx: AdapterContext,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent>;
}
