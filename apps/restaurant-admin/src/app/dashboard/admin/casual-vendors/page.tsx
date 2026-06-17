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
import { PageHeader, ErrorState, EmptyMarketplaceState } from '@/app/marketplace/_components/ui';
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
  const cfg =
    status === 'ACTIVE'
      ? { label: 'Activ', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' }
      : status === 'SUSPENDED'
        ? { label: 'Suspendat', cls: 'bg-rose-100 text-rose-800 ring-rose-200' }
        : { label: 'În revizuire', cls: 'bg-amber-100 text-amber-900 ring-amber-200' };
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ' +
        cfg.cls
      }
    >
      {cfg.label}
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
      <ErrorState
        title="Acces interzis"
        description="Această pagină este rezervată administratorilor de platformă HIR."
      />
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
      <ErrorState
        title="Nu am putut încărca vendorii."
        description="Reîncarcă pagina sau revino mai târziu."
      />
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
      <PageHeader
        eyebrow="ADMIN · VENDORI OCAZIONALI"
        title={`Vendori CASUAL (${cntAll})`}
        description="Lista vendorilor înregistrați prin /casual-signup. Tab-ul „În revizuire” este coada de aprobare manuală — aprobă vendorii după ce verifici CIF + brand-ul."
      />

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <nav className="flex flex-wrap gap-1.5 border-b border-slate-200 text-sm">
        <TabLink current={tab} target="pending" label="În revizuire" count={cntPending} />
        <TabLink current={tab} target="active" label="Active" count={cntActive} />
        <TabLink current={tab} target="suspended" label="Suspendate" count={cntSuspended} />
        <TabLink current={tab} target="all" label="Toate" count={cntAll} />
      </nav>

      {tenants.length === 0 ? (
        <EmptyMarketplaceState
          title="Niciun vendor în acest tab"
          description="Vendorii noi apar aici imediat după înregistrarea prin /casual-signup."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-[#f7f0fb] text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Brand</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold">CIF</th>
                <th className="px-3 py-2.5 text-left font-semibold">Contact</th>
                <th className="px-3 py-2.5 text-left font-semibold">Abonament</th>
                <th className="px-3 py-2.5 text-left font-semibold">Înregistrat</th>
                <th className="px-3 py-2.5 text-right font-semibold">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
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
                  <tr key={t.id} className="align-top transition-colors hover:bg-[#f7f0fb]/50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[#23093a]">{t.name}</div>
                      {anafName && anafName !== t.name && (
                        <div className="text-[11px] text-slate-500">ANAF: {anafName}</div>
                      )}
                      <div className="text-[11px] text-slate-400">{t.slug}</div>
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(t.status)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-slate-700">{cif}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <div className="text-slate-700">{email}</div>
                      <div className="text-slate-500 tabular-nums">{phone}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {sub ? (
                        <>
                          <div className="font-medium text-[#23093a]">{planLabel}</div>
                          <div className="text-slate-500">
                            {sub.status} · până la {sub.active_until}
                          </div>
                          {sub.subscription_plans && (
                            <div className="text-[11px] tabular-nums text-slate-400">
                              {sub.subscription_plans.monthly_price_ron} RON/lună
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">fără abonament</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
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
        '-mb-px inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b1f8a] focus-visible:ring-offset-2 ' +
        (active
          ? 'border-[#6b1f8a] font-semibold text-[#6b1f8a]'
          : 'border-transparent text-slate-600 hover:text-slate-900')
      }
    >
      {label}
      <span
        className={
          'rounded-full px-1.5 text-[10px] font-medium tabular-nums ' +
          (active ? 'bg-[#f7f0fb] text-[#6b1f8a]' : 'bg-slate-100 text-slate-600')
        }
      >
        {count}
      </span>
    </Link>
  );
}
