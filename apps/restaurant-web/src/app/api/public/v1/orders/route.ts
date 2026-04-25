// RSHIR-52: POST /api/public/v1/orders
// Accepts an order body from an external POS via Bearer API key.
// Inserts into restaurant_orders with source='EXTERNAL_API'.
// Does NOT create a Stripe payment intent — external POS owns payment.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOrderEvent } from '@/lib/integration-bus';
import { authenticateBearerKey } from '../auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const orderBodySchema = z.object({
  customer: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80).optional().or(z.literal('')),
    phone: z.string().trim().min(6).max(40),
    email: z.string().trim().email().max(200).optional().or(z.literal('')),
  }),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        qty: z.number().int().positive().max(50),
        priceRon: z.number().nonnegative(),
        modifiers: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(50),
  totals: z.object({
    subtotalRon: z.number().nonnegative(),
    deliveryFeeRon: z.number().nonnegative(),
    totalRon: z.number().nonnegative(),
  }),
  fulfillment: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY'),
  dropoff: z
    .object({
      line1: z.string().trim().min(3).max(200),
      line2: z.string().trim().max(200).optional().or(z.literal('')),
      city: z.string().trim().min(2).max(100),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function POST(req: Request) {
  const authed = await authenticateBearerKey(req.headers.get('authorization'));
  if (!authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!authed.scopes.includes('orders.write')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = orderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { customer, items, totals, fulfillment, dropoff, notes } = parsed.data;

  const admin = getSupabaseAdmin();

  // Insert a minimal customer row (same pattern as storefront checkout).
  const custSb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data: custRow, error: custErr } = await custSb
    .from('customers')
    .insert({
      tenant_id: authed.tenantId,
      first_name: customer.firstName,
      last_name: customer.lastName ?? '',
      phone: customer.phone,
      email: customer.email ?? null,
    })
    .select('id')
    .single();
  if (custErr || !custRow) {
    return NextResponse.json(
      { error: 'order_insert_failed', detail: custErr?.message },
      { status: 500 },
    );
  }

  // Build line items JSON (same shape as storefront).
  const lineItems = items.map((i) => ({
    name: i.name,
    quantity: i.qty,
    priceRon: i.priceRon,
    modifiers: i.modifiers ?? [],
  }));

  // Insert the order with source='EXTERNAL_API'. Payment is external.
  const orderSb = admin as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id: string; public_track_token: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data: order, error: orderErr } = await orderSb
    .from('restaurant_orders')
    .insert({
      tenant_id: authed.tenantId,
      customer_id: custRow.id,
      items: lineItems as never,
      subtotal_ron: totals.subtotalRon,
      delivery_fee_ron: totals.deliveryFeeRon,
      total_ron: totals.totalRon,
      notes: notes || null,
      status: 'PENDING',
      payment_status: 'UNPAID',
      source: 'EXTERNAL_API',
    })
    .select('id, public_track_token')
    .single();
  if (orderErr || !order) {
    return NextResponse.json(
      { error: 'order_insert_failed', detail: orderErr?.message },
      { status: 500 },
    );
  }

  // Fire integration event (same hook as storefront checkout).
  await dispatchOrderEvent(authed.tenantId, 'created', {
    orderId: order.id,
    source: 'EXTERNAL_API',
    status: 'PENDING',
    items: items.map((i) => ({
      name: i.name,
      qty: i.qty,
      priceRon: i.priceRon,
      modifiers: i.modifiers,
    })),
    totals,
    customer: { firstName: customer.firstName, phone: customer.phone },
    dropoff: dropoff
      ? { line1: dropoff.line1, city: dropoff.city, lat: dropoff.lat, lng: dropoff.lng }
      : null,
    notes: notes ?? null,
  });

  return NextResponse.json(
    { order_id: order.id, public_track_token: order.public_track_token },
    { status: 201 },
  );
}
