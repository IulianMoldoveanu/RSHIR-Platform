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
import type { CartItemInput, AddressInput, Fulfillment } from './schemas';
import { lookupAndValidatePromo, type PromoKind, type PromoLookupFailure } from './promo';

export type PricedModifier = {
  id: string;
  name: string;
  priceDeltaRon: number;
};

export type PricedLineItem = {
  itemId: string;
  name: string;
  priceRon: number;
  quantity: number;
  lineTotalRon: number;
  modifiers: PricedModifier[];
};

export type AppliedPromo = {
  id: string;
  code: string;
  kind: PromoKind;
  valueInt: number;
};

export type Quote = {
  lineItems: PricedLineItem[];
  subtotalRon: number;
  deliveryFeeRon: number;
  discountRon: number;
  totalRon: number;
  fulfillment: Fulfillment;
  distanceKm: number;
  zoneId: string | null;
  tierId: string | null;
  promo: AppliedPromo | null;
};

export type QuoteFailure =
  | { kind: 'OUTSIDE_ZONE' }
  | { kind: 'NO_TIER'; distanceKm: number }
  | { kind: 'ITEM_UNAVAILABLE'; itemId: string }
  | { kind: 'EMPTY_MENU' }
  | { kind: 'PROMO_INVALID'; reason: PromoLookupFailure }
  | { kind: 'GROUP_CONSTRAINT'; itemId: string; groupName: string; reason: 'too_few' | 'too_many' };

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
  address: AddressInput | null,
  fulfillment: Fulfillment = 'DELIVERY',
  promoCode: string | null = null,
): Promise<QuoteResult> {
  const { data: items, error: itemsErr } = await admin
    .from('restaurant_menu_items')
    .select('id, name, price_ron, is_available, sold_out_until, tenant_id')
    .in('id', cart.map((c) => c.itemId))
    .eq('tenant_id', tenant.id);

  if (itemsErr) throw new Error(`menu lookup failed: ${itemsErr.message}`);
  if (!items || items.length === 0) return { ok: false, reason: { kind: 'EMPTY_MENU' } };

  // Resolve any client-supplied modifier ids in one round-trip. Server is
  // authoritative on price_delta_ron — we never trust the client value. We
  // also enforce that each modifier belongs to the item it was attached to
  // (no swapping a $0 modifier id from item A onto item B).
  const allModifierIds = Array.from(
    new Set(cart.flatMap((c) => c.modifierIds ?? [])),
  );
  type ModifierRow = {
    id: string;
    item_id: string;
    name: string;
    price_delta_ron: number;
    group_id: string | null;
  };
  const modifiersById = new Map<string, ModifierRow>();
  if (allModifierIds.length > 0) {
    // Try to include group_id (post-migration 20260505_001). If the column
    // doesn't exist yet, fall back to the legacy SELECT and treat all
    // modifiers as ungrouped (group_id null) — group constraints are
    // unenforceable but ungrouped modifiers still validate item-ownership.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (admin
      .from('restaurant_menu_modifiers')
      .select('id, item_id, name, price_delta_ron, group_id') as any)
      .in('id', allModifierIds);
    if (r.error && /group_id/i.test(r.error.message ?? '')) {
      const legacy = await admin
        .from('restaurant_menu_modifiers')
        .select('id, item_id, name, price_delta_ron')
        .in('id', allModifierIds);
      if (legacy.error) throw new Error(`modifier lookup failed: ${legacy.error.message}`);
      for (const m of (legacy.data ?? []) as Array<Omit<ModifierRow, 'group_id'>>) {
        modifiersById.set(m.id, { ...m, group_id: null });
      }
    } else if (r.error) {
      throw new Error(`modifier lookup failed: ${r.error.message}`);
    } else {
      for (const m of (r.data ?? []) as ModifierRow[]) modifiersById.set(m.id, m);
    }
  }

  // Pull every modifier group attached to ANY item in the cart so we can
  // validate min/max per group. Defensive on table existence.
  const itemIdsInCart = Array.from(new Set(cart.map((c) => c.itemId)));
  type GroupRow = {
    id: string;
    item_id: string;
    name: string;
    select_min: number;
    select_max: number | null;
  };
  const groupsByItem = new Map<string, GroupRow[]>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = await (admin as any)
      .from('restaurant_menu_modifier_groups')
      .select('id, item_id, name, select_min, select_max')
      .in('item_id', itemIdsInCart);
    if (!g.error && Array.isArray(g.data)) {
      for (const grp of g.data as GroupRow[]) {
        const arr = groupsByItem.get(grp.item_id) ?? [];
        arr.push(grp);
        groupsByItem.set(grp.item_id, arr);
      }
    }
  } catch {
    // table not yet shipped — group constraints can't be enforced.
  }

  const nowMs = Date.now();
  const byId = new Map(items.map((it) => [it.id, it]));
  const lineItems: PricedLineItem[] = [];

  for (const c of cart) {
    const item = byId.get(c.itemId);
    const soldOut = !!item?.sold_out_until && new Date(item.sold_out_until).getTime() > nowMs;
    if (!item || !item.is_available || soldOut) {
      return { ok: false, reason: { kind: 'ITEM_UNAVAILABLE', itemId: c.itemId } };
    }
    const pricedMods: PricedModifier[] = [];
    // Tally selected count per group_id for constraint validation.
    const selectedByGroup = new Map<string, number>();
    for (const modId of c.modifierIds ?? []) {
      const m = modifiersById.get(modId);
      if (!m || m.item_id !== item.id) {
        return { ok: false, reason: { kind: 'ITEM_UNAVAILABLE', itemId: c.itemId } };
      }
      if (m.group_id) {
        selectedByGroup.set(m.group_id, (selectedByGroup.get(m.group_id) ?? 0) + 1);
      }
      pricedMods.push({ id: m.id, name: m.name, priceDeltaRon: m.price_delta_ron });
    }
    // Group min/max enforcement: every group attached to this item must be
    // within [select_min, select_max ?? Infinity].
    for (const grp of groupsByItem.get(item.id) ?? []) {
      const count = selectedByGroup.get(grp.id) ?? 0;
      if (count < grp.select_min) {
        return {
          ok: false,
          reason: { kind: 'GROUP_CONSTRAINT', itemId: item.id, groupName: grp.name, reason: 'too_few' },
        };
      }
      if (grp.select_max !== null && count > grp.select_max) {
        return {
          ok: false,
          reason: { kind: 'GROUP_CONSTRAINT', itemId: item.id, groupName: grp.name, reason: 'too_many' },
        };
      }
    }
    const modSum = pricedMods.reduce((s, m) => s + m.priceDeltaRon, 0);
    const unitPrice = round2(item.price_ron + modSum);
    const lineTotal = round2(unitPrice * c.quantity);
    lineItems.push({
      itemId: item.id,
      name: item.name,
      priceRon: item.price_ron,
      quantity: c.quantity,
      lineTotalRon: lineTotal,
      modifiers: pricedMods,
    });
  }

  const subtotalRon = round2(lineItems.reduce((s, li) => s + li.lineTotalRon, 0));

  if (fulfillment === 'PICKUP') {
    const promoApplied = await applyPromo(admin, tenant.id, promoCode, subtotalRon, 0);
    if (!promoApplied.ok) return { ok: false, reason: promoApplied.reason };
    return {
      ok: true,
      quote: {
        lineItems,
        subtotalRon,
        deliveryFeeRon: 0,
        discountRon: promoApplied.discountRon,
        totalRon: round2(Math.max(0, subtotalRon - promoApplied.discountRon)),
        fulfillment: 'PICKUP',
        distanceKm: 0,
        zoneId: null,
        tierId: null,
        promo: promoApplied.promo,
      },
    };
  }

  if (!address) return { ok: false, reason: { kind: 'OUTSIDE_ZONE' } };

  const dropoff: LatLng = { lat: address.lat, lng: address.lng };
  const zoneId = await findEnclosingZoneId(admin, tenant.id, dropoff);
  if (!zoneId) return { ok: false, reason: { kind: 'OUTSIDE_ZONE' } };

  const pickup = tenantLocationFromSettings(tenant.slug, tenant.settings);
  const distanceKm = haversineKm(pickup, dropoff);

  const tier = await findTierForDistance(admin, tenant.id, distanceKm);
  if (!tier) return { ok: false, reason: { kind: 'NO_TIER', distanceKm } };

  const deliveryFeeRon = round2(tier.price_ron);

  const promoApplied = await applyPromo(admin, tenant.id, promoCode, subtotalRon, deliveryFeeRon);
  if (!promoApplied.ok) return { ok: false, reason: promoApplied.reason };

  // Promo discount applies to subtotal+delivery; FREE_DELIVERY zeros out the
  // fee so it doesn't get re-added when computing total.
  const effectiveDelivery =
    promoApplied.promo?.kind === 'FREE_DELIVERY' ? 0 : deliveryFeeRon;
  const totalRon = round2(
    Math.max(0, subtotalRon + effectiveDelivery - promoApplied.discountRon),
  );

  return {
    ok: true,
    quote: {
      lineItems,
      subtotalRon,
      deliveryFeeRon: effectiveDelivery,
      discountRon: promoApplied.discountRon,
      totalRon,
      fulfillment: 'DELIVERY',
      distanceKm: Math.round(distanceKm * 100) / 100,
      zoneId,
      tierId: tier.id,
      promo: promoApplied.promo,
    },
  };
}

async function applyPromo(
  admin: SupabaseClient<Database>,
  tenantId: string,
  rawCode: string | null,
  subtotalRon: number,
  deliveryFeeRon: number,
): Promise<
  | { ok: true; promo: AppliedPromo | null; discountRon: number }
  | { ok: false; reason: QuoteFailure }
> {
  if (!rawCode || !rawCode.trim()) return { ok: true, promo: null, discountRon: 0 };
  const result = await lookupAndValidatePromo(
    admin,
    tenantId,
    rawCode,
    subtotalRon,
    deliveryFeeRon,
  );
  if (!result.ok) return { ok: false, reason: { kind: 'PROMO_INVALID', reason: result.reason } };
  return {
    ok: true,
    promo: {
      id: result.promo.id,
      code: result.promo.code,
      kind: result.promo.kind,
      valueInt: result.promo.value_int,
    },
    discountRon: result.discountRon,
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
