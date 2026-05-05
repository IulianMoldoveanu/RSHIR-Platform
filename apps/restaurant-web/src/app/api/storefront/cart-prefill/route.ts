import { NextResponse, type NextRequest } from 'next/server';
import { resolveTenantFromHost } from '@/lib/tenant';
import { getSupabase } from '@/lib/supabase';

/**
 * Lane I (2026-05-04) — POST /api/storefront/cart-prefill
 *
 * Body: { items: [{ menu_item_id: string, qty: number }] }
 *
 * Validates that every menu_item_id belongs to the resolved tenant + is
 * still available, and returns the rich line-item payload the client can
 * hand to the Zustand cart store. The deep-link only carries IDs + qty;
 * we never trust the URL for prices or names.
 */
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 25;

type IncomingEntry = { menu_item_id: string; qty: number };

export async function POST(req: NextRequest) {
  const { tenant } = await resolveTenantFromHost();
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: 'invalid_items' }, { status: 400 });
  }

  const entries: IncomingEntry[] = [];
  for (const e of items) {
    if (typeof e !== 'object' || e === null) {
      return NextResponse.json({ error: 'invalid_entry' }, { status: 400 });
    }
    const r = e as Record<string, unknown>;
    const id = r.menu_item_id;
    const qty = r.qty;
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid_menu_item_id' }, { status: 400 });
    }
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1 || qty > 50) {
      return NextResponse.json({ error: 'invalid_qty' }, { status: 400 });
    }
    entries.push({ menu_item_id: id, qty: Math.floor(qty) });
  }

  const ids = Array.from(new Set(entries.map((e) => e.menu_item_id)));
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('restaurant_menu_items')
    .select('id, name, price_ron, image_url, is_available, sold_out_until')
    .eq('tenant_id', tenant.id)
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const now = Date.now();
  const validById = new Map<string, { id: string; name: string; price_ron: number; image_url: string | null }>();
  for (const row of data ?? []) {
    const r = row as {
      id: string;
      name: string;
      price_ron: number;
      image_url: string | null;
      is_available: boolean;
      sold_out_until: string | null;
    };
    const soldOut = r.sold_out_until ? new Date(r.sold_out_until).getTime() > now : false;
    if (!r.is_available || soldOut) continue;
    validById.set(r.id, {
      id: r.id,
      name: r.name,
      price_ron: r.price_ron,
      image_url: r.image_url,
    });
  }

  const lines = entries
    .map((e) => {
      const item = validById.get(e.menu_item_id);
      if (!item) return null;
      return {
        itemId: item.id,
        name: item.name,
        unitPriceRon: item.price_ron,
        imageUrl: item.image_url,
        qty: e.qty,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ items: lines });
}
