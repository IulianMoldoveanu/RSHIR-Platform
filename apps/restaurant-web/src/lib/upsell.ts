// Upsell Engine — Phase 1 co-occurrence cross-sell.
//
// Items in restaurant_orders.items are a JSONB array with shape:
//   { item_id?: string, id?: string, name: string, quantity?: int, qty?: int, price_ron?: number }
// (mirrors the storefront line-item snapshot; fallback keys coalesce to the same pattern as
//  the v_top_items analytics view in 20260425_200_analytics_views.sql)
//
// Algorithm:
//   1. Fetch recent orders (last 90 days, not CANCELLED) for the tenant — items column only.
//   2. In JS: build co-occurrence map (how often item A and item B appear in the same order).
//   3. For each cart item, pick top-3 co-occurrers not already in cart.
//   4. Deduplicate, filter to is_available=true via menu table, rank, return top 5.
//   5. Cold-start fallback (<50 orders): return top 5 best-sellers (last 30 days) not in cart.

import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type CartItem = {
  item_id: string;
  qty: number;
};

export type UpsellSuggestion = {
  item_id: string;
  name: string;
  price_cents: number;
  reason: string;
  confidence: number;
  expected_lift_cents: number;
};

export type UpsellResult = {
  suggestions: UpsellSuggestion[];
  total_expected_lift_cents: number;
};

// Shape of a single line item as stored in restaurant_orders.items JSONB
type LineItem = {
  item_id?: string;
  id?: string;
  name?: string;
  item_name?: string;
  quantity?: number;
  qty?: number;
  price_ron?: number;
  price?: number;
};

function extractItemId(li: LineItem): string | null {
  return li.item_id ?? li.id ?? null;
}

function extractPriceRon(li: LineItem): number {
  return li.price_ron ?? li.price ?? 0;
}

function extractName(li: LineItem): string {
  return li.name ?? li.item_name ?? '';
}

// Supabase admin client cast — restaurant_orders is in the generated types
// but we only need id + items here.
type OrderRow = { id: string; items: unknown };

const COLD_START_THRESHOLD = 50;
const CONFIDENCE_MIN = 0.15;
const MAX_SUGGESTIONS = 5;
const PER_CART_ITEM_TOP_N = 3;

