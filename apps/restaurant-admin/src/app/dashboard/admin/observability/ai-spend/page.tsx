// HIR F6 — platform-admin observability for AI spend (agent cost ledger).
//
// Reads `public.v_tenant_monthly_ai_spend` for the current calendar month.
// Two sections:
//   1) Per-agent totals (across all tenants) — quick "where is the money
//      going" answer.
//   2) Per-tenant chart (table with bars rendered in CSS, not a JS chart
//      library — keeps the page server-rendered and dependency-free).
//
// Auth: platform-admin allow-list (HIR_PLATFORM_ADMIN_EMAILS) — same gate
// as /dashboard/admin/observability/function-runs.

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const dynamic = 'force-dynamic';

type ViewRow = {
  tenant_id: string;
  agent_name: string;
  month: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number | string;
  call_count: number;
};

type TenantRow = { id: string; name: string };

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function currentMonthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function AiSpendPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor HIR.
      </div>
    );
  }

  const admin = createAdminClient();
  const monthStart = currentMonthStartIso();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spendRes: any = await (admin as any)
    .from('v_tenant_monthly_ai_spend')
    .select('tenant_id, agent_name, month, input_tokens, output_tokens, cost_cents, call_count')
    .gte('month', monthStart)
    .order('cost_cents', { ascending: false })
    .limit(500);
  const rows: ViewRow[] = (spendRes?.data as ViewRow[] | null) ?? [];

  // Resolve tenant names for the IDs we observed.
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenant_id)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantsRes: any = tenantIds.length
    ? await (admin as any).from('tenants').select('id, name').in('id', tenantIds)
    : { data: [] };
  const nameById = new Map<string, string>(
    ((tenantsRes?.data as TenantRow[] | null) ?? []).map((t) => [t.id, t.name]),
  );

  // Aggregate per-agent totals (across all tenants).
  const byAgent = new Map<string, { cost: number; calls: number; inTok: number; outTok: number }>();
  for (const r of rows) {
    const cost = Number(r.cost_cents ?? 0);
    const cur = byAgent.get(r.agent_name) ?? { cost: 0, calls: 0, inTok: 0, outTok: 0 };
    cur.cost += cost;
    cur.calls += Number(r.call_count ?? 0);
    cur.inTok += Number(r.input_tokens ?? 0);
    cur.outTok += Number(r.output_tokens ?? 0);
    byAgent.set(r.agent_name, cur);
  }
  const agentAgg = Array.from(byAgent.entries())
    .map(([agent_name, v]) => ({ agent_name, ...v }))
    .sort((a, b) => b.cost - a.cost);
  const totalCost = agentAgg.reduce((s, a) => s + a.cost, 0);

  // Aggregate per-tenant totals.
  const byTenant = new Map<string, { cost: number; calls: number }>();
  for (const r of rows) {
    const cost = Number(r.cost_cents ?? 0);
    const cur = byTenant.get(r.tenant_id) ?? { cost: 0, calls: 0 };
    cur.cost += cost;
    cur.calls += Number(r.call_count ?? 0);
    byTenant.set(r.tenant_id, cur);
  }
  const tenantAgg = Array.from(byTenant.entries())
    .map(([tenant_id, v]) => ({ tenant_id, name: nameById.get(tenant_id) ?? tenant_id, ...v }))
    .sort((a, b) => b.cost - a.cost);
  const maxTenantCost = tenantAgg[0]?.cost ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Cost AI — luna curentă
        </h1>
        <p className="text-sm text-zinc-600">
          Spend AI per tenant și per agent pentru luna calendaristică în curs.
          Sursa: <code className="rounded bg-zinc-100 px-1">v_tenant_monthly_ai_spend</code> peste{' '}
          <code className="rounded bg-zinc-100 px-1">agent_cost_ledger</code>.
        </p>
        <p className="mt-2 text-sm font-medium text-zinc-900">
          Total platformă: <span className="font-semibold">{fmtUsd(totalCost)}</span>
          {' '}— {tenantAgg.length} tenant{tenantAgg.length === 1 ? '' : 's'}, {rows.reduce((s, r) => s + Number(r.call_count ?? 0), 0)} apeluri.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          Nicio cheltuială AI înregistrată în luna curentă.
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Spend pe agent (luna curentă)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Apeluri</th>
                  <th className="px-3 py-2">Tokens in</th>
                  <th className="px-3 py-2">Tokens out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {agentAgg.map((a) => (
                  <tr key={a.agent_name} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-zinc-900">{a.agent_name}</td>
                    <td className="px-3 py-2 text-zinc-700">{fmtUsd(a.cost)}</td>
                    <td className="px-3 py-2 text-zinc-700">{a.calls}</td>
                    <td className="px-3 py-2 text-zinc-700">{a.inTok.toLocaleString('ro-RO')}</td>
                    <td className="px-3 py-2 text-zinc-700">{a.outTok.toLocaleString('ro-RO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Spend pe tenant (luna curentă)
            </h2>
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Tenant</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Apeluri</th>
                    <th className="px-3 py-2 w-1/3">Distribuție</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {tenantAgg.map((t) => {
                    const pct = maxTenantCost > 0 ? Math.max(2, Math.round((t.cost / maxTenantCost) * 100)) : 0;
                    return (
                      <tr key={t.tenant_id} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 font-medium text-zinc-900">{t.name}</td>
                        <td className="px-3 py-2 text-zinc-700">{fmtUsd(t.cost)}</td>
                        <td className="px-3 py-2 text-zinc-700">{t.calls}</td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${pct}%` }}
                              aria-label={`${pct}% din maximul lunii`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
