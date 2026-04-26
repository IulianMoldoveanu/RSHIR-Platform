import Link from 'next/link';
import { Banknote } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

// Server component. Surfaces the unpaid Cash-on-Delivery total for today
// so the operator can sanity-check the cash drawer at the end of shift.
// Renders nothing when:
//  - the payment_method column hasn't shipped yet (defensive try/fallback),
//  - or no unpaid COD orders today (don't bother the operator).

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatRon(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} RON`;
}

async function loadCodTotals(
  tenantId: string,
): Promise<{ total: number; count: number } | null> {
  const admin = createAdminClient();
  const today = startOfTodayIso();
  // payment_method column shipped in 20260504_001 — cast the filter through
  // unknown until supabase-types regenerates from the post-migration schema.
  // If the column doesn't exist yet, PostgREST returns an error and the
  // panel renders nothing (defensive, keeps the dashboard alive).
  const q = admin
    .from('restaurant_orders')
    .select('total_ron')
    .eq('tenant_id', tenantId)
    .eq('payment_status', 'UNPAID')
    .neq('status', 'CANCELLED')
    .gte('created_at', today) as unknown as {
    eq: (col: string, val: string) => Promise<{
      data: Array<{ total_ron: number | string }> | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await q.eq('payment_method', 'COD');

  // payment_method column not yet shipped (or any other error) — render nothing.
  if (error) return null;

  const rows = data ?? [];
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + Number(r.total_ron ?? 0), 0);
  return { total, count: rows.length };
}

export async function CodPendingPanel({ tenantId }: { tenantId: string }) {
  const stats = await loadCodTotals(tenantId);
  if (!stats) return null;

  return (
    <Link
      href="/dashboard/orders?filter=today"
      className="group flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 transition-colors hover:bg-emerald-100"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-600 text-white">
          <Banknote className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Cash de încasat astăzi
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-emerald-900">
            {formatRon(stats.total)}{' '}
            <span className="text-xs font-medium text-emerald-700">
              ({stats.count} {stats.count === 1 ? 'comandă' : 'comenzi'})
            </span>
          </p>
        </div>
      </div>
      <span className="text-xs font-medium text-emerald-700 group-hover:text-emerald-900">
        Vezi comenzile →
      </span>
    </Link>
  );
}
