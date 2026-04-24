/**
 * Typed client for the HIR Delivery API (provided by pharmacy-saas-phase1's
 * NestJS public API: POST /public/v1/orders, etc.).
 *
 * Sprint 1: TYPE SIGNATURES ONLY. Implementations throw — Sprint 4 wires them up.
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
  baseUrl: string; // e.g. https://pharmacy-api-production-baa6.up.railway.app
  apiKey: string;  // tenant API key (TenantApiKey table on pharma-api)
};

const NOT_IMPLEMENTED = 'not implemented yet — Sprint 4 wires this to pharmacy-saas-phase1 public API';

/**
 * Returns a stub client whose methods throw. Sprint 4 will replace with the real fetch impl.
 */
export function createHirDeliveryClient(_config: HirDeliveryClientConfig): HirDeliveryClient {
  return {
    async createOrder(_input) {
      throw new Error(NOT_IMPLEMENTED);
    },
    async getOrderStatus(_id) {
      throw new Error(NOT_IMPLEMENTED);
    },
    async cancelOrder(_id, _reason) {
      throw new Error(NOT_IMPLEMENTED);
    },
  };
}
