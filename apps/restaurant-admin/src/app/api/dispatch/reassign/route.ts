// POST /api/dispatch/reassign
//
// Reassigns a courier_order to a different courier.
//
// Auth: platform-admin OR tenant OWNER/STAFF whose tenant owns the order
//       (source_tenant_id match via tenant_members).
//
// Body: { courier_order_id: uuid, new_courier_user_id: uuid, reason: string (min 1) }
//
// Validations:
//   - courier_order exists and is in {OFFERED, ACCEPTED, PICKED_UP, IN_TRANSIT}
//   - new courier has an ACTIVE courier_profiles row in the same fleet as the order
//   - new courier is not already the assigned courier
//
// On success:
//   - Updates courier_orders.assigned_courier_user_id
//   - Resets status to OFFERED when previous status was ACCEPTED
//   - Writes an audit_log row (action = 'courier.reassign')
//   - Best-effort push to new + old courier
//
// Returns: { order_id, previous_courier_id, new_courier_id, status }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit';
import { notifyCourierUser } from '@/lib/courier-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  courier_order_id: z.string().uuid({ message: 'courier_order_id must be a valid UUID' }),
  new_courier_user_id: z.string().uuid({ message: 'new_courier_user_id must be a valid UUID' }),
  reason: z.string().min(1, { message: 'reason must be at least 1 character' }),
});

// Statuses from which reassign is permitted. Single source of truth for BOTH
// the request validation and the UPDATE status guard below — they previously
// diverged (validation allowed PICKED_UP/IN_TRANSIT which the UPDATE guard then
// rejected, surfacing a confusing 409). Reassign is pre-pickup only: once a
// courier has the order in hand, moving it to another rider is not supported.
const REASSIGNABLE_STATUSES = ['CREATED', 'OFFERED', 'ACCEPTED'] as const;
type ReassignableStatus = (typeof REASSIGNABLE_STATUSES)[number];

function isReassignable(status: string): status is ReassignableStatus {
  return (REASSIGNABLE_STATUSES as readonly string[]).includes(status);
}