export async function getUpsellSuggestions({
  tenantId,
  itemsInCart,
}: {
  tenantId: string;
  itemsInCart: CartItem[];
  customerPhone?: string;
  subtotalCents?: number;
}): Promise<UpsellResult> {
  const cartIds = new Set(itemsInCart.map((i) => i.item_id));
  const admin = getSupabaseAdmin();

  // Cast: the generated client types `items` as Json; we read it as unknown and
  // narrow below. Using `as unknown as` mirrors the pattern in route.ts / audit.ts.
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          neq: (col: string, val: string) => {
            gte: (col: string, val: string) => {
              limit: (n: number) => Promise<{ data: OrderRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };

  // Fetch recent orders — cap at 2000 rows so we never time out at p95 checkout latency.
  const cutoff90 = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();
  const { data: orders, error } = await sb
    .from('restaurant_orders')
    .select('id, items')
    .eq('tenant_id', tenantId)
    .neq('status', 'CANCELLED')
    .gte('created_at', cutoff90)
    .limit(2000);

  if (error || !orders) {
    console.error('[upsell] orders fetch failed', error?.message);
    return { suggestions: [], total_expected_lift_cents: 0 };
  }

  const isColdStart = orders.length < COLD_START_THRESHOLD;

  if (isColdStart) {
    return buildFallback({ tenantId, cartIds, orders });
  }

  return buildCoOccurrence({ tenantId, cartIds, orders });
}

// ---------------------------------------------------------------------------
// Co-occurrence path
// ---------------------------------------------------------------------------

async function buildCoOccurrence({
  tenantId,
  cartIds,
  orders,
}: {
  tenantId: string;
  cartIds: Set<string>;
  orders: OrderRow[];
}): Promise<UpsellResult> {
  // co[a][b] = number of orders where both a and b appear
  const co = new Map<string, Map<string, number>>();
  // total_orders[itemId] = how many orders contain this item
  const totalOrders = new Map<string, number>();
  // best known name + price per item (from the snapshot)
  const itemMeta = new Map<string, { name: string; price_ron: number }>();

  for (const order of orders) {
    const lineItems = parseItems(order.items);
    if (lineItems.length === 0) continue;

    const ids = lineItems
      .map((li) => extractItemId(li))
      .filter((id): id is string => id !== null && id !== '');

    const uniqueIds = [...new Set(ids)];

    // Update per-item metadata
    for (const li of lineItems) {
      const id = extractItemId(li);
      if (!id) continue;
      if (!itemMeta.has(id)) {
        itemMeta.set(id, { name: extractName(li), price_ron: extractPriceRon(li) });
      }
    }

    // Count item occurrences (ALL orders, including single-item ones).
    // This is used as the denominator for confidence, so it must reflect
    // how often the cart item appears regardless of order size.
    for (const id of uniqueIds) {
      totalOrders.set(id, (totalOrders.get(id) ?? 0) + 1);
    }

    // Count co-occurrences only when the order has at least 2 distinct items.
    if (uniqueIds.length < 2) continue;
    for (let i = 0; i < uniqueIds.length; i++) {
      for (let j = i + 1; j < uniqueIds.length; j++) {
        const a = uniqueIds[i]!;
        const b = uniqueIds[j]!;
        increment(co, a, b);
        increment(co, b, a);
      }
    }
  }

  // Gather candidate suggestions: for each cart item, pick top-N co-occurrers
  const candidateScores = new Map<string, number>(); // item_id → best raw co_count

  for (const cartItemId of cartIds) {
    const peers = co.get(cartItemId);
    if (!peers) continue;

    // Sort by co_count desc, take top PER_CART_ITEM_TOP_N
    const sorted = [...peers.entries()]
      .filter(([id]) => !cartIds.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, PER_CART_ITEM_TOP_N);

    for (const [id, count] of sorted) {
      const cartItemTotal = totalOrders.get(cartItemId) ?? 1;
      const confidence = count / cartItemTotal;
      if (confidence < CONFIDENCE_MIN) continue;

      // rank score = confidence * price (higher-priced + more-frequent = better)
      const price_ron = itemMeta.get(id)?.price_ron ?? 0;
      const score = confidence * price_ron;

      if (!candidateScores.has(id) || score > candidateScores.get(id)!) {
        candidateScores.set(id, score);
      }
    }
  }

  if (candidateScores.size === 0) {
    // No co-occurring items above the confidence threshold for these cart items.
    // Return empty — the cold-start fallback only applies when the tenant has < 50 orders total.
    return { suggestions: [], total_expected_lift_cents: 0 };
  }

  // Sort candidates by score
  const ranked = [...candidateScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUGGESTIONS)
    .map(([id]) => id);

  // Filter to available menu items + enrich with live name/price
  return enrichFromMenu({ tenantId, candidateIds: ranked, itemMeta, cartIds, coMap: co, totalOrders });
}

// ---------------------------------------------------------------------------
// Fallback: top best-sellers (30 days) not in cart
// ---------------------------------------------------------------------------

async function buildFallback({
  tenantId,
  cartIds,
  orders,
}: {
  tenantId: string;
  cartIds: Set<string>;
  orders: OrderRow[];
}): Promise<UpsellResult> {
  // Count how many orders each item appears in (last 30 days)
  const cutoff30 = Date.now() - 30 * 24 * 3_600_000;
  const counts = new Map<string, { count: number; name: string; price_ron: number }>();

  for (const order of orders) {
    // We can't filter by created_at here since we only fetched id + items.
    // The order list was already filtered to 90 days; for the fallback we
    // approximate by using all available orders (still better than nothing).
    const lineItems = parseItems(order.items);
    const seen = new Set<string>();
    for (const li of lineItems) {
      const id = extractItemId(li);
      if (!id || seen.has(id) || cartIds.has(id)) continue;
      seen.add(id);
      const existing = counts.get(id);
      if (existing) {
        existing.count++;
      } else {
        counts.set(id, { count: 1, name: extractName(li), price_ron: extractPriceRon(li) });
      }
    }
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_SUGGESTIONS)
    .map(([id]) => id);

  const meta = new Map(
    [...counts.entries()].map(([id, v]) => [id, { name: v.name, price_ron: v.price_ron }]),
  );

  return enrichFromMenu({
    tenantId,
    candidateIds: ranked,
    itemMeta: meta,
    cartIds,
    coMap: new Map(),
    totalOrders: new Map([...counts.entries()].map(([id, v]) => [id, v.count])),
    isFallback: true,
  });
}

// ---------------------------------------------------------------------------
// Enrich candidates with live menu data (availability + canonical price)
// ---------------------------------------------------------------------------

type MenuRow = { id: string; name: string; price_ron: number; is_available: boolean };

async function enrichFromMenu({
  tenantId,
  candidateIds,
  itemMeta,
  cartIds,
  coMap,
  totalOrders,
  isFallback = false,
}: {
  tenantId: string;
  candidateIds: string[];
  itemMeta: Map<string, { name: string; price_ron: number }>;
  cartIds: Set<string>;
  coMap: Map<string, Map<string, number>>;
  totalOrders: Map<string, number>;
  isFallback?: boolean;
}): Promise<UpsellResult> {
  if (candidateIds.length === 0) {
    return { suggestions: [], total_expected_lift_cents: 0 };
  }

  const admin = getSupabaseAdmin();

  const menuSb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (col: string, vals: string[]) => {
            eq: (col: string, val: boolean) => Promise<{ data: MenuRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };

  const { data: menuItems, error } = await menuSb
    .from('restaurant_menu_items')
    .select('id, name, price_ron, is_available')
    .eq('tenant_id', tenantId)
    .in('id', candidateIds)
    .eq('is_available', true);

  if (error || !menuItems) {
    console.error('[upsell] menu fetch failed', error?.message);
    return { suggestions: [], total_expected_lift_cents: 0 };
  }

  // Build suggestions in the ranked order of candidateIds
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));
  const suggestions: UpsellSuggestion[] = [];

  for (const id of candidateIds) {
    const menu = menuMap.get(id);
    if (!menu) continue; // not available or not found

    let confidence = 0;
    let reason = 'Popular la acest restaurant';

    if (!isFallback) {
      // Find max co_count across cart items
      let bestCoCount = 0;
      let bestCartTotal = 1;
      for (const cartId of cartIds) {
        const count = coMap.get(cartId)?.get(id) ?? 0;
        if (count > bestCoCount) {
          bestCoCount = count;
          bestCartTotal = totalOrders.get(cartId) ?? 1;
        }
      }
      confidence = bestCoCount / bestCartTotal;
      const pct = Math.round(confidence * 100);
      reason = `Combinat în ${pct}% din comenzi`;
    }

    const price_cents = Math.round(menu.price_ron * 100);
    const expected_lift_cents = Math.round(price_cents * (isFallback ? 0.5 : confidence));

    suggestions.push({
      item_id: id,
      name: menu.name,
      price_cents,
      reason,
      confidence: isFallback ? 0 : parseFloat(confidence.toFixed(2)),
      expected_lift_cents,
    });

    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  const total_expected_lift_cents = suggestions.reduce((s, x) => s + x.expected_lift_cents, 0);

  return { suggestions, total_expected_lift_cents };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is LineItem => typeof x === 'object' && x !== null);
}

function increment(co: Map<string, Map<string, number>>, a: string, b: string): void {
  let inner = co.get(a);
  if (!inner) {
    inner = new Map();
    co.set(a, inner);
  }
  inner.set(b, (inner.get(b) ?? 0) + 1);
}
