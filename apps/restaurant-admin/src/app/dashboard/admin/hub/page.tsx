// Platform-admin "Iulian cockpit" for RSHIR.
//
// Mirror of the HIR Pharma /admin/hub. Centralises every operator surface
// (tenants / control room / fleet managers / observability / etc.) in one
// tile grid so Iulian doesn't have to scroll through the 35-entry sidebar
// to find a page he uses once a week.
//
// Auth: gated by `HIR_PLATFORM_ADMIN_EMAILS` allow-list — same pattern as
// /dashboard/admin/control-room. Unauthenticated → redirect to /login;
// authenticated-but-not-admin → access-denied panel.
//
// Live tile "Iulian last 24h" pulls a few aggregate counts (orders, new
// tenants, open ops alerts). Counts are cheap — single COUNT queries
// scoped by created_at >= now() - 24h. If any query errors, that count
// renders as "—" rather than failing the whole page.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdminEmail } from '@/lib/auth/platform-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'RSHIR — Admin Hub',
  description: 'Cockpit central pentru toate operațiunile RSHIR.',
  robots: 'noindex,nofollow',
};

type Tile = {
  label: string;
  href: string;
  external?: boolean;
  description: string;
  tone?: 'emerald' | 'violet' | 'amber' | 'slate';
};

// Infra IDs (Sentry, Vercel, Railway) — env-overridable so staging vs
// prod can point at different dashboards. Defaults match current prod.
const SENTRY_ORG_URL =
  process.env.NEXT_PUBLIC_HUB_SENTRY_URL ??
  'https://hirbuild-your-dreams.sentry.io/issues/?statsPeriod=24h';
const VERCEL_TEAM_URL =
  process.env.NEXT_PUBLIC_HUB_VERCEL_TEAM_URL ??
  'https://vercel.com/iulianmoldoveanus-projects';
const PHARMA_HUB_URL =
  process.env.NEXT_PUBLIC_HUB_PHARMA_URL ?? 'https://hirpharma.ro/admin/hub';
const PHARMA_API_STATUS_URL =
  process.env.NEXT_PUBLIC_HUB_PHARMA_API_STATUS_URL ??
  'https://pharmacy-api-production-baa6.up.railway.app/api/status';
const COURIER_PWA_URL =
  process.env.NEXT_PUBLIC_HUB_COURIER_URL ?? 'https://courier-beta-seven.vercel.app';

const RSHIR_TILES: Tile[] = [
  {
    label: 'Comenzi (cross-vertical)',
    href: '/dashboard/admin/orders',
    description: 'Toate livrările — restaurant + farmacie — pe flote, orașe și status, într-un singur loc.',
    tone: 'emerald',
  },
  {
    label: 'Tenants / Vendori',
    href: '/dashboard/admin/tenants',
    description: 'Toți vendorii — status, oraș, integrări, comenzi 7z.',
    tone: 'emerald',
  },
  {
    label: 'Control Room',
    href: '/dashboard/admin/control-room',
    description: 'Live ops: curieri activi, comenzi în curs, alerte cross-system.',
    tone: 'emerald',
  },
  {
    label: 'Fleet Managers',
    href: '/dashboard/admin/fleet-managers',
    description: 'Membri-flotă per tenant, invitații, payouts.',
    tone: 'emerald',
  },
  {
    label: 'Alocare flote',
    href: '/dashboard/admin/fleet-allocation',
    description: 'Mapare tenant ↔ flotă (primară + fallback).',
    tone: 'emerald',
  },
  {
    label: 'Orașe (events)',
    href: '/dashboard/admin/cities/events',
    description: 'Activări per oraș + announcement events.',
    tone: 'emerald',
  },
  {
    label: 'Onboard tenant nou',
    href: '/dashboard/admin/onboard',
    description: 'Wizard onboarding clasic SaaS (storefront propriu).',
    tone: 'violet',
  },
  {
    label: 'Onboard HIR Connect',
    href: '/dashboard/admin/onboard/connect',
    description: 'Tenant headless (site propriu + servicii HIR).',
    tone: 'violet',
  },
  {
    label: 'Onboard locație nouă (brand)',
    href: '/dashboard/admin/onboard/sibling',
    description: 'A doua locație pentru un brand existent (clonează meniu).',
    tone: 'violet',
  },
  {
    label: 'Support / Feedback',
    href: '/dashboard/admin/support',
    description: 'Tichete + feedback vendor.',
    tone: 'amber',
  },
  {
    label: 'Aplicații reseller',
    href: '/dashboard/admin/affiliates',
    description: 'Cereri reseller noi + stats champion-uri.',
    tone: 'amber',
  },
  {
    label: 'Parteneri reseller',
    href: '/dashboard/admin/partners',
    description: 'Comisioane v3, settlement, payout.',
    tone: 'amber',
  },
  {
    label: 'Intent registry',
    href: '/dashboard/admin/intents',
    description: 'AI intents recunoscute + fallback log.',
    tone: 'amber',
  },
  {
    label: 'Incidente /status',
    href: '/dashboard/admin/incidents',
    description: 'Postare/închidere incidente publice pe /status.',
    tone: 'amber',
  },
  {
    label: 'Vizualizări materializate',
    href: '/dashboard/admin/observability/materialized-views',
    description: 'Refresh + lag pentru MV (analytics).',
    tone: 'slate',
  },
  {
    label: 'Edge Functions runs',
    href: '/dashboard/admin/observability/function-runs',
    description: 'Cron + edge-function execution log (fail/ok).',
    tone: 'slate',
  },
  {
    label: 'AI spend',
    href: '/dashboard/admin/observability/ai-spend',
    description: 'Tokens + cost per tenant (Anthropic).',
    tone: 'slate',
  },
  {
    label: 'Audit integrity',
    href: '/dashboard/admin/observability/audit-integrity',
    description: 'Hash-chain verification pentru audit_log.',
    tone: 'slate',
  },
  {
    label: 'Sentry · sistem',
    href: '/dashboard/admin/system',
    description: 'Erori live per app + alertă history.',
    tone: 'slate',
  },
  {
    label: 'Content OS (HIR_INTERNAL)',
    href: '/dashboard/content',
    description: 'Marketing AI content pipeline — brand intern HIR.',
    tone: 'violet',
  },
];

