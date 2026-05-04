import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { authenticateApiKey } from '@/lib/api-key';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchCourierPushForNewOrder } from '@/lib/push/dispatch';
import { validateWebhookUrl } from '@/lib/url-safety';

export const dynamic = 'force-dynamic';

// Mirrors `CreateDeliveryOrderInput` from `packages/delivery-client/src/index.ts`.
const addressSchema = z.object({
  line1: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().optional(),
  country: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const itemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceRon: z.number().nonnegative(),
  notes: z.string().optional(),
});

const createOrderSchema = z.object({
  externalOrderId: z.string().min(1),
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
  }),
  pickupAddress: addressSchema,
  dropoffAddress: addressSchema,
  items: z.array(itemSchema).min(1),
  totalRon: z.number().nonnegative(),
  deliveryFeeRon: z.number().nonnegative(),
  paymentMethod: z.enum(['CARD', 'COD']).optional(),
  notes: z.string().optional(),
  /** Subscribe to status-change webhooks. Omit to opt out. */
  webhookCallbackUrl: z.string().url().optional(),
  /** Required iff webhookCallbackUrl is set. Used as HMAC-SHA256 secret. */
  webhookSecret: z.string().min(16).optional(),
}).refine(
  (data) => !data.webhookCallbackUrl || !!data.webhookSecret,
  { message: 'webhookSecret required when webhookCallbackUrl is set', path: ['webhookSecret'] },
);

function makeTrackToken(): string {
  return randomBytes(16).toString('hex');
}

function shapeOrder(row: {
  id: string;
  source_order_id: string;
  status: string;
  public_track_token: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    externalOrderId: row.source_order_id,
    status: row.status,
    publicTrackToken: row.public_track_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // SSRF guard at create time: any caller-supplied webhook URL must be a
  // public https:// DNS name. We re-check at dispatch time too (against
  // private-IP resolution) but rejecting here gives the caller a clear
  // 400 instead of silently storing an unreachable URL.
  if (input.webhookCallbackUrl) {
    const urlCheck = validateWebhookUrl(input.webhookCallbackUrl);
    if (!urlCheck.ok) {
      return NextResponse.json(
        { error: 'invalid_webhook_url', detail: urlCheck.error },
        { status: 400 },
      );
    }
  }

  const sourceType = auth.ctx.hirTenantId ? 'HIR_TENANT' : 'EXTERNAL_API';
  const admin = createAdminClient();

  // Idempotency: if the same (source_tenant_id, source_order_id) is posted again,
  // return the existing row instead of creating a duplicate.
  const existingQuery = admin
    .from('courier_orders')
    .select('id, source_order_id, status, public_track_token, created_at, updated_at')
    .eq('source_order_id', input.externalOrderId);
  if (auth.ctx.hirTenantId) {
    existingQuery.eq('source_tenant_id', auth.ctx.hirTenantId);
  } else {
    existingQuery.is('source_tenant_id', null);
  }
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing) {
    return NextResponse.json(shapeOrder(existing as never), { status: 200 });
  }

  const { data, error } = await admin
    .from('courier_orders')
    .insert({
      fleet_id: auth.ctx.fleetId,
      source_type: sourceType,
      source_tenant_id: auth.ctx.hirTenantId,
      source_order_id: input.externalOrderId,
      customer_first_name: input.customer.firstName,
      customer_phone: input.customer.phone,
      pickup_line1: input.pickupAddress.line1,
      pickup_lat: input.pickupAddress.latitude,
      pickup_lng: input.pickupAddress.longitude,
      dropoff_line1: input.dropoffAddress.line1,
      dropoff_lat: input.dropoffAddress.latitude,
      dropoff_lng: input.dropoffAddress.longitude,
      items: input.items,
      total_ron: input.totalRon,
      delivery_fee_ron: input.deliveryFeeRon,
      payment_method: input.paymentMethod ?? 'CARD',
      status: 'CREATED',
      public_track_token: makeTrackToken(),
      webhook_callback_url: input.webhookCallbackUrl ?? null,
      webhook_secret: input.webhookSecret ?? null,
    })
    .select('id, source_order_id, status, public_track_token, created_at, updated_at')
    .single();

  if (error || !data) {
    console.error('[api/external/orders] insert failed:', error?.message);
    return NextResponse.json({ error: 'create_failed' }, { status: 500 });
  }

  // Fire-and-forget Web Push to all active couriers in the fleet. The
  // helper swallows errors so a misconfigured push pipeline can't block
  // order creation. Couriers without a subscription just don't get the
  // notification — the realtime feed picks the order up either way.
  void dispatchCourierPushForNewOrder({
    fleetId: auth.ctx.fleetId,
    orderId: data.id,
  });

  return NextResponse.json(shapeOrder(data as never), { status: 201 });
}