export async function POST(req: NextRequest) {
  // ── 1. Parse + validate body ────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { courier_order_id, new_courier_user_id, reason } = parsed.data;

  // ── 2. Auth ─────────────────────────────────────────────────────────────
  // Platform admin: allowed for any order, no tenant check.
  // Tenant member: allowed only if source_tenant_id matches their active tenant.
  let actorUserId: string;
  let actorEmail: string | null = null;
  let isPlatformAdmin = false;
  let callerTenantId: string | null = null;

  const adminGuard = await requirePlatformAdmin();
  if (adminGuard.ok) {
    actorUserId = adminGuard.userId;
    actorEmail = adminGuard.email;
    isPlatformAdmin = true;
  } else {
    // Try tenant-member auth
    const supa = await createServerClient();
    const {
      data: { user },
    } = await supa.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;
    actorEmail = user.email ?? null;

    // Determine which tenant the caller acts for via cookie.
    // We use the admin client to look up their membership rather than
    // re-running getActiveTenant (which throws on no-membership).
    const admin = createAdminClient();
    const { data: memberships, error: memberErr } = await admin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', actorUserId)
      .limit(1);

    if (memberErr || !memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    callerTenantId = memberships[0].tenant_id;
  }

  // ── 3. Load the courier_order ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: order, error: orderErr } = await sb
    .from('courier_orders')
    .select('id, status, assigned_courier_user_id, fleet_id, source_tenant_id')
    .eq('id', courier_order_id)
    .maybeSingle();

  if (orderErr) {
    console.error('[reassign] order fetch error', orderErr.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  // Tenant-member scope check: order must belong to their tenant.
  if (!isPlatformAdmin) {
    if (!order.source_tenant_id || order.source_tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  // ── 4. Validate current status ───────────────────────────────────────────
  if (!isReassignable(order.status)) {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: `Reassign not permitted for orders in status ${order.status}. Must be one of: ${REASSIGNABLE_STATUSES.join(', ')}`,
      },
      { status: 422 },
    );
  }

  // ── 5. Guard: same courier ────────────────────────────────────────────────
  if (order.assigned_courier_user_id === new_courier_user_id) {
    return NextResponse.json(
      { error: 'same_courier', message: 'new_courier_user_id is already assigned to this order' },
      { status: 422 },
    );
  }

  // ── 6. Validate new courier: ACTIVE + same fleet ──────────────────────────
  const { data: newCourierProfile, error: profileErr } = await sb
    .from('courier_profiles')
    .select('user_id, fleet_id, status')
    .eq('user_id', new_courier_user_id)
    .maybeSingle();

  if (profileErr) {
    console.error('[reassign] courier profile fetch error', profileErr.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!newCourierProfile) {
    return NextResponse.json({ error: 'courier_not_found' }, { status: 404 });
  }
  if (newCourierProfile.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'courier_not_active', message: 'New courier must have status ACTIVE' },
      { status: 422 },
    );
  }
  if (newCourierProfile.fleet_id !== order.fleet_id) {
    return NextResponse.json(
      { error: 'courier_wrong_fleet', message: 'New courier must belong to the same fleet as the order' },
      { status: 422 },
    );
  }

  // ── 7. Apply the reassignment ─────────────────────────────────────────────
  const previousCourierId: string | null = order.assigned_courier_user_id ?? null;
  // Reset to OFFERED only if the order was ACCEPTED (courier had taken it).
  const newStatus: string = order.status === 'ACCEPTED' ? 'OFFERED' : order.status;

  // 2026-06-15 — Status guard: only reassign if the order is still in a
  // reassignable state. Without this, a concurrent DELIVERED/CANCELLED write
  // from the courier app could be silently overwritten by this UPDATE
  // (the .eq('id', …) alone would match regardless of status).
  const { data: updated, error: updateErr } = await sb
    .from('courier_orders')
    .update({
      assigned_courier_user_id: new_courier_user_id,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courier_order_id)
    .in('status', [...REASSIGNABLE_STATUSES])
    .select('id, status, assigned_courier_user_id')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('[reassign] update error', updateErr?.message);
    // Distinguish race-lost (terminal status already reached) from a real DB error.
    if (!updateErr) {
      return NextResponse.json(
        { error: 'order_terminal', message: 'Order already delivered or cancelled.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  // ── 8. Audit log ──────────────────────────────────────────────────────────
  // Best-effort — logAudit swallows its own errors.
  const tenantIdForAudit =
    (order.source_tenant_id as string | null) ??
    callerTenantId ??
    '00000000-0000-0000-0000-000000000000';

  await logAudit({
    tenantId: tenantIdForAudit,
    actorUserId,
    action: 'courier.reassign',
    entityType: 'courier_order',
    entityId: courier_order_id,
    metadata: {
      previous_courier_id: previousCourierId,
      new_courier_id: new_courier_user_id,
      previous_status: order.status,
      new_status: newStatus,
      reason,
      actor_email: actorEmail,
      is_platform_admin: isPlatformAdmin,
    },
  });

  // ── 9. Push notifications (best-effort) ────────────────────────────────────
  void notifyCourierUser({
    courierUserId: new_courier_user_id,
    title: 'HIR Courier — Comandă reatribuită',
    body: 'Ai primit o nouă comandă spre livrare.',
  });

  if (previousCourierId && previousCourierId !== new_courier_user_id) {
    void notifyCourierUser({
      courierUserId: previousCourierId,
      title: 'HIR Courier — Comandă anulată',
      body: 'Comanda care îți era atribuită a fost reatribuită unui alt curier.',
    });
  }

  // ── 10. Response ─────────────────────────────────────────────────────────
  return NextResponse.json({
    order_id: courier_order_id,
    previous_courier_id: previousCourierId,
    new_courier_id: new_courier_user_id,
    status: newStatus,
  });
}
