import 'server-only';
import { cache } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Count of non-cancelled orders for this tenant created today (server-local
 * day boundary). Used by the storefront hero to render a "🔥 X comenzi azi"
 * social-proof pill (Feature S2).
 *
 * Wrapped in React.cache() so the same render tree pulls it once even if
 * multiple components ask. Cache scope is per-request.
 */
export const getTodayOrderCount = cache(async (tenantId: string): Promise<number> => {
  const supabase = getSupabase();
  // Start-of-day in UTC. Acceptable for our RO tenants — created_at is
  // stored UTC; a 3-hour offset just means the counter rolls at 3am local
  // instead of midnight, which is fine for a "today" social-proof pill.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('restaurant_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfDay.toISOString())
    .neq('status', 'CANCELLED')
    .in('payment_status', ['PAID', 'UNPAID']);

  if (error || count === null) return 0;
  return count;
});
