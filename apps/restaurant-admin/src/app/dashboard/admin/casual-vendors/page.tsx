// Platform-admin oversight for CASUAL tenants.
//
// Stream UI-2 — pairs with /casual-signup wizard and the
// casual-vendor-signup edge function.
//
// Shows every CASUAL tenant with:
//   - status (ONBOARDING = pending review · ACTIVE · SUSPENDED)
//   - CIF + brand name + signup contact (email/phone) from settings JSON
//   - subscription plan + status + active_until
//   - actions: Approve (ONBOARDING → ACTIVE), Suspend (ACTIVE → SUSPENDED),
//              Restore (SUSPENDED → ACTIVE)
//
// Tabs:
//   - "Pending"   default — tenants.status = ONBOARDING
//   - "Active"    tenants.status = ACTIVE
//   - "Suspended" tenants.status = SUSPENDED
//   - "All"       no filter
//
// Internal-only — RLS-bypass via service-role client. Gated by both:
//   1. HIR_PLATFORM_ADMIN_EMAILS allow-list (matches sibling admin pages),
//   2. HIR_FEATURE_CASUAL_VENDOR_ENABLED (page calls notFound() when off).

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';
import { CasualVendorAction } from './_actions-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Vendori ocazionali — Admin',
  robots: 'noindex,nofollow',
};

type StatusTab = 'pending' | 'active' | 'suspended' | 'all';

function parseStatus(raw: string | undefined): StatusTab {
  if (raw === 'active' || raw === 'suspended' || raw === 'all') return raw;
  return 'pending';
}

function statusToDbValue(tab: StatusTab): string | null {
  switch (tab) {
    case 'pending':
      return 'ONBOARDING';
    case 'active':
      return 'ACTIVE';
    case 'suspended':
      return 'SUSPENDED';
    case 'all':
      return null;
  }
}

type CasualRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  settings: Record<string, unknown> | null;
};

type SubscriptionRow = {
  tenant_id: string;
  status: string;
  active_until: string;
  subscription_plans: {
    tier_code: string;
    monthly_price_ron: number;
    features: Record<string, unknown> | null;
  } | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function statusBadge(status: string): JSX.Element {
  const cls =
    status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'SUSPENDED'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-amber-100 text-amber-900';
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ' + cls
      }
    >
      {status}
    </span>
  );
}

