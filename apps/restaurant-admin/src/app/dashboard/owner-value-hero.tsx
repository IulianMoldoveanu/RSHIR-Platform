import { ShieldCheck, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

// Hero panel that frames the entire dashboard around HIR's commercial pitch:
// "you kept 100% of your revenue; on Wolt/Glovo you'd have lost ~30%".
// 30% matches Glovo's standard merchant rate for new RO clients in 2026
// (legacy contracts sat at 25%); Wolt's RO range is 25–30%. Using the
// upper end is honest with new clients onboarded after the rate hike.

const AGGREGATOR_COMMISSION_RATE = 0.3;

type Stats = {
  monthSalesRon: number;
  monthOrders: number;
  weekSalesRon: number;
};

async function loadStats(tenantId: string): Promise<Stats> {
  const admin = createAdminClient();
  const now = Date.now();
  const monthStart = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [monthQ, weekQ] = await Promise.all([
    admin
      .from('restaurant_orders')
      .select('total_ron, status')
      .eq('tenant_id', tenantId)
      .gte('created_at', monthStart)
      .neq('status', 'CANCELLED'),
    admin
      .from('restaurant_orders')
      .select('total_ron, status')
      .eq('tenant_id', tenantId)
      .gte('created_at', weekStart)
      .neq('status', 'CANCELLED'),
  ]);

  const sumRon = (rows: Array<{ total_ron: number | string | null }> | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.total_ron ?? 0), 0);

  return {
    monthSalesRon: sumRon(monthQ.data),
    monthOrders: (monthQ.data ?? []).length,
    weekSalesRon: sumRon(weekQ.data),
  };
}

function formatRon(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} RON`;
}

function formatRonShort(n: number): string {
  if (n >= 10000) {
    return `${(n / 1000).toFixed(1).replace('.', ',')}k RON`;
  }
  return formatRon(n);
}

export async function OwnerValueHero({ tenantId }: { tenantId: string }) {
  const s = await loadStats(tenantId);
  const aggregatorWouldHaveTaken = s.monthSalesRon * AGGREGATOR_COMMISSION_RATE;
  const hasActivity = s.monthOrders > 0;

  return (
    <section
      aria-label="Valoare HIR vs agregator"
      className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40"
    >
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Comision economisit (30 zile)
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-800 sm:text-4xl">
            {hasActivity ? formatRonShort(aggregatorWouldHaveTaken) : '—'}
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            {hasActivity ? (
              <>
                Pe Wolt sau Glovo, comisionul de ~30% pe{' '}
                <span className="font-mono tabular-nums">{formatRonShort(s.monthSalesRon)}</span>{' '}
                vânzări ar fi însemnat banii ăștia. Pe HIR ai plătit doar tariful flat per livrare.
              </>
            ) : (
              <>
                Aici vei vedea câți bani economisești pe HIR vs Wolt/Glovo (~30% comision agregator)
                de îndată ce primești prima comandă.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col justify-end gap-1.5 border-t border-emerald-100 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Vânzări 30z
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
              {formatRonShort(s.monthSalesRon)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Vânzări 7z
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
              {formatRonShort(s.weekSalesRon)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Comenzi 30z
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-zinc-900">
              {s.monthOrders}
            </span>
          </div>
        </div>
      </div>
      {hasActivity && (
        <div className="flex items-center gap-2 border-t border-emerald-100 bg-emerald-50/80 px-5 py-2 text-xs text-emerald-900">
          <TrendingUp className="h-3.5 w-3.5 flex-none text-emerald-600" aria-hidden />
          <p>
            HIR îți păstrează venitul, agregatorii îți iau o felie din fiecare comandă. La volumul
            lunii curente, asta înseamnă{' '}
            <span className="font-semibold">{formatRonShort(aggregatorWouldHaveTaken)}</span> care
            au rămas la tine.
          </p>
        </div>
      )}
    </section>
  );
}
