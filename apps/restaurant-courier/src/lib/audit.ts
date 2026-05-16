/**
 * Audit-log helper for the courier app.
 *
 * Writes to the shared `audit_log` table via the service-role client.
 * Mirrors `apps/restaurant-admin/src/lib/audit.ts` but adds courier-specific
 * tenant derivation logic because a courier serves orders across multiple
 * fleets and may not have a direct tenant context.
 *
 * CONTRACT
 * --------
 * - Call `logAudit(args)` from any server action or API route that mutates
 *   data with compliance relevance (order status changes, fleet admin ops,
 *   earnings exports). Never call from client components.
 * - Failures are swallowed — auditing must never block the user action.
 *   A failed insert is logged to stderr and discarded.
 * - `tenantId` is optional. When omitted, it is derived from the
 *   `courier_orders.source_tenant_id` column (preferred fast path) or the
 *   two-hop `courier_orders → restaurant_orders.tenant_id` chain (legacy
 *   fallback for older rows). Pharma orders and fleet-level events that have
 *   no Supabase tenant are intentionally skipped (logged at console.info,
 *   not console.warn, so CI stays quiet).
 *
 * METADATA stored per row
 * -----------------------
 * `ip`         — first value of `x-forwarded-for` header, or `x-real-ip`
 * `user_agent` — truncated to 200 chars
 * plus any caller-supplied `metadata` fields (order ids, amounts, etc.)
 *
 * ACTIONS — see `CourierAuditAction` union for the full list. Naming
 * convention: `<noun>.<verb>` in snake_case (e.g. `fleet.courier_invited`,
 * `order.cash_collected`).
 */

import { headers } from 'next/headers';
import { createAdminClient } from './supabase/admin';

export type CourierAuditAction =
  | 'fleet.created'
  | 'fleet.updated'
  | 'fleet.activated'
  | 'fleet.deactivated'
  | 'fleet.courier_invited'
  | 'fleet.api_key_created'
  | 'fleet.api_key_revoked'
  | 'fleet.settings_updated'
  | 'fleet.order_assigned'
  | 'fleet.order_unassigned'
  | 'fleet.courier_suspended'
  | 'fleet.courier_reactivated'
  | 'fleet.order_auto_assigned'
  | 'fleet.courier_self_invited'
  | 'fleet.courier_note_updated'
  | 'fleet.bulk_auto_assigned'
  | 'order.cash_collected'
  | 'order.force_cancelled_by_courier'
  | 'delivery.geofence_warning'
  | 'pharma.callback_sent'
  | 'earnings.exported';

async function deriveTenantId(
  admin: ReturnType<typeof createAdminClient>,
  entityType: string | undefined,
  entityId: string | undefined,
): Promise<{ tenantId: string | null; reason: 'derived' | 'pharma' | 'no_tenant' | 'not_courier_order' }>
{
  if (entityType !== 'courier_order' || !entityId) {
    return { tenantId: null, reason: 'not_courier_order' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  // Single SELECT for the three columns we care about. Cheaper than the
  // previous two-hop courier_orders → restaurant_orders chain when the
  // tenant is already on the courier_orders row, AND correctly handles
  // EXTERNAL_API restaurant orders (which set source_tenant_id but have
  // no restaurant_order_id).
  const { data: order } = await sb
    .from('courier_orders')
    .select('source_tenant_id, restaurant_order_id, vertical')
    .eq('id', entityId)
    .maybeSingle();
  const row = order as {
    source_tenant_id: string | null;
    restaurant_order_id: string | null;
    vertical: 'restaurant' | 'pharma' | null;
  } | null;
  if (!row) return { tenantId: null, reason: 'no_tenant' };

  // Preferred path: tenant is denormalised onto the courier_orders row.
  // Works for HIR_TENANT + EXTERNAL_API restaurant orders that set it.
  if (row.source_tenant_id) {
    return { tenantId: row.source_tenant_id, reason: 'derived' };
  }

  // Fallback: legacy rows without source_tenant_id but with a restaurant
  // order link. Most production rows backfill source_tenant_id at insert
  // time, so this branch is rare — kept for safety on older data.
  if (row.restaurant_order_id) {
    const { data: ro } = await sb
      .from('restaurant_orders')
      .select('tenant_id')
      .eq('id', row.restaurant_order_id)
      .maybeSingle();
    const tenantId =
      (ro as { tenant_id: string | null } | null)?.tenant_id ?? null;
    if (tenantId) return { tenantId, reason: 'derived' };
  }

  // Pharma orders live on the Neon-side pharma backend; they have no
  // Supabase tenants(id) to attribute the courier event to. The audit row
  // is intentionally skipped (no spam in CI logs) but flagged distinctly
  // so platform observability can still count pharma-side activity.
  if (row.vertical === 'pharma') return { tenantId: null, reason: 'pharma' };

  return { tenantId: null, reason: 'no_tenant' };
}

export async function logAudit(args: {
  actorUserId: string;
  action: CourierAuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Optional override; when omitted we derive from the courier_order → restaurant_orders chain. */
  tenantId?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    let tenantId: string | null = args.tenantId ?? null;
    let reason: 'derived' | 'pharma' | 'no_tenant' | 'not_courier_order' | 'override' = 'override';
    if (!tenantId) {
      const result = await deriveTenantId(admin, args.entityType, args.entityId);
      tenantId = result.tenantId;
      reason = result.reason;
    }
    if (!tenantId) {
      // No tenant context derivable. Three legit reasons:
      //   pharma            — courier event for a pharma order; tenant lives
      //                       in Neon, audit row intentionally skipped.
      //   not_courier_order — fleet-level admin event (no per-tenant scope).
      //   no_tenant         — restaurant order without source_tenant_id and
      //                       no restaurant_order_id link; usually a data
      //                       bug, worth a louder warn.
      // Pharma + fleet-level are *expected* drops, so log at debug-info
      // weight — they're not failures, just out-of-scope for audit_log.
      // Genuine data-bug case keeps a warn so CI surfaces it.
      const logFn = reason === 'no_tenant' ? console.warn : console.info;
      logFn(
        '[courier-audit] skip',
        JSON.stringify({
          reason,
          action: args.action,
          entityType: args.entityType ?? null,
          entityId: args.entityId ?? null,
        }),
      );
      return;
    }
    // Capture IP + UA from request headers. audit_log has no dedicated columns
    // for these, so they're merged into metadata for forensic use.
    // headers() is async in Next 15; failures are swallowed — same contract as
    // the rest of this helper.
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip =
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        h.get('x-real-ip') ??
        null;
      const rawUa = h.get('user-agent');
      userAgent = rawUa ? rawUa.slice(0, 200) : null;
    } catch {
      // Not available (e.g. called from a cron job or test environment).
    }

    const enrichedMetadata: Record<string, unknown> = {
      ...(args.metadata ?? {}),
      ...(ip !== null ? { ip } : {}),
      ...(userAgent !== null ? { user_agent: userAgent } : {}),
    };

    // audit_log may not be in generated types yet; cast through unknown.
    const sb = admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await sb.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: args.actorUserId,
      action: args.action,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      metadata: Object.keys(enrichedMetadata).length > 0 ? enrichedMetadata : null,
    });
    if (error) {
      console.error('[courier-audit] insert failed', args.action, error.message);
    }
  } catch (e) {
    console.error('[courier-audit] threw', args.action, e);
  }
}
