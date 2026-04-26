'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  cartBootstrapCookieName,
  CART_BOOTSTRAP_COOKIE_MAX_AGE_SECONDS,
  readCustomerCookie,
} from '@/lib/customer-recognition';
import type { CartItem, CartModifier } from '@/lib/cart/store';

const orderIdSchema = z.string().uuid();

type StoredOrderItem = {
  itemId: string;
  name: string;
  priceRon: number;
  quantity: number;
  lineTotalRon: number;
  // Newer orders persist modifiers (id + name + priceDeltaRon). Older orders
  // pre-modifier-fix won't have this — we treat absence as no modifiers.
  modifiers?: Array<{ id: string; name: string; priceDeltaRon: number }>;
};

function modifiersKey(mods: CartModifier[]): string {
  return mods.map((m) => m.id).sort().join('|');
}

/**
 * RSHIR-34 — One-tap repeat order. Validates that the cookie tenant matches
 * the order tenant and that the cookie customer owns the order, then
 * filters the order's lines down to currently-available menu items, writes
 * a short-lived bootstrap cookie that <CartBootstrap> picks up on the
 * storefront, and redirects to `/`.
 */
export async function repeatOrder(orderId: string): Promise<void> {
  const id = orderIdSchema.safeParse(orderId);
  if (!id.success) redirect('/account');

  const { tenant } = await resolveTenantFromHost();
  if (!tenant) redirect('/account');

  const customerId = readCustomerCookie(tenant.id);
  if (!customerId) redirect('/account');

  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from('restaurant_orders')
    .select('id, tenant_id, customer_id, items')
    .eq('id', id.data)
    .eq('tenant_id', tenant.id)
    .eq('customer_id', customerId)
    .maybeSingle();

  if (error || !order) redirect('/account');

  const orderItems = (order.items ?? []) as StoredOrderItem[];
  if (orderItems.length === 0) redirect('/account');

  const itemIds = Array.from(new Set(orderItems.map((i) => i.itemId)));
  const { data: menuItems } = await admin
    .from('restaurant_menu_items')
    .select('id, name, price_ron, image_url, is_available')
    .eq('tenant_id', tenant.id)
    .in('id', itemIds);

  const availableById = new Map(
    (menuItems ?? [])
      .filter((m) => m.is_available)
      .map((m) => [m.id, m]),
  );

  // Re-fetch modifiers to validate they still exist + carry their current
  // price_delta_ron (in case the operator changed it since the order ran).
  const requestedModIds = Array.from(
    new Set(orderItems.flatMap((i) => (i.modifiers ?? []).map((m) => m.id))),
  );
  const liveModifiersById = new Map<
    string,
    { id: string; item_id: string; name: string; price_delta_ron: number }
  >();
  if (requestedModIds.length > 0) {
    const { data: modRows } = await admin
      .from('restaurant_menu_modifiers')
      .select('id, item_id, name, price_delta_ron')
      .in('id', requestedModIds);
    for (const m of modRows ?? []) liveModifiersById.set(m.id, m);
  }

  const cartItems: CartItem[] = [];
  for (const line of orderItems) {
    const live = availableById.get(line.itemId);
    if (!live) continue;
    const modifiers: CartModifier[] = [];
    for (const m of line.modifiers ?? []) {
      const liveMod = liveModifiersById.get(m.id);
      // Drop modifiers that no longer exist or have moved to a different
      // item — pricing.ts would reject them at quote time anyway.
      if (!liveMod || liveMod.item_id !== line.itemId) continue;
      modifiers.push({
        id: liveMod.id,
        name: liveMod.name,
        price_delta_ron: Number(liveMod.price_delta_ron),
      });
    }
    cartItems.push({
      lineId: `${line.itemId}::${modifiersKey(modifiers)}`,
      itemId: line.itemId,
      name: live.name,
      unitPriceRon: Number(live.price_ron),
      imageUrl: live.image_url,
      qty: line.quantity,
      modifiers,
    });
  }

  if (cartItems.length === 0) redirect('/account');

  cookies().set({
    name: cartBootstrapCookieName(tenant.id),
    value: JSON.stringify({ items: cartItems }),
    maxAge: CART_BOOTSTRAP_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    httpOnly: false,
  });

  redirect('/');
}
