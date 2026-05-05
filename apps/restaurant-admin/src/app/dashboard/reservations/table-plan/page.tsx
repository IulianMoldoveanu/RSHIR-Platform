import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant } from '@/lib/tenant';
import { TablePlanEditor, type TablePlan } from './editor';

export const dynamic = 'force-dynamic';

const EMPTY_PLAN: TablePlan = { tables: [] };

export default async function TablePlanPage() {
  const { tenant } = await getActiveTenant();
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any;

  const { data: row } = await sb
    .from('reservation_settings')
    .select('table_plan, show_table_plan_to_customers, is_enabled')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  const plan: TablePlan = (row?.table_plan as TablePlan | null) ?? EMPTY_PLAN;
  const showToCustomers: boolean = Boolean(row?.show_table_plan_to_customers);
  const reservationsEnabled: boolean = Boolean(row?.is_enabled);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Planul mesei
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Desenați aranjamentul meselor. Când e activat, clienții pot alege
            o masă specifică din formularul de rezervare.
          </p>
        </div>
        <Link
          href="/dashboard/reservations"
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← Înapoi la rezervări
        </Link>
      </div>

      {!reservationsEnabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          Sistemul de rezervări este dezactivat. Activați-l mai întâi din pagina
          Rezervări → Setări pentru ca planul mesei să fie folosit.
        </div>
      )}

      <TablePlanEditor
        tenantId={tenant.id}
        initialPlan={plan}
        initialShowToCustomers={showToCustomers}
      />
    </div>
  );
}
