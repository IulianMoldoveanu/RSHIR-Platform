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

  const { data: order, error } = await admin
    .from('restaurant_orders')
    .select(
      `
        id,
        status,
        payment_status,
        items,
        subtotal_ron,
        delivery_fee_ron,
        total_ron,
        created_at,
        updated_at,
        public_track_token,
        delivery_address_id,
        tenants ( name, slug, settings ),
        customers ( first_name, last_name ),
        customer_addresses ( line1, city )
      `,
    )
    .eq('public_track_token', parsed.data.token)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const tenantSettings = (order.tenants?.settings ?? {}) as Record<string, unknown>;
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

  const isPickup = order.delivery_address_id === null;

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      items: order.items,
      subtotalRon: Number(order.subtotal_ron),
      deliveryFeeRon: Number(order.delivery_fee_ron),
      totalRon: Number(order.total_ron),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      publicTrackToken: order.public_track_token,
      fulfillment: isPickup ? 'PICKUP' : 'DELIVERY',
      tenant: order.tenants
        ? {
            name: order.tenants.name,
            slug: order.tenants.slug,
            phone: tenantPhone,
            location:
              tenantLat !== null && tenantLng !== null ? { lat: tenantLat, lng: tenantLng } : null,
            pickupAddress,
          }
        : null,
      customer: order.customers
        ? {
            firstName: order.customers.first_name,
            lastNameInitial: initial(order.customers.last_name),
          }
        : null,
      dropoff:
        !isPickup && order.customer_addresses
          ? {
              neighborhood: neighborhoodOf(
                order.customer_addresses.line1,
                order.customer_addresses.city,
              ),
              city: order.customer_addresses.city,
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
