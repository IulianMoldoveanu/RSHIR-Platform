// Loyalty / rewards helpers — server-only, called from order status
// transitions and from the admin settings page.

import { createAdminClient } from './supabase/admin';

type LoyaltySettings = {
  is_enabled: boolean;
  points_per_ron: number;
  ron_per_point: number;
  min_points_to_redeem: number;
  max_redemption_pct: number;
  expiry_days: number;
  welcome_bonus_points: number;
};

export async function getLoyaltySettings(
  tenantId: string,
): Promise<LoyaltySettings | null> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;
  const { data, error } = await sb
    .from('loyalty_settings')
    .select(
      'is_enabled, points_per_ron, ron_per_point, min_points_to_redeem, max_redemption_pct, expiry_days, welcome_bonus_points',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as LoyaltySettings;
}

export function computeEarnedPoints(
  totalRon: number,
  pointsPerRon: number,
): number {
  if (!Number.isFinite(totalRon) || totalRon <= 0) return 0;
  if (!Number.isFinite(pointsPerRon) || pointsPerRon <= 0) return 0;
  return Math.floor(totalRon * pointsPerRon);
}

/** Awards points to the order's customer after a DELIVERED transition.
 *  Best-effort — failures are logged but never throw (must not break the
 *  status transition). Called from the admin updateOrderStatus action.
 */
export async function awardLoyaltyForDeliveredOrder(args: {
  tenantId: string;
  orderId: string;
}): Promise<{ awarded: number } | null> {
  try {
    const settings = await getLoyaltySettings(args.tenantId);
    if (!settings || !settings.is_enabled) return null;

    const admin = createAdminClient();
    const { data: order, error: orderErr } = await admin
      .from('restaurant_orders')
      .select('id, customer_id, total_ron')
      .eq('id', args.orderId)
      .eq('tenant_id', args.tenantId)
      .maybeSingle();
    if (orderErr || !order) return null;

    const row = order as { id: string; customer_id: string | null; total_ron: number };
    if (!row.customer_id) return null;

    const points = computeEarnedPoints(Number(row.total_ron) || 0, settings.points_per_ron);
    if (points <= 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;
    const { data, error } = await sb.rpc('fn_loyalty_earn', {
      p_tenant_id: args.tenantId,
      p_customer_id: row.customer_id,
      p_order_id: args.orderId,
      p_points: points,
      p_note: 'order delivered',
    });
    if (error) {
      console.error('[loyalty] earn rpc failed', error.message);
      return null;
    }
    return { awarded: points };
  } catch (err) {
    console.error('[loyalty] award failed', (err as Error).message);
    return null;
  }
}