export default async function CasualVendorsAdminPage(props: {
  searchParams?: Promise<{ status?: string }>;
}): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_CASUAL_VENDOR_ENABLED !== 'true') notFound();

  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/casual-vendors');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Acces interzis: această pagină este rezervată administratorilor de
        platformă HIR.
      </div>
    );
  }

  const sp = await props.searchParams;
  const tab: StatusTab = parseStatus(sp?.status);
  const dbStatus = statusToDbValue(tab);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;

  // ── 1. CASUAL tenants + selected status filter ────────────────────────
  let tenantQuery = sb
    .from('tenants')
    .select('id, name, slug, status, created_at, settings')
    .eq('tenant_kind', 'CASUAL')
    .order('created_at', { ascending: false });
  if (dbStatus) tenantQuery = tenantQuery.eq('status', dbStatus);

  const { data: tenantsRaw, error: tenantErr } = await tenantQuery.limit(500);
  if (tenantErr) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Eroare la încărcarea vendorilor: {tenantErr.message}
      </div>
    );
  }
  const tenants: CasualRow[] = (tenantsRaw ?? []) as CasualRow[];

  // ── 2. Active/trial subscriptions for those tenants ───────────────────
  const subsByTenant = new Map<string, SubscriptionRow>();
  if (tenants.length > 0) {
    const { data: subsRaw } = await sb
      .from('tenant_subscriptions')
      .select(
        'tenant_id, status, active_until, ' +
          'subscription_plans:subscription_plans(tier_code, monthly_price_ron, features)',
      )
      .in(
        'tenant_id',
        tenants.map((t) => t.id),
      )
      .in('status', ['active', 'trial']);
    for (const r of (subsRaw ?? []) as SubscriptionRow[]) {
      // Most-recent wins for multi-row tenants; the query is unordered so we
      // keep the first row per tenant.
      if (!subsByTenant.has(r.tenant_id)) subsByTenant.set(r.tenant_id, r);
    }
  }

  // ── 3. Counts for the tab headers ─────────────────────────────────────
  type CountResp = { count: number | null };
  async function countByStatus(s: string | null): Promise<number> {
    let q = sb
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_kind', 'CASUAL');
    if (s) q = q.eq('status', s);
    const { count } = (await q) as CountResp;
    return count ?? 0;
  }
  const [cntPending, cntActive, cntSuspended, cntAll] = await Promise.all([
    countByStatus('ONBOARDING'),
    countByStatus('ACTIVE'),
    countByStatus('SUSPENDED'),
    countByStatus(null),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Admin · Vendori ocazionali
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Vendori CASUAL ({cntAll})
        </h1>
        <p className="text-sm text-zinc-600">
          Lista vendorilor înregistrați prin{' '}
          <code className="rounded bg-zinc-100 px-1">/casual-signup</code>. Tab-ul
          „Pending" este coada de revizuire manuală — aprobă vendorii după ce
          verifici CIF + brand-ul.
        </p>
      </header>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <nav className="flex flex-wrap gap-1.5 border-b border-zinc-200 text-sm">
        <TabLink current={tab} target="pending" label="Pending" count={cntPending} />
        <TabLink current={tab} target="active" label="Active" count={cntActive} />
        <TabLink current={tab} target="suspended" label="Suspendate" count={cntSuspended} />
        <TabLink current={tab} target="all" label="Toate" count={cntAll} />
      </nav>

      {tenants.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
          Niciun vendor în acest tab.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Brand</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">CIF</th>
                <th className="px-3 py-2 text-left font-medium">Contact</th>
                <th className="px-3 py-2 text-left font-medium">Abonament</th>
                <th className="px-3 py-2 text-left font-medium">Înregistrat</th>
                <th className="px-3 py-2 text-right font-medium">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {tenants.map((t) => {
                const settings = t.settings ?? {};
                const cif =
                  typeof settings.casual_cui === 'string' ? settings.casual_cui : '—';
                const email =
                  typeof settings.casual_email === 'string' ? settings.casual_email : '—';
                const phone =
                  typeof settings.casual_phone === 'string' ? settings.casual_phone : '—';
                const anafName =
                  typeof settings.casual_anaf_name === 'string'
                    ? settings.casual_anaf_name
                    : null;
                const sub = subsByTenant.get(t.id);
                const planFeatures = sub?.subscription_plans?.features ?? {};
                const planLabel =
                  typeof planFeatures.display_name === 'string'
                    ? planFeatures.display_name
                    : sub?.subscription_plans?.tier_code ?? '—';
                return (
                  <tr key={t.id} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">{t.name}</div>
                      {anafName && anafName !== t.name && (
                        <div className="text-[11px] text-zinc-500">ANAF: {anafName}</div>
                      )}
                      <div className="text-[11px] text-zinc-400">{t.slug}</div>
                    </td>
                    <td className="px-3 py-2">{statusBadge(t.status)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-700">{cif}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="text-zinc-700">{email}</div>
                      <div className="text-zinc-500">{phone}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {sub ? (
                        <>
                          <div className="font-medium text-zinc-900">{planLabel}</div>
                          <div className="text-zinc-500">
                            {sub.status} · până la {sub.active_until}
                          </div>
                          {sub.subscription_plans && (
                            <div className="text-[11px] text-zinc-400">
                              {sub.subscription_plans.monthly_price_ron} RON/lună
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-400">fără abonament</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {t.status === 'ONBOARDING' && (
                          <CasualVendorAction
                            verb="approve"
                            tenantId={t.id}
                            tenantName={t.name}
                          />
                        )}
                        {t.status === 'ACTIVE' && (
                          <CasualVendorAction
                            verb="suspend"
                            tenantId={t.id}
                            tenantName={t.name}
                          />
                        )}
                        {t.status === 'SUSPENDED' && (
                          <CasualVendorAction
                            verb="restore"
                            tenantId={t.id}
                            tenantName={t.name}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabLink({
  current,
  target,
  label,
  count,
}: {
  current: StatusTab;
  target: StatusTab;
  label: string;
  count: number;
}): JSX.Element {
  const active = current === target;
  return (
    <Link
      href={`/dashboard/admin/casual-vendors?status=${target}`}
      className={
        '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ' +
        (active
          ? 'border-purple-600 font-semibold text-purple-700'
          : 'border-transparent text-zinc-600 hover:text-zinc-900')
      }
    >
      {label}
      <span
        className={
          'rounded-full px-1.5 text-[10px] font-medium ' +
          (active ? 'bg-purple-100 text-purple-700' : 'bg-zinc-100 text-zinc-600')
        }
      >
        {count}
      </span>
    </Link>
  );
}