const CROSS_PROJECT: Tile[] = [
  {
    label: 'Verificări curieri + flote (KYC/KYF)',
    href: `${COURIER_PWA_URL.replace(/\/$/, '')}/admin/verifications`,
    external: true,
    description: 'Coadă PENDING: aprobă/respinge identitate curieri + legitimitate flote.',
    tone: 'amber',
  },
  {
    label: 'Flote + alocare (app curier)',
    href: `${COURIER_PWA_URL.replace(/\/$/, '')}/admin/fleets`,
    external: true,
    description: 'Flote: prefix, validare, porți KYC/KYF, roster, API keys.',
    tone: 'violet',
  },
  {
    label: 'HIR Pharma — Admin Hub',
    href: PHARMA_HUB_URL,
    external: true,
    description: 'Cockpitul echivalent pentru farmacie (Neon + Railway).',
    tone: 'violet',
  },
  {
    label: 'HIR Curier (PWA)',
    href: COURIER_PWA_URL,
    external: true,
    description: 'App curier — accept/reject ofertă, on-route tracking.',
    tone: 'violet',
  },
  {
    label: 'Pharma /api/status',
    href: PHARMA_API_STATUS_URL,
    external: true,
    description: 'Snapshot live: db, flags, agent runs (pentru cross-check).',
    tone: 'slate',
  },
];

const EXTERNAL_DASHBOARDS: Tile[] = [
  {
    label: 'Sentry — erori RSHIR',
    href: SENTRY_ORG_URL,
    external: true,
    description: 'Erori last 24h — customer + vendor + courier + admin + backend.',
    tone: 'amber',
  },
  {
    label: 'Vercel — toate proiectele',
    href: VERCEL_TEAM_URL,
    external: true,
    description: 'Deploys, preview URLs, domain config (5 proiecte).',
    tone: 'slate',
  },
  {
    label: 'Supabase Studio',
    href: 'https://supabase.com/dashboard',
    external: true,
    description: 'DB, Edge Functions, Cron, RLS.',
    tone: 'slate',
  },
  {
    label: 'GitHub events / PR feed',
    href: 'https://github.com/IulianMoldoveanu',
    external: true,
    description: 'Webhook → Hepi Telegram (CRITICAL/WARN).',
    tone: 'slate',
  },
];

const RUNBOOK_QUICK: Array<{ title: string; body: string }> = [
  {
    title: 'Zone livrare blocate — comenzi stagnante',
    body:
      'Control Room → filtrează după oraș → pune Pauză pe zona afectată. Verifică #curieri activi pe zona aia; sub 1 = sună managerul de flotă.',
  },
  {
    title: 'Curier offline — last_seen > 5 min',
    body:
      'Control Room → "Curieri activi" → sună curierul. Dacă nu răspunde: end shift manual + reassign comenzile.',
  },
  {
    title: 'Payout reconcile mismatch',
    body:
      'Tenant → tab "Payouts" → filtru MISMATCH. Cauze frecvente: refund post-payout, webhook PSP ratat, gateway_fee_ron lipsă (recompute-fees).',
  },
  {
    title: 'Order stuck în PREPARING peste SLA',
    body:
      'live_ops_telemetry.kitchen_overdue_over_15m > 0. Cancel + refund automat dacă plată online. Re-rulează POST /api/ai/dispatch pentru recover.',
  },
];

