// HIR Command Center — weekly Connect billing (HIR → headless tenant).
//
// Shows every weekly invoice HIR raises against a Connect tenant for the
// delivery service it provides: zone delivery fees + 2 RON/order data layer.
// Generated DRAFT by the `connect-weekly-billing` cron (Mon 03:00 UTC) or on
// demand here; operator advances DRAFT → ISSUED → PAID. Read of
// connect_tenant_invoices via service-role, platform-admin gated.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { ConnectBillingClient, type InvoiceVM } from './_client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing Connect — săptămânal',
  robots: 'noindex,nofollow',
};

export default async function ConnectBillingPage() {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/connect-billing');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: rezervat administratorilor de platformă HIR.
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  const { data: invData, error } = await sb
    .from('connect_tenant_invoices')
    .select('id, tenant_id, period_start, period_end, orders_count, delivery_fees_cents, data_fee_cents, total_cents, currency, status, issued_at, paid_at')
    .order('period_start', { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcarea facturilor Connect: {error.message}
      </div>
    );
  }

  const rows = (invData ?? []) as Array<Record<string, unknown>>;
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenant_id).filter(Boolean) as string[]));
  const nameById = new Map<string, string>();
  if (tenantIds.length) {
    const { data: tn } = await sb.from('tenants').select('id, name').in('id', tenantIds);
    for (const t of (tn ?? []) as Array<{ id: string; name: string }>) nameById.set(t.id, t.name);
  }

  const invoices: InvoiceVM[] = rows.map((r) => ({
    id: r.id as string,
    tenant: r.tenant_id ? (nameById.get(r.tenant_id as string) ?? '—') : '—',
    periodStart: r.period_start as string,
    periodEnd: r.period_end as string,
    ordersCount: Number(r.orders_count ?? 0),
    deliveryFeesCents: Number(r.delivery_fees_cents ?? 0),
    dataFeeCents: Number(r.data_fee_cents ?? 0),
    totalCents: Number(r.total_cents ?? 0),
    currency: (r.currency as string) ?? 'RON',
    status: (r.status as InvoiceVM['status']) ?? 'DRAFT',
  }));

  const draftTotal = invoices.filter((i) => i.status === 'DRAFT').reduce((s, i) => s + i.totalCents, 0);
  const issuedTotal = invoices.filter((i) => i.status === 'ISSUED').reduce((s, i) => s + i.totalCents, 0);
  const paidTotal = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.totalCents, 0);

  return (
    <ConnectBillingClient
      invoices={invoices}
      draftTotalCents={draftTotal}
      issuedTotalCents={issuedTotal}
      paidTotalCents={paidTotal}
    />
  );
}
