import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@hir/supabase-types';
import {
  coercePolygon,
  haversineKm,
  pointInPolygon,
  tenantLocationFromSettings,
  type LatLng,
} from '@/lib/zones';
import type { CartItemInput, AddressInput } from './schemas';

export type PricedLineItem = {
  itemId: string;
  name: string;
  priceRon: number;
  quantity: number;
  lineTotalRon: number;
};

export type Quote = {
  lineItems: PricedLineItem[];
  subtotalRon: number;
  deliveryFeeRon: number;
  totalRon: number;
  distanceKm: number;
  zoneId: string;
  tierId: string;
};

export type QuoteFailure =
  | { kind: 'OUTSIDE_ZONE' }
  | { kind: 'NO_TIER'; distanceKm: number }
  | { kind: 'ITEM_UNAVAILABLE'; itemId: string }
  | { kind: 'EMPTY_MENU' };

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reason: QuoteFailure };

export type TenantContext = {
  id: string;
  slug: string;
  settings: unknown;
};

/**
 * Recomputes the order quote from authoritative DB state.
 * NEVER trusts client-supplied prices.
 *
 * Steps:
 *   1. Load menu items by ID (must all belong to tenant + be available).
 *   2. Validate dropoff is inside an active delivery zone.
 *   3. Compute haversine distance from tenant pickup → dropoff.
 *   4. Pick the matching pricing tier (min_km ≤ d < max_km).
 */
export async function computeQuote(
  admin: SupabaseClient<Database>,
  tenant: TenantContext,
  cart: CartItemInput[],
  address: AddressInput,
): Promise<QuoteResult> {
  const { data: items, error: itemsErr } = await admin
    .from('restaurant_menu_items')
    .select('id, name, price_ron, is_available, tenant_id')
    .in('id', cart.map((c) => c.itemId))
    .eq('tenant_id', tenant.id);

  if (itemsErr) throw new Error(`menu lookup failed: ${itemsErr.message}`);
  if (!items || items.length === 0) return { ok: false, reason: { kind: 'EMPTY_MENU' } };

  const byId = new Map(items.map((it) => [it.id, it]));
  const lineItems: PricedLineItem[] = [];

  for (const c of cart) {
    const item = byId.get(c.itemId);
    if (!item || !item.is_available) {
      return { ok: false, reason: { kind: 'ITEM_UNAVAILABLE', itemId: c.itemId } };
    }
    const lineTotal = round2(item.price_ron * c.quantity);
    lineItems.push({
      itemId: item.id,
      name: item.name,
      priceRon: item.price_ron,
      quantity: c.quantity,
      lineTotalRon: lineTotal,
    });
  }

  const subtotalRon = round2(lineItems.reduce((s, li) => s + li.lineTotalRon, 0));

  const dropoff: LatLng = { lat: address.lat, lng: address.lng };
  const zoneId = await findEnclosingZoneId(admin, tenant.id, dropoff);
  if (!zoneId) return { ok: false, reason: { kind: 'OUTSIDE_ZONE' } };

  const pickup = tenantLocationFromSettings(tenant.slug, tenant.settings);
  const distanceKm = haversineKm(pickup, dropoff);

  const tier = await findTierForDistance(admin, tenant.id, distanceKm);
  if (!tier) return { ok: false, reason: { kind: 'NO_TIER', distanceKm } };

  const deliveryFeeRon = round2(tier.price_ron);
  const totalRon = round2(subtotalRon + deliveryFeeRon);

  return {
    ok: true,
    quote: {
      lineItems,
      subtotalRon,
      deliveryFeeRon,
      totalRon,
      distanceKm: Math.round(distanceKm * 100) / 100,
      zoneId,
      tierId: tier.id,
    },
  };
}

async function findEnclosingZoneId(
  admin: SupabaseClient<Database>,
  tenantId: string,
  point: LatLng,
): Promise<string | null> {
  const { data: zones, error } = await admin
    .from('delivery_zones')
    .select('id, polygon, sort_order, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`zones lookup failed: ${error.message}`);
  if (!zones) return null;

  for (const z of zones) {
    if (pointInPolygon(point, coercePolygon(z.polygon))) return z.id;
  }
  return null;
}

async function findTierForDistance(
  admin: SupabaseClient<Database>,
  tenantId: string,
  distanceKm: number,
): Promise<{ id: string; price_ron: number } | null> {
  const { data: tiers, error } = await admin
    .from('delivery_pricing_tiers')
    .select('id, min_km, max_km, price_ron, sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`tiers lookup failed: ${error.message}`);
  if (!tiers) return null;

  for (const t of tiers) {
    if (distanceKm >= t.min_km && distanceKm < t.max_km) {
      return { id: t.id, price_ron: t.price_ron };
    }
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
