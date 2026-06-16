// /casual-dashboard — minimal home for CASUAL tenants.
//
// Stream UI-2 — pairs with /casual-signup wizard and the
// casual-vendor-signup edge function. Differs from /dashboard:
//   - No analytics, no Hepi, no orders chrome.
//   - Single CTA: "Publică o cerere nouă" → /marketplace/listings/new
//     (gated on active/trial subscription).
//   - Subscription banner: status + days remaining + upgrade CTA.
//   - Manual-verification banner when tenants.status='ONBOARDING'.
//
// Feature flag gate: HIR_FEATURE_CASUAL_VENDOR_ENABLED. Page calls notFound()
// when off.
//
// Eligibility:
//   - Caller must be authenticated.
//   - Caller must be tenant_member(OWNER) of at least one CASUAL tenant.
//   - If they only own FULL tenants, bounce them to /dashboard (the regular
//     surface) — this page is irrelevant for them.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard vendor ocazional — HIR Marketplace',
  robots: 'noindex,nofollow',
};

type CasualTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown> | null;
};

type SubscriptionView = {
  id: string;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  activeUntil: string; // YYYY-MM-DD
  planTier: string;
  planPriceRon: number;
  planDisplayName: string;
  maxListingsPerMonth: number | null;
  listingsUsedThisMonth: number;
};