const TONE_CLASSES: Record<NonNullable<Tile['tone']>, string> = {
  emerald: 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10',
  violet: 'border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/10',
  amber: 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10',
  slate: 'border-slate-700 bg-slate-900/60 hover:bg-slate-900',
};

function TileCard({ tile }: { tile: Tile }) {
  const cls = `block rounded-2xl border p-5 transition ${TONE_CLASSES[tile.tone ?? 'slate']}`;
  const content = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-base font-semibold text-slate-100">
          {tile.label}
        </span>
        {tile.external && (
          <span aria-hidden className="text-xs text-slate-500">
            ↗
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-400">{tile.description}</p>
    </>
  );
  if (tile.external) {
    return (
      <a className={cls} href={tile.href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return (
    <Link className={cls} href={tile.href}>
      {content}
    </Link>
  );
}

type Last24hStats = {
  newOrders: number | null;
  newTenants: number | null;
  openOpsAlerts: number | null;
  failedFunctionRuns: number | null;
};

async function fetchLast24hStats(): Promise<Last24hStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // We swallow per-query errors so one missing table doesn't break the
  // whole tile — counts fall back to `null` and render as "—".
  async function countSafe(table: string): Promise<number | null> {
    try {
      const { count, error } = await sb
        .from(table)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since);
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  async function countOpenAlerts(): Promise<number | null> {
    try {
      const { count, error } = await sb
        .from('ops_alerts')
        .select('*', { count: 'exact', head: true })
        .is('resolved_at', null);
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  async function countFailedRuns(): Promise<number | null> {
    try {
      const { count, error } = await sb
        .from('edge_function_runs')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', since)
        .eq('status', 'FAILED');
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  }

  const [newOrders, newTenants, openOpsAlerts, failedFunctionRuns] = await Promise.all([
    countSafe('orders'),
    countSafe('tenants'),
    countOpenAlerts(),
    countFailedRuns(),
  ]);

  return { newOrders, newTenants, openOpsAlerts, failedFunctionRuns };
}

// Cross-vertical delivery-infrastructure snapshot. This is what makes the hub a
// true Command Center: it reads the shared `courier_orders` spine (where BOTH
// restaurant and pharma deliveries converge) + fleets/couriers/verifications,
// so Iulian sees the whole multi-vendor delivery network in one place. Each
// count is independent + error-swallowed (renders "—" on failure).
type DeliveryInfraStats = {
  ordersRestaurant24h: number | null;
  ordersPharma24h: number | null;
  ordersInProgress: number | null;
  activeFleets: number | null;
  activeCouriers: number | null;
  pendingKyc: number | null;
  pendingKyf: number | null;
};

async function fetchDeliveryInfraStats(): Promise<DeliveryInfraStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createAdminClient() as any;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function count(table: string, build: (q: any) => any): Promise<number | null> {
    try {
      const { count: c, error } = await build(
        sb.from(table).select('*', { count: 'exact', head: true }),
      );
      if (error) return null;
      return c ?? 0;
    } catch {
      return null;
    }
  }

  const IN_PROGRESS = ['CREATED', 'OFFERED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];
  const [
    ordersRestaurant24h,
    ordersPharma24h,
    ordersInProgress,
    activeFleets,
    activeCouriers,
    pendingKyc,
    pendingKyf,
  ] = await Promise.all([
    count('courier_orders', (q) => q.eq('vertical', 'restaurant').gte('created_at', since)),
    count('courier_orders', (q) => q.eq('vertical', 'pharma').gte('created_at', since)),
    count('courier_orders', (q) => q.in('status', IN_PROGRESS)),
    count('courier_fleets', (q) => q.eq('is_active', true)),
    count('courier_profiles', (q) => q.eq('status', 'ACTIVE')),
    count('courier_kyc', (q) => q.eq('kyc_status', 'PENDING')),
    count('fleet_kyf', (q) => q.eq('kyf_status', 'PENDING')),
  ]);

  return {
    ordersRestaurant24h,
    ordersPharma24h,
    ordersInProgress,
    activeFleets,
    activeCouriers,
    pendingKyc,
    pendingKyf,
  };
}

function fmtCount(n: number | null): string {
  return n === null ? '—' : n.toString();
}

export default async function AdminHubPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login?next=/dashboard/admin/hub');

  if (!isPlatformAdminEmail(user.email)) {
    return (
      <main className="min-h-screen bg-zinc-50 p-10">
        <div className="mx-auto max-w-2xl rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Acces interzis: această pagină este rezervată administratorilor de
          platformă HIR.
        </div>
      </main>
    );
  }

  const [stats, infra] = await Promise.all([fetchLast24hStats(), fetchDeliveryInfraStats()]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-xs font-bold text-white shadow-md shadow-purple-600/40"
            >
              H
            </span>
            <span className="font-display text-base font-bold">HIR Command Center</span>
            <span className="text-xs text-slate-500">infrastructură de livrare multi-vendor</span>
          </div>
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-slate-200">
            ← Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <h1 className="font-display text-3xl font-bold">Bun venit, Iulian.</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Centrul unic de control al infrastructurii de livrare HIR. Restaurante
          și farmacii converg în același bazin de curieri — le orchestrezi pe toate
          de aici. Mai jos: pulsul live al rețelei, apoi toate suprafețele de operare.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">
            Infrastructură de livrare — live (toate verticalele)
          </h2>
          <Link
            href="/dashboard/admin/orders"
            className="text-xs font-medium text-purple-300 hover:underline"
          >
            Comenzi cross-vertical →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Link
            href="/dashboard/admin/orders"
            className="rounded-2xl border border-purple-500/40 bg-purple-500/5 p-5 transition hover:bg-purple-500/10"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">În curs</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(infra.ordersInProgress)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">comenzi active</p>
          </Link>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">🍕 Restaurant 24h</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(infra.ordersRestaurant24h)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">💊 Pharma 24h</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(infra.ordersPharma24h)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Flote active</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(infra.activeFleets)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">Curieri activi</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(infra.activeCouriers)}
            </p>
          </div>
          <a
            href={`${COURIER_PWA_URL.replace(/\/$/, '')}/admin/verifications`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 transition hover:bg-amber-500/10"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">Verificări ↗</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(
                infra.pendingKyc === null && infra.pendingKyf === null
                  ? null
                  : (infra.pendingKyc ?? 0) + (infra.pendingKyf ?? 0),
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              KYC {fmtCount(infra.pendingKyc)} · KYF {fmtCount(infra.pendingKyf)}
            </p>
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Iulian — last 24h
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Comenzi noi</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(stats.newOrders)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Tenants noi</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(stats.newTenants)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Ops alerts deschise</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(stats.openOpsAlerts)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Cron failed</p>
            <p className="mt-1 font-display text-2xl font-bold text-slate-100">
              {fmtCount(stats.failedFunctionRuns)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Pentru detalii: <Link className="text-emerald-300 hover:underline" href="/dashboard/admin/observability/function-runs">edge function runs</Link>
          {' · '}
          <Link className="text-emerald-300 hover:underline" href="/dashboard/admin/control-room">control room</Link>
          {' · '}
          <a className="text-emerald-300 hover:underline" href={SENTRY_ORG_URL} target="_blank" rel="noopener noreferrer">Sentry ↗</a>
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          RSHIR — operare
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RSHIR_TILES.map((t) => (
            <TileCard key={t.label} tile={t} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
          Proiecte conexe
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CROSS_PROJECT.map((t) => (
            <TileCard key={t.label} tile={t} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
          Dashboards externe
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXTERNAL_DASHBOARDS.map((t) => (
            <TileCard key={t.label} tile={t} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
          Runbook rapid — top 4 incidente
        </h2>
        <ol className="mt-4 space-y-3">
          {RUNBOOK_QUICK.map((r, i) => (
            <li
              key={r.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <p className="text-sm font-semibold text-slate-100">
                {i + 1}. {r.title}
              </p>
              <p className="mt-1 text-sm text-slate-400">{r.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          Runbook complet:{' '}
          <span className="font-mono text-slate-400">
            docs/runbooks/RSHIR-OPERATOR-RUNBOOK.md
          </span>
          {' · '}
          Pharma runbook:{' '}
          <a
            className="text-emerald-300 hover:underline"
            href="https://github.com/IulianMoldoveanu/HIR-PHARMA/blob/main/docs/runbook/OPERATOR-RUNBOOK.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            HIR-PHARMA/docs/runbook/OPERATOR-RUNBOOK.md ↗
          </a>
        </p>
      </section>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        RSHIR Admin Hub · refresh la fiecare load · stats 24h via Supabase
      </footer>
    </main>
  );
}
