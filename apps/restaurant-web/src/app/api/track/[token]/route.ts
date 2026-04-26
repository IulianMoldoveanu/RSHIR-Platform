import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

/**
 * Anonymous fetch of an order by its public_track_token.
 * Returns ONLY the safe subset of fields needed to render /track/[token].
 *
 * TODO: replace with `get_public_order(token uuid)` Postgres function once
 * that migration ships (spec §5.4). For now we use the service-role client
 * server-side and hand-pick columns.
 */
export async function GET(_req: Request, ctx: { params: { token: string } }) {
  const parsed = paramsSchema.safeParse(ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Defensive SELECT: try with payment_method (20260504_001 column); on
  // PostgREST 'column does not exist' fall back to the legacy column set so
  // /track keeps working when the migration lags the code deploy. The COD
  // banner just doesn't render until the column exists.
  const COLS_FULL = `
    id, status, payment_status, payment_method, items,
    subtotal_ron, delivery_fee_ron, total_ron, created_at, updated_at,
    public_track_token, delivery_address_id,
    tenants ( name, slug, settings ),
    customers ( first_name, last_name ),
    customer_addresses ( line1, city )
  `;
  const COLS_LEGACY = `
    id, status, payment_status, items,
    subtotal_ron, delivery_fee_ron, total_ron, created_at, updated_at,
    public_track_token, delivery_address_id,
    tenants ( name, slug, settings ),
    customers ( first_name, last_name ),
    customer_addresses ( line1, city )
  `;
  const loadOrder = (cols: string) =>
    admin
      .from('restaurant_orders')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(cols as any)
      .eq('public_track_token', parsed.data.token)
      .single();
  let { data: order, error } = await loadOrder(COLS_FULL);
  if (error && /payment_method/i.test(error.message ?? '')) {
    ({ data: order, error } = await loadOrder(COLS_LEGACY));
  }

  if (error || !order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The defensive any-cast on .select(cols as any) widened the row type;
  // narrow it back so the rest of this route reads cleanly.
  const orderRow = order as unknown as {
    id: string;
    status: string;
    payment_status: string;
    payment_method?: 'CARD' | 'COD' | null;
    items: unknown;
    subtotal_ron: number | string;
    delivery_fee_ron: number | string;
    total_ron: number | string;
    created_at: string;
    updated_at: string;
    public_track_token: string;
    delivery_address_id: string | null;
    tenants: { name: string; slug: string; settings: unknown } | null;
    customers: { first_name: string | null; last_name: string | null } | null;
    customer_addresses: { line1: string | null; city: string | null } | null;
  };

  // RSHIR-39: surface whether the customer has already left a review so the
  // /track UI can render the prompt vs the thank-you state without a second
  // round-trip.
  let hasReview = false;
  if (orderRow.status === 'DELIVERED') {
    const { data: review } = await admin
      .from('restaurant_reviews')
      .select('id')
      .eq('order_id', orderRow.id)
      .maybeSingle();
    hasReview = !!review;
  }

  const tenantSettings = (orderRow.tenants?.settings ?? {}) as Record<string, unknown>;
  const tenantPhone =
    typeof tenantSettings.whatsapp_phone === 'string'
      ? tenantSettings.whatsapp_phone
      : typeof tenantSettings.phone === 'string'
        ? tenantSettings.phone
        : null;

  const tenantLat = typeof tenantSettings.location_lat === 'number' ? tenantSettings.location_lat : null;
  const tenantLng = typeof tenantSettings.location_lng === 'number' ? tenantSettings.location_lng : null;
  const pickupAddress =
    typeof tenantSettings.pickup_address === 'string' ? tenantSettings.pickup_address : null;
  const pickupEtaMinutes =
    typeof tenantSettings.pickup_eta_minutes === 'number' && tenantSettings.pickup_eta_minutes > 0
      ? Math.round(tenantSettings.pickup_eta_minutes)
      : null;
  // For DELIVERY orders, use the *min* of the configured range as the target
  // — under-promise / over-deliver beats the inverse for repeat-order intent
  // (Tazz Trustpilot pattern).
  const deliveryEtaMinutes =
    typeof tenantSettings.delivery_eta_min_minutes === 'number' &&
    tenantSettings.delivery_eta_min_minutes > 0
      ? Math.round(tenantSettings.delivery_eta_min_minutes)
      : null;

  const isPickup = orderRow.delivery_address_id === null;

  const paymentMethod =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((order as any).payment_method as 'CARD' | 'COD' | null | undefined) ?? null;

  return NextResponse.json({
    order: {
      id: orderRow.id,
      status: orderRow.status,
      paymentStatus: orderRow.payment_status,
      paymentMethod,
      items: orderRow.items,
      subtotalRon: Number(orderRow.subtotal_ron),
      deliveryFeeRon: Number(orderRow.delivery_fee_ron),
      totalRon: Number(orderRow.total_ron),
      createdAt: orderRow.created_at,
      updatedAt: orderRow.updated_at,
      publicTrackToken: orderRow.public_track_token,
      fulfillment: isPickup ? 'PICKUP' : 'DELIVERY',
      hasReview,
      tenant: orderRow.tenants
        ? {
            name: orderRow.tenants.name,
            slug: orderRow.tenants.slug,
            phone: tenantPhone,
            location:
              tenantLat !== null && tenantLng !== null ? { lat: tenantLat, lng: tenantLng } : null,
            pickupAddress,
            pickupEtaMinutes,
            deliveryEtaMinutes,
          }
        : null,
      customer: orderRow.customers
        ? {
            firstName: orderRow.customers.first_name,
            lastNameInitial: initial(orderRow.customers.last_name),
          }
        : null,
      dropoff:
        !isPickup && orderRow.customer_addresses
          ? {
              neighborhood: neighborhoodOf(
                orderRow.customer_addresses.line1,
                orderRow.customer_addresses.city,
              ),
              city: orderRow.customer_addresses.city,
            }
          : null,
    },
  });
}

function initial(name: string | null): string | null {
  if (!name) return null;
  const first = name.trim().charAt(0);
  return first ? `${first.toUpperCase()}.` : null;
}

function neighborhoodOf(line1: string | null, city: string | null): string {
  const trimmed = (line1 ?? '').trim();
  if (!trimmed) return city ?? '';
  return trimmed.split(',')[0].trim();
}