function daysUntil(dateIso: string): number {
  const target = new Date(`${dateIso}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((target - now) / 86_400_000));
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function CasualDashboardPage(props: {
  searchParams: Promise<{ created?: string }>;
}): Promise<JSX.Element> {
  if (process.env.HIR_FEATURE_CASUAL_VENDOR_ENABLED !== 'true') notFound();

  const sp = await props.searchParams;
  const justCreated = sp.created === '1';

  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect('/login?next=/casual-dashboard');

  const admin = createAdminClientUntyped();

  // ── 1. Find CASUAL tenants where caller is OWNER ─────────────────────
  const { data: memberRows, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id, role, tenants:tenants(id, name, slug, status, settings, tenant_kind)')
    .eq('user_id', user.id)
    .eq('role', 'OWNER');

  if (memberErr) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Eroare la încărcarea contului: {memberErr.message}
        </div>
      </main>
    );
  }

  type MemberRow = {
    tenant_id: string;
    role: string;
    tenants: {
      id: string;
      name: string;
      slug: string;
      status: string;
      settings: Record<string, unknown> | null;
      tenant_kind: string;
    } | null;
  };

  const typedRows = (memberRows ?? []) as MemberRow[];
  const casualTenants: CasualTenant[] = typedRows
    .map((row) => row.tenants)
    .filter(
      (t): t is NonNullable<MemberRow['tenants']> =>
        Boolean(t && t.tenant_kind === 'CASUAL'),
    )
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      settings: t.settings,
    }));

  // Not a CASUAL owner at all → bounce to the regular dashboard. The dashboard
  // layout will then route them appropriately (FULL tenant, fleet, etc).
  if (casualTenants.length === 0) {
    redirect('/dashboard');
  }

  // First CASUAL tenant — multi-tenant CASUAL is rare (a fresh signup creates
  // one); a future picker can extend this if needed.
  const tenant = casualTenants[0];

  // ── 2. Load active subscription + plan + listing count ───────────────
  const { data: subRow } = await admin
    .from('tenant_subscriptions')
    .select(
      'id, status, active_until, plan_id, ' +
        'subscription_plans:subscription_plans(tier_code, monthly_price_ron, features, max_listings_per_month)',
    )
    .eq('tenant_id', tenant.id)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  type SubRowShape = {
    id: string;
    status: string;
    active_until: string;
    plan_id: string;
    subscription_plans: {
      tier_code: string;
      monthly_price_ron: number;
      features: Record<string, unknown> | null;
      max_listings_per_month: number | null;
    } | null;
  };

  // Count listings published this calendar month so the banner shows usage.
  // marketplace_listings is the canonical table (migration 20260616_006).
  const monthStart = startOfMonthIso();
  let listingsUsed = 0;
  try {
    const { count } = await admin
      .from('marketplace_listings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_tenant_id', tenant.id)
      .gte('created_at', monthStart);
    listingsUsed = count ?? 0;
  } catch {
    // marketplace_listings may not yet be present in some envs — fall through
    // with listingsUsed=0 rather than failing the dashboard render.
    listingsUsed = 0;
  }

  let subscription: SubscriptionView | null = null;
  const subRowTyped = subRow as SubRowShape | null;
  if (subRowTyped && subRowTyped.subscription_plans) {
    const plan = subRowTyped.subscription_plans;
    const features = plan.features ?? {};
    const displayName =
      typeof features.display_name === 'string' ? features.display_name : plan.tier_code;
    const statusNarrow: SubscriptionView['status'] =
      subRowTyped.status === 'active' ||
      subRowTyped.status === 'trial' ||
      subRowTyped.status === 'expired' ||
      subRowTyped.status === 'cancelled'
        ? subRowTyped.status
        : 'expired';
    subscription = {
      id: subRowTyped.id,
      status: statusNarrow,
      activeUntil: subRowTyped.active_until,
      planTier: plan.tier_code,
      planPriceRon: plan.monthly_price_ron,
      planDisplayName: displayName,
      maxListingsPerMonth: plan.max_listings_per_month,
      listingsUsedThisMonth: listingsUsed,
    };
  }

  const subscriptionActive =
    subscription !== null && (subscription.status === 'active' || subscription.status === 'trial');

  const isPendingVerification = tenant.status === 'ONBOARDING';
  const isSuspended = tenant.status === 'SUSPENDED';
  const canPublish = subscriptionActive && !isSuspended && !isPendingVerification;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      {/* Minimal nav — no Hepi, no analytics, no orders. */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
            HIR Marketplace · Vendor ocazional
          </p>
          <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">{tenant.name}</h1>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/marketplace/listings"
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Cererile mele
          </Link>
          <Link
            href="/dashboard/settings"
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Setări cont
          </Link>
        </nav>
      </header>

      {justCreated && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Înregistrare reușită ✓</p>
          <p className="mt-0.5">
            Contul tău este în verificare manuală. De obicei durează sub 24h
            lucrătoare; primești email când e gata.
          </p>
        </div>
      )}

      {isPendingVerification && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Cont în verificare</p>
          <p className="mt-0.5">
            Echipa HIR verifică datele firmei tale. Vei putea publica cereri
            după ce contul este aprobat.
          </p>
        </div>
      )}

      {isSuspended && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">Cont suspendat</p>
          <p className="mt-0.5">
            Contul tău a fost suspendat. Contactează echipa HIR pentru detalii.
          </p>
        </div>
      )}

      {/* ── Subscription banner ───────────────────────────────────────── */}
      <section
        className={
          'mb-5 rounded-lg border p-4 sm:p-5 ' +
          (subscriptionActive
            ? 'border-purple-200 bg-purple-50'
            : 'border-rose-200 bg-rose-50')
        }
      >
        {subscription ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                Plan {subscription.planDisplayName}
                {subscription.status === 'trial' ? ' · Trial' : ''}
              </p>
              <p className="mt-1 text-sm text-zinc-800">
                Activ până la <strong>{subscription.activeUntil}</strong> ({daysUntil(subscription.activeUntil)} zile rămase)
              </p>
              <p className="mt-0.5 text-sm text-zinc-700">
                Listinguri folosite luna aceasta:{' '}
                <strong>{subscription.listingsUsedThisMonth}</strong>
                {subscription.maxListingsPerMonth !== null && (
                  <> / {subscription.maxListingsPerMonth}</>
                )}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {subscription.planPriceRon} RON / lună după trial
              </p>
            </div>
            <Link
              href="/dashboard/settings"
              className="inline-flex h-9 items-center justify-center rounded-md border border-purple-300 bg-white px-4 text-sm font-medium text-purple-700 hover:bg-purple-100"
            >
              Schimbă planul
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Niciun abonament activ
            </p>
            <p className="mt-1 text-sm text-rose-800">
              Pentru a publica cereri ai nevoie de un abonament activ.
              Contactează echipa HIR pentru reactivare.
            </p>
          </div>
        )}
      </section>

      {/* ── Primary CTA — publish new listing ─────────────────────────── */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">
          Publică o cerere de livrare
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Cererea devine vizibilă pentru flotele HIR. Plătești doar atunci când
          accepți o ofertă; abonamentul îți dă acces la marketplace.
        </p>
        <div className="mt-4">
          {canPublish ? (
            <Link
              href="/marketplace/listings/new"
              className="inline-flex h-10 items-center justify-center rounded-md bg-purple-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
            >
              Publică cerere nouă
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-md bg-zinc-200 px-5 text-sm font-semibold text-zinc-500"
              title={
                isPendingVerification
                  ? 'Disponibil după aprobarea contului'
                  : isSuspended
                    ? 'Contul este suspendat'
                    : 'Necesită abonament activ'
              }
            >
              Publică cerere nouă
            </button>
          )}
          {!canPublish && (
            <p className="mt-2 text-xs text-zinc-500">
              {isPendingVerification
                ? 'Disponibil după aprobarea contului (≤24h lucrătoare).'
                : isSuspended
                  ? 'Reactivează contul pentru a publica cereri.'
                  : 'Reactivează abonamentul pentru a publica cereri.'}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
