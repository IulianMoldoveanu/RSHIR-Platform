import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ token: z.string().uuid() });

/**
 * Anonymous fetch of an order by its public_track_token.
 *
 * Calls the `get_public_order(token uuid)` Postgres RPC (security definer,
 * granted to anon). The RPC itself enforces the redaction contract — last
 * name → initial, full street address → neighborhood only, tenant settings
 * → whitelisted keys — so this route is a thin pass-through that just
 * remaps snake_case to camelCase. See
 * supabase/migrations/20260506_008_get_public_order_redact.sql.
 */
export async function GET(_req: Request, ctx: { params: { token: string } }) {
  const parsed = paramsSchema.safeParse(ctx.params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Cast: `get_public_order` is added by 20260506_008; @hir/supabase-types
  // is regenerated post-merge by `supabase/gen-types.mjs`. Until then,
  // narrow via `any` here.
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

  // The RPC returns jsonb already shaped + redacted for the public track UI.
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
    fulfillment: 'PICKUP' | 'DELIVERY';
    has_review: boolean;
    tenant: {
      name: string;
      slug: string;
      settings: {
        phone: string | null;
        whatsapp_phone: string | null;
        location_lat: number | null;
        location_lng: number | null;
        pickup_address: string | null;
        pickup_eta_minutes: number | null;
        delivery_eta_min_minutes: number | null;
      };
    } | null;
    customer: { first_name: string | null; last_name_initial: string | null } | null;
    dropoff: { neighborhood: string; city: string | null } | null;
  };

  const tenantSettings = row.tenant?.settings ?? null;
  const tenantPhone = tenantSettings?.whatsapp_phone ?? tenantSettings?.phone ?? null;
  const tenantLat = tenantSettings?.location_lat ?? null;
  const tenantLng = tenantSettings?.location_lng ?? null;
  const pickupAddress = tenantSettings?.pickup_address ?? null;
  const pickupEtaMinutes =
    tenantSettings?.pickup_eta_minutes && tenantSettings.pickup_eta_minutes > 0
      ? Math.round(tenantSettings.pickup_eta_minutes)
      : null;
  // For DELIVERY orders, use the *min* of the configured range as the target
  // — under-promise / over-deliver beats the inverse for repeat-order intent
  // (Tazz Trustpilot pattern).
  const deliveryEtaMinutes =
    tenantSettings?.delivery_eta_min_minutes && tenantSettings.delivery_eta_min_minutes > 0
      ? Math.round(tenantSettings.delivery_eta_min_minutes)
      : null;

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
      fulfillment: row.fulfillment,
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
            lastNameInitial: row.customer.last_name_initial,
          }
        : null,
      dropoff: row.dropoff,
    },
  });
}
