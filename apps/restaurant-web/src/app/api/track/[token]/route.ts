import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

/**
 * Anonymous fetch of an order by its public_track_token.
 *
 * Calls the `get_public_order(token uuid)` Postgres RPC (security definer)
 * which scopes the read at the DB layer and returns ONLY the safe subset
 * of columns rendered on /track/[token]. The RPC ships in
 * supabase/migrations/20260506_007_get_public_order_rpc.sql.
 *
 * The Supabase client is still the service-role admin so we can call the
 * function from a server route without an end-user JWT, but the RPC's
 * row-shape contract — not RLS — is what defines the safe public view.
 */
export async function GET(_req: Request, ctx: { params: { token: string } }) {
  const parsed = paramsSchema.safeParse(ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Cast: `get_public_order` is added by
  // supabase/migrations/20260506_007_get_public_order_rpc.sql; the generated
  // Database types in @hir/supabase-types are regenerated post-merge by
  // `supabase/gen-types.mjs`. Until that runs, narrow via `any` here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.rpc as any)('get_public_order', {
    p_token: parsed.data.token,
  });

  if (error) {
    console.error('[track/route] get_public_order rpc error', error.message);
    return NextResponse.json({ error: 'rpc_failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The RPC returns jsonb shaped like the previous direct-select, with
  // snake_case keys. Narrow it for the rest of this handler.
  const row = data as unknown as {
    id: string;
    status: string;
    payment_status: string;
    payment_method: 'CARD' | 'COD' | null;
    items: unknown;
    subtotal_ron: number | string;
    delivery_fee_ron: number | string;
    total_ron: number | string;
    created_at: string;
    updated_at: string;
    public_track_token: string;
    delivery_address_id: string | null;
    has_review: boolean;
    tenant: { name: string; slug: string; settings: unknown } | null;
    customer: { first_name: string | null; last_name: string | null } | null;
    customer_address: { line1: string | null; city: string | null } | null;
  };

  const tenantSettings = (row.tenant?.settings ?? {}) as Record<string, unknown>;
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

  const isPickup = row.delivery_address_id === null;

  return NextResponse.json({
    order: {
      id: row.id,
      status: row.status,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method ?? null,
      items: row.items,
      subtotalRon: Number(row.subtotal_ron),
      deliveryFeeRon: Number(row.delivery_fee_ron),
      totalRon: Number(row.total_ron),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publicTrackToken: row.public_track_token,
      fulfillment: isPickup ? 'PICKUP' : 'DELIVERY',
      hasReview: row.has_review,
      tenant: row.tenant
        ? {
            name: row.tenant.name,
            slug: row.tenant.slug,
            phone: tenantPhone,
            location:
              tenantLat !== null && tenantLng !== null ? { lat: tenantLat, lng: tenantLng } : null,
            pickupAddress,
            pickupEtaMinutes,
            deliveryEtaMinutes,
          }
        : null,
      customer: row.customer
        ? {
            firstName: row.customer.first_name,
            lastNameInitial: initial(row.customer.last_name),
          }
        : null,
      dropoff:
        !isPickup && row.customer_address
          ? {
              neighborhood: neighborhoodOf(
                row.customer_address.line1,
                row.customer_address.city,
              ),
              city: row.customer_address.city,
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
