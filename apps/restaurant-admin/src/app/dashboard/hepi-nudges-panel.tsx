import Link from 'next/link';
import { Sparkles, Clock, AlertTriangle } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';

type Nudge = {
  id: string;
  kind: 'stuck_in_kitchen' | 'ready_but_undispatched' | 'no_courier_yet';
  title: string;
  body: string;
  href: string;
  ageMin: number;
};

const KITCHEN_STUCK_MIN = 12;
const READY_UNDISPATCHED_MIN = 6;
const NO_COURIER_MIN = 4;

function ageMin(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export async function HepiNudgesPanel({ tenantId }: { tenantId: string }) {
  const admin = createAdminClient();

  // Open kitchen-side orders: PENDING/CONFIRMED/PREPARING/READY.
  const { data: kitchen } = await admin
    .from('restaurant_orders')
    .select('id, status, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .in('status', ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'])
    .or('is_pre_order.is.null,is_pre_order.eq.false')
    .gte('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(20);

  // DISPATCHED orders where we have not yet had a courier accept inside HIR Curier.
  const { data: dispatched } = await admin
    .from('restaurant_orders')
    .select('id, status, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'DISPATCHED')
    .gte('updated_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .order('updated_at', { ascending: true })
    .limit(10);

  // For DISPATCHED, look up linked courier_orders status. If still CREATED/OFFERED
  // after NO_COURIER_MIN minutes since dispatch, nudge.
  const dispatchedIds = (dispatched ?? []).map((r) => r.id as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courierLookup = dispatchedIds.length
    ? await (admin as any)
        .from('courier_orders')
        .select('source_order_id, status, created_at')
        .eq('source_tenant_id', tenantId)
        .eq('source_type', 'HIR_TENANT')
        .in('source_order_id', dispatchedIds)
    : { data: [] };
  const courierBySrc = new Map<string, { status: string; created_at: string }>();
  for (const r of (courierLookup.data ?? []) as Array<{
    source_order_id: string;
    status: string;
    created_at: string;
  }>) {
    courierBySrc.set(r.source_order_id, r);
  }

  const nudges: Nudge[] = [];

  for (const o of (kitchen ?? []) as Array<{ id: string; status: string; created_at: string }>) {
    const age = ageMin(o.created_at);
    if ((o.status === 'PREPARING' || o.status === 'CONFIRMED' || o.status === 'PENDING') && age >= KITCHEN_STUCK_MIN) {
      nudges.push({
        id: o.id,
        kind: 'stuck_in_kitchen',
        title: `Comanda #${shortId(o.id)} stă de ${age} min`,
        body: 'Statusul nu s-a schimbat. Vrei să o avansezi sau să verifici bucătăria?',
        href: `/dashboard/orders/${o.id}`,
        ageMin: age,
      });
    } else if (o.status === 'READY' && age >= READY_UNDISPATCHED_MIN) {
      nudges.push({
        id: o.id,
        kind: 'ready_but_undispatched',
        title: `#${shortId(o.id)} e gata de ${age} min`,
        body: 'Mâncarea răcește. Cere curier sau pregătește pickup.',
        href: `/dashboard/orders/${o.id}`,
        ageMin: age,
      });
    }
  }

  for (const o of (dispatched ?? []) as Array<{ id: string; updated_at: string }>) {
    const co = courierBySrc.get(o.id);
    if (!co) continue;
    if (co.status === 'CREATED' || co.status === 'OFFERED') {
      const age = ageMin(co.created_at);
      if (age >= NO_COURIER_MIN) {
        nudges.push({
          id: o.id,
          kind: 'no_courier_yet',
          title: `#${shortId(o.id)} fără curier de ${age} min`,
          body: 'Nimeni n-a acceptat. Sună un curier sau cere flota Iulian.',
          href: `/dashboard/orders/${o.id}`,
          ageMin: age,
        });
      }
    }
  }

  // Sort: oldest stress first; cap at 3 to avoid panic-flood.
  nudges.sort((a, b) => b.ageMin - a.ageMin);
  const top = nudges.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">Hepi te atenționează</p>
          <p className="text-[11px] text-amber-800/80">
            {top.length === 1 ? '1 comandă' : `${top.length} comenzi`} au nevoie de atenție acum.
          </p>
        </div>
      </header>
      <ul className="space-y-2">
        {top.map((n) => (
          <li key={`${n.kind}-${n.id}`}>
            <Link
              href={n.href}
              className="group flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 transition hover:border-amber-300 hover:shadow-sm"
            >
              <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-700">
                {n.kind === 'no_courier_yet' ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
                <p className="mt-0.5 text-xs text-zinc-600">{n.body}</p>
              </div>
              <span className="ml-2 self-center text-xs font-medium text-amber-700 group-hover:underline">
                Deschide →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
