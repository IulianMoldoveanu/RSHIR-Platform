// PATCH /api/public/v1/orders/:id/status — the vendor's own system tells HIR
// where the order is.
//
// WHY THIS EXISTS
//   The WordPress/WooCommerce plugin in integrations/wordpress/hir-connect has
//   called this route on every local status change since it was written, and
//   until today it got a 404 (probed live on 2026-11-19: GET and PATCH both
//   404, while /orders and /orders/:id answer 401). The consequence was not a
//   broken button, it was a dead product: POST /orders inserts at PENDING, and
//   PENDING is the one status that dispatches nothing — the courier_orders row
//   is created by trg_restaurant_to_courier_sync on the move INTO PREPARING.
//   A vendor who watches their own shop instead of our dashboard never saw a
//   courier come.
//
// WHY IT IS THIN
//   Everything downstream already hangs off restaurant_orders.status, as
//   triggers on that one column:
//     PREPARING  → creates the courier_orders row; dispatch begins
//     READY      → stamps restaurant_ready_at, which is what unblocks the
//                  rider's pickup swipe (markPickedUpAction's gate)
//     CANCELLED  → cancels the linked courier order unless it already ran
//   plus the customer email/push (trg_orders_notify_customer_status), the live
//   track broadcast, and the outbound Connect webhook. So this route's whole
//   job is to write that column honestly and refuse to write it dishonestly.
//
// WHAT WE REFUSE TO BE TOLD
//   DISPATCHED / IN_DELIVERY / DELIVERED belong to the courier, never to the
//   vendor. Accepting DELIVERED here would be worse than merely wrong: a
//   *completed delivery* is the billable unit in the fleet contract, so a shop
//   that marks orders "completed" when payment clears would invoice deliveries
//   that nobody ever made. WooCommerce's `completed` and `out-for-delivery`
//   are therefore acknowledged and ignored — which also breaks the echo loop,
//   since those two are exactly what the plugin sets when it receives OUR
//   webhook and pushes the change straight back at us.
//
// WHICH ORDERS A KEY MAY DRIVE
//   Only the ones that came in through the vendor's own systems
//   (EXTERNAL_API, POS_PUSH). A tenant can run both channels at once — our
//   storefront for the public and their shop for their regulars — and the two
//   must not reach into each other: an INTERNAL_STOREFRONT order belongs to
//   the kitchen screen and the dashboard, which already drive it, and a
//   WooCommerce plugin looping over "my recent orders" must never be able to
//   mark one of those READY. Each system owns the orders it created.
//
//   Note this is deliberately NOT a check on tenants.delivery_mode. Headless
//   vs full_saas says which product the vendor bought; `source` says where
//   this particular order came from, and that is the question being asked
//   here. A full_saas tenant with a POS pushing orders is a real case, and
//   gating on delivery_mode would break it for no gain.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkLimit } from '@/lib/rate-limit';
import { authenticateBearerKey } from '../../../auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Statuses a vendor may set. The rest of the machine belongs to the courier. */
const VENDOR_SETTABLE = ['CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'] as const;
type VendorStatus = (typeof VENDOR_SETTABLE)[number];

/**
 * Order of the kitchen-side pipeline. Used to refuse backwards moves and to
 * know when READY needs to pass through PREPARING first.
 */
const RANK: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PREPARING: 2,
  READY: 3,
  DISPATCHED: 4,
  IN_DELIVERY: 5,
  DELIVERED: 6,
};

/**
 * A vendor's system speaks its own vocabulary. WooCommerce pushes its raw slug
 * (`processing`, `cancelled`, …) straight from woocommerce_order_status_changed,
 * so accepting only our uppercase names would mean every integrator writes a
 * translation table before they can send us anything.
 *
 * `null` = understood, deliberately not applied. That is not an error: the
 * vendor reported something true about their own order that simply is not ours
 * to act on, and telling them 400 would fill their error log with noise they
 * cannot fix.
 */
const ALIASES: Record<string, VendorStatus | null> = {
  // WooCommerce core
  pending: null, // payment pending on their side; nothing to do here
  'on-hold': null,
  processing: 'PREPARING', // accepted + in the kitchen → dispatches a courier
  completed: null, // see "WHAT WE REFUSE TO BE TOLD"
  cancelled: 'CANCELLED',
  refunded: null, // money, not logistics
  failed: 'CANCELLED', // payment failed before anyone cooked anything
  'checkout-draft': null,
  // Custom statuses the plugin itself registers, echoed back at us
  'out-for-delivery': null,
  'ready-for-pickup': 'READY',
  ready: 'READY',
  confirmed: 'CONFIRMED',
  preparing: 'PREPARING',
};

const bodySchema = z.object({
  status: z.string().trim().min(1).max(60),
});

/**
 * Resolve whatever the caller sent into one of our statuses.
 * Returns `undefined` when we genuinely do not recognise it.
 */
function resolveStatus(raw: string): VendorStatus | null | undefined {
  // WooCommerce stores statuses prefixed (`wc-processing`) and passes them
  // unprefixed to the hook — accept both rather than depend on which path the
  // integrator wired up.
  const cleaned = raw.trim().replace(/^wc-/i, '');
  const upper = cleaned.toUpperCase().replace(/[\s-]+/g, '_');
  if ((VENDOR_SETTABLE as readonly string[]).includes(upper)) {
    return upper as VendorStatus;
  }
  const lower = cleaned.toLowerCase().replace(/[\s_]+/g, '-');
  if (lower in ALIASES) return ALIASES[lower];
  // Statuses that exist for us but are the courier's to set: understood,
  // refused — distinct from gibberish, and worth saying so.
  if (['DISPATCHED', 'IN_DELIVERY', 'DELIVERED', 'PICKED_UP'].includes(upper)) {
    return null;
  }
  return undefined;
}

