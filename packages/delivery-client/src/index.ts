/**
 * Typed HTTP client for an external courier-dispatch service.
 *
 * The contract is intentionally vendor-neutral — the same interface served
 * pharmacy-saas-phase1's NestJS API (Sprint 1 stub) and now serves the new
 * RSHIR courier app. Each adapter just maps these fields to its own payload
 * shape on the wire.
 *
 * The HIR-side caller never sees vendor-specific details: it builds the
 * CreateDeliveryOrderInput and gets back a DeliveryOrder with a stable
 * `externalOrderId` echoed for correlation, plus the courier service's
 * own id + tracking token.
 */

export type DeliveryOrderItem = {
  name: string;
  quantity: number;
  unitPriceRon: number;
  notes?: string;
};

export type CreateDeliveryOrderInput = {
  externalOrderId: string;
  customer: { firstName: string; lastName: string; phone: string; email?: string };
  pickupAddress: {
    line1: string;
    city: string;
    postalCode?: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  dropoffAddress: {
    line1: string;
    city: string;
    postalCode?: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  items: DeliveryOrderItem[];
  totalRon: number;
  deliveryFeeRon: number;
  /** 'CARD' = paid online, 'COD' = courier collects cash. */
  paymentMethod?: 'CARD' | 'COD';
  notes?: string;
};

export type DeliveryOrderStatus =
  | 'CREATED'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export type DeliveryOrder = {
  id: string;
  externalOrderId: string;
  status: DeliveryOrderStatus;
  publicTrackToken: string;
  createdAt: string;
  updatedAt: string;
};

export interface HirDeliveryClient {
  createOrder(input: CreateDeliveryOrderInput): Promise<DeliveryOrder>;
  getOrderStatus(deliveryOrderId: string): Promise<DeliveryOrder>;
  cancelOrder(deliveryOrderId: string, reason?: string): Promise<DeliveryOrder>;
}

export type HirDeliveryClientConfig = {
  /** e.g. https://courier-beta-seven.vercel.app */
  baseUrl: string;
  /** Bearer token issued by the courier service to this restaurant tenant. */
  apiKey: string;
  /** Optional path prefix override; defaults to /api/external/orders. */
  pathPrefix?: string;
  /** Optional fetch implementation; defaults to global fetch (Node 18+). */
  fetch?: typeof fetch;
};

class DeliveryApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryApiError';
  }
}

export function createHirDeliveryClient(config: HirDeliveryClientConfig): HirDeliveryClient {
  if (!config.baseUrl) {
    throw new Error('createHirDeliveryClient: baseUrl is required');
  }
  if (!config.apiKey) {
    throw new Error('createHirDeliveryClient: apiKey is required');
  }
  const base = config.baseUrl.replace(/\/$/, '');
  const prefix = (config.pathPrefix ?? '/api/external/orders').replace(/\/$/, '');
  const f = config.fetch ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${base}${prefix}${path}`;
    const res = await f(url, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${config.apiKey}`,
        'user-agent': '@hir/delivery-client',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new DeliveryApiError(
        res.status,
        text,
        `delivery API ${method} ${url} failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  return {
    async createOrder(input) {
      return call<DeliveryOrder>('POST', '', input);
    },
    async getOrderStatus(deliveryOrderId) {
      return call<DeliveryOrder>('GET', `/${encodeURIComponent(deliveryOrderId)}`);
    },
    async cancelOrder(deliveryOrderId, reason) {
      return call<DeliveryOrder>('POST', `/${encodeURIComponent(deliveryOrderId)}/cancel`, {
        reason: reason ?? null,
      });
    },
  };
}

export { DeliveryApiError };
