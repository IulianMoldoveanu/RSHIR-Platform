// Pre-orders dashboard — minimal slice (V1).
// Lists all is_pre_order=true rows for the active tenant, sorted by
// scheduled_for. Status transitions reuse the existing /dashboard/orders
// server action (status machine is identical — pre-orders flow through
// PENDING → CONFIRMED → ... → DELIVERED).
//
// Calendar / Hepy intent / 24h-before reminder cron deferred to follow-up
// lane (live-prod cron requires explicit Iulian sign-off).

import Link from 'next/link';
import { CalendarClock, Settings as SettingsIcon } from 'lucide-react';
import { EmptyState } from '@hir/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { readPreOrderSettings } from './settings';
import { PreOrderRow } from './row';
import { PreOrderSettingsCard } from './settings-card';

export const dynamic = 'force-dynamic';

type PreOrderListRow = {
  id: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  total_ron: number | string;
  notes: string | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

export default async function PreOrdersPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();

  // Fetch tenant settings + two SEPARATE pre-order queries in parallel:
  // upcoming and history. Codex P2 catch — a single LIMIT-100 query sorted by
  // scheduled_for would be starved of upcoming rows once a tenant accumulates
  // 100+ delivered/cancelled pre-orders with old scheduled dates. Splitting
  // the query keeps each list correctly populated regardless of history size.
  // Cast through unknown — is_pre_order/scheduled_for ship post-merge in
  // 20260609_001 and supabase-types regenerates after.
  type PreOrderQuery = {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            in: (col: string, vals: string[]) => {
              order: (
                col: string,
                opts: { ascending: boolean; nullsFirst?: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: PreOrderListRow[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
            not: (col: string, op: string, vals: string) => {
              order: (
                col: string,
                opts: { ascending: boolean; nullsFirst?: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: PreOrderListRow[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
  const adminQ = admin as unknown as PreOrderQuery;
  const SELECT =
    'id, status, scheduled_for, created_at, total_ron, notes, customers(first_name, last_name, phone)';
  const TERMINAL = ['DELIVERED', 'CANCELLED'];

  const [tenantRow, upcomingRaw, historyRaw] = await Promise.all([
    admin.from('tenants').select('settings').eq('id', tenant.id).maybeSingle(),
    adminQ
      .from('restaurant_orders')
      .select(SELECT)
      .eq('tenant_id', tenant.id)
      .eq('is_pre_order', true)
      .not('status', 'in', `(${TERMINAL.join(',')})`)
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .limit(100),
    adminQ
      .from('restaurant_orders')
      .select(SELECT)
      .eq('tenant_id', tenant.id)
      .eq('is_pre_order', true)
      .in('status', TERMINAL)
      .order('scheduled_for', { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const settings = readPreOrderSettings(tenantRow.data?.settings);
  const upcoming = upcomingRaw?.data ?? [];
  const history = historyRaw?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Pre-comenzi
        </h1>
        <p className="max-w-3xl text-sm text-zinc-600">
          Comenzi în avans (catering, evenimente, comenzi pentru o anumită zi).
          Pagina publică pentru clienți:{' '}
          <a
            href="/pre-comanda"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-purple-700 hover:underline"
          >
            /pre-comanda
          </a>
          .
        </p>
      </header>

      {role !== 'OWNER' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot modifica setările
          pre-comenzilor. Puteți vedea și actualiza statusul comenzilor existente.
        </div>
      ) : (
        <PreOrderSettingsCard tenantId={tenant.id} settings={settings} />
      )}

      <section>
        <header className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-zinc-900">Programate</h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
            {upcoming.length}
          </span>
        </header>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nicio pre-comandă programată"
            description={
              settings.enabled
                ? 'Când un client trimite o pre-comandă, va apărea aici.'
                : 'Activați pre-comenzile din panoul de mai sus pentru a accepta rezervări online.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((r) => (
              <PreOrderRow key={r.id} row={r} tenantId={tenant.id} />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <header className="mb-3 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-700">Istoric</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {history.length}
            </span>
          </header>
          <ul className="flex flex-col gap-2 opacity-80">
            {history.map((r) => (
              <PreOrderRow key={r.id} row={r} tenantId={tenant.id} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Tranzițiile de status (Confirmare → Pregătire → Gata → Livrată) folosesc
        același flux ca la pagina{' '}
        <Link href="/dashboard/orders" className="text-purple-700 hover:underline">
          Comenzi
        </Link>
        .
      </p>
    </div>
  );
}