type OrderRow = { id: string; status: string; updated_at: string };
type OrderLookup = OrderRow & { source: string | null };

/**
 * Sources that originate on the vendor's side. An order our own storefront
 * took is driven by the kitchen screen, not by an API key.
 * Allowlist, not denylist: order_source gains values (GLOVO, WOLT, VOICE …)
 * and a new one must not become settable by accident.
 */
const API_MANAGED_SOURCES = ['EXTERNAL_API', 'POS_PUSH'];

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  const authed = await authenticateBearerKey(req.headers.get('authorization'));
  if (!authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!authed.scopes.includes('orders.write')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Same budget as POST /orders: a status push is a write, and a shop that
  // flips more than one order per second is either very busy or looping.
  const rl = checkLimit(`pub-orders-write:${authed.keyId}`, {
    capacity: 60,
    refillPerSec: 1,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const target = resolveStatus(parsed.data.status);
  if (target === undefined) {
    return NextResponse.json(
      { error: 'invalid_status', accepted: VENDOR_SETTABLE },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const sb = admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{
              data: OrderLookup | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            select: (cols: string) => Promise<{
              data: OrderRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };

  const { data: order, error: readErr } = await sb
    .from('restaurant_orders')
    .select('id, status, updated_at, source')
    .eq('id', params.id)
    .eq('tenant_id', authed.tenantId)
    .maybeSingle();

  if (readErr) {
    console.error('[public/v1/orders/status] read failed', readErr.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The order is theirs, but it did not come from their system — so it is not
  // theirs to move. 409 rather than 404: hiding it would send an integrator
  // hunting for a missing order that is sitting right there in the dashboard.
  if (!API_MANAGED_SOURCES.includes(order.source ?? '')) {
    return NextResponse.json(
      {
        error: 'order_not_api_managed',
        source: order.source,
        detail:
          'This order was taken by the HIR storefront and is managed in the HIR dashboard. The API can only change orders it created.',
      },
      { status: 409 },
    );
  }

  const current = order.status;

  // Understood but not ours to apply.
  if (target === null) {
    return NextResponse.json({
      id: order.id,
      status: current,
      applied: false,
      reason: 'status_not_settable_by_vendor',
      updated_at: order.updated_at,
    });
  }

  // Retries are normal — a shop whose first call timed out will send the same
  // status again. Answer 200, not 400.
  if (current === target) {
    return NextResponse.json({
      id: order.id,
      status: current,
      applied: false,
      reason: 'already_in_status',
      updated_at: order.updated_at,
    });
  }

  if (current === 'DELIVERED' || current === 'CANCELLED') {
    return NextResponse.json(
      { error: 'order_closed', status: current },
      { status: 409 },
    );
  }

  if (target === 'CANCELLED') {
    // Once a rider is carrying the food, a silent API cancel would leave them
    // driving to a door nobody is waiting at. Past READY this is a phone call
    // to the fleet, not an HTTP request.
    if ((RANK[current] ?? 0) > RANK.READY) {
      return NextResponse.json(
        { error: 'too_late_to_cancel', status: current },
        { status: 409 },
      );
    }
  } else if ((RANK[target] ?? 0) <= (RANK[current] ?? 0)) {
    return NextResponse.json(
      { error: 'invalid_transition', from: current, to: target },
      { status: 400 },
    );
  }

  /**
   * Compare-and-set. Two pushes can race (a shop that retries while the first
   * call is still in flight); whoever loses re-reads rather than overwriting a
   * status it never saw.
   */
  async function moveTo(from: string, to: string): Promise<OrderRow | 'conflict'> {
    const { data, error } = await sb
      .from('restaurant_orders')
      .update({ status: to })
      .eq('id', params.id)
      .eq('status', from)
      .select('id, status, updated_at');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return 'conflict';
    return data[0];
  }

  try {
    // READY without PREPARING would stamp nothing: the ready-stamp branch
    // updates a courier_orders row that only the PREPARING branch creates, and
    // a no-op UPDATE reports no error. A shop that only ever signals "ready"
    // (plenty do) would look fine and dispatch nobody. So walk it through.
    if (target === 'READY' && (RANK[current] ?? 0) < RANK.PREPARING) {
      const mid = await moveTo(current, 'PREPARING');
      if (mid === 'conflict') {
        return NextResponse.json({ error: 'conflict', status: current }, { status: 409 });
      }
      const done = await moveTo('PREPARING', 'READY');
      if (done === 'conflict') {
        return NextResponse.json({ error: 'conflict', status: 'PREPARING' }, { status: 409 });
      }
      return NextResponse.json({
        id: done.id,
        status: done.status,
        previous_status: current,
        applied: true,
        passed_through: ['PREPARING'],
        updated_at: done.updated_at,
      });
    }

    const done = await moveTo(current, target);
    if (done === 'conflict') {
      return NextResponse.json({ error: 'conflict', status: current }, { status: 409 });
    }
    return NextResponse.json({
      id: done.id,
      status: done.status,
      previous_status: current,
      applied: true,
      updated_at: done.updated_at,
    });
  } catch (e) {
    console.error('[public/v1/orders/status] update failed', (e as Error).message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
