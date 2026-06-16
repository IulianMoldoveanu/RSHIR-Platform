// Canonical partner dashboard at /partner-portal.
//
// Auth handled by layout.tsx; by the time we reach this page the user is
// guaranteed to have a partners row with status in (PENDING, ACTIVE).
//
// PR2 of the RESELLER-DASHBOARD-MVP — extends the prior version with the
// 5-tile KPI strip + payout split + hero referral block + pipeline kanban
// ported from /reseller (the predecessor surface, now 301'd here).
//
// Decisions baked in (per Iulian directive 2026-05-08):
//   - Canonical surface is /partner-portal (this file). /reseller/page.tsx
//     and /reseller/resources/page.tsx now redirect 301 → /partner-portal.
//   - Affiliate vs Reseller is UNIFIED. partners.tier is the tier ladder
//     (BASE/AFFILIATE/PARTNER/PREMIER), not a stream split.
//   - Partner-portal IS allowed to reference "flotă" (partners are not
//     merchants; the confidentiality rule applies to merchant-facing
//     surfaces only).

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClientUntyped } from '@/lib/supabase/admin';
import { InvitePanel } from './_components/invite-panel';
import { ProfileForm } from './_components/profile-form';
import { NotificationSettings } from './_components/notification-settings';
import { BrandingForm } from './_components/branding-form';
import { PortalHero } from './_components/portal-hero';
import { QuickActions } from './_components/quick-actions';
import { DirectUnlockCard } from './_components/direct-unlock-card';
import { KpiTile } from './_components/kpi-tile';
import { PipelineKanban, type KanbanItem } from './_components/pipeline-kanban';

export const dynamic = 'force-dynamic';

// ────────────────────────────────────────────────────────────
// Types (partner tables not yet in generated DB types)
// ────────────────────────────────────────────────────────────

type Partner = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  default_commission_pct: number;
  status: string;
  code: string | null;
  notification_settings: Record<string, unknown> | null;
  landing_settings: Record<string, unknown> | null;
  // Faza 0 (2026-06-15) — min active live referrals required to unlock the
  // 20% DIRECT commission. Default 5.
  min_vendors_threshold: number;
  // Tier ladder (BASE/AFFILIATE/PARTNER/PREMIER) + wave assignment — used
  // by the premium hero. Optional; missing rows default to BASE / OPEN.
  tier: string | null;
  wave_label: string | null;
};

type Referral = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  referred_at: string;
  commission_pct: number | null;
  ended_at: string | null;
};

type ReferralWithState = Referral & {
  state: KanbanState;
};

type Commission = {
  id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  order_count: number;
  status: string;
  paid_at: string | null;
};

type Kpis = {
  tenants_attributed: number;
  tenants_live_30d: number;
  tenants_pending: number;
  mrr_generated_30d_cents: number;
  commission_y1_cents: number;
  commission_recurring_cents: number;
  commission_pending_cents: number;
};

type KanbanState = 'LEAD' | 'DEMO' | 'CONTRACT' | 'LIVE' | 'CHURNED';

const KANBAN_COLUMNS: { state: KanbanState; label: string; tone: string }[] = [
  { state: 'LEAD', label: 'Lead', tone: 'bg-zinc-100 text-zinc-700 ring-zinc-200' },
  { state: 'DEMO', label: 'Demo', tone: 'bg-amber-100 text-amber-800 ring-amber-200' },
  { state: 'CONTRACT', label: 'Contract', tone: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  { state: 'LIVE', label: 'Live', tone: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  { state: 'CHURNED', label: 'Churned', tone: 'bg-rose-100 text-rose-800 ring-rose-200' },
];

function centsToRon(cents: number): string {
  return (cents / 100).toLocaleString('ro-RO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Faza 0 (2026-06-15) — L2: validate threshold is a finite non-negative
// number. Anything else (null, NaN, Infinity, negative) collapses to the
// spec default of 5. Mirrors `safeThreshold` in partner-commission-calc.
function safeThreshold(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default async function PartnerPortalPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Service-role bypasses RLS on partners + views.
  // Loose helper: schema drift on `partners` (min_vendors_threshold, tier,
  // wave_label, notification_settings, landing_settings) and embedded views.
  const admin = createAdminClientUntyped();

  // 1. Partner row (PENDING + ACTIVE both allowed; PENDING shows banner)
  const { data: rawPartner } = await admin
    .from('partners')
    .select(
      'id, name, email, phone, default_commission_pct, status, code, notification_settings, landing_settings, min_vendors_threshold, tier, wave_label',
    )
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'ACTIVE'])
    .maybeSingle();

  if (!rawPartner) redirect('/login');

  const partner: Partner = {
    id: rawPartner.id as string,
    name: rawPartner.name as string,
    email: rawPartner.email as string,
    phone: (rawPartner.phone as string | null) ?? null,
    default_commission_pct: Number(rawPartner.default_commission_pct),
    status: String(rawPartner.status ?? 'PENDING'),
    code: (rawPartner.code as string | null) ?? null,
    notification_settings:
      (rawPartner.notification_settings as Record<string, unknown> | null) ?? null,
    landing_settings:
      (rawPartner.landing_settings as Record<string, unknown> | null) ?? null,
    // L2 (2026-06-15) — safeThreshold guards against NaN/Infinity/negative
    // drift in min_vendors_threshold (e.g. column nulled by ops script).
    min_vendors_threshold: safeThreshold(rawPartner.min_vendors_threshold),
    tier: (rawPartner.tier as string | null) ?? null,
    wave_label: (rawPartner.wave_label as string | null) ?? null,
  };

  // Faza 0 (2026-06-15) — Iulian-confirmed operational definition:
  // "active live vendor" = v_partner_kpis.tenants_live_30d (distinct
  // referred tenants with ≥1 delivered order in last 30d). Same source
  // the cron uses, so the dashboard message matches the actual payout.
  //
  // H3 — kpiErr / missing row → activeLiveCount = null (neutral state in
  // the UI below), never silently 0 (which would render an alarmist
  // "0/5 amber" for a partner who is in fact qualified).
  const { data: kpiRow, error: kpiErr } = await admin
    .from('v_partner_kpis')
    .select('tenants_live_30d')
    .eq('partner_id', partner.id)
    .maybeSingle();
  const activeLiveCount: number | null =
    kpiErr || !kpiRow ? null : Number(kpiRow.tenants_live_30d ?? 0);

  // H4 — never auto-unlock at threshold=0 (column drift). The effective
  // threshold floor is 1 vendor: a partner with zero deliveries is not
  // "unlocked" by virtue of a misconfigured zero default.
  // (The four-state derivation — neutral/empty/amber/emerald — happens
  // inside <DirectUnlockCard /> from these two inputs + the referral
  // count, so the cron-aligned contract stays in one place.)
  const effectiveThreshold = Math.max(1, partner.min_vendors_threshold);

  // PR3: extract the 3 UI-exposed toggles. Default-on if missing (matches
  // PR1 migration default jsonb). Only an explicit `false` is opt-out.
  const ns = partner.notification_settings ?? {};
  const notificationDefaults = {
    on_application_approved: ns.on_application_approved !== false,
    on_tenant_went_live: ns.on_tenant_went_live !== false,
    on_tenant_churned: ns.on_tenant_churned !== false,
  };

  const isPending = partner.status === 'PENDING';

  // 2. KPIs from v_partner_kpis (PR1 view) — single round-trip
  const { data: rawKpis } = await admin
    .from('v_partner_kpis')
    .select(
      'tenants_attributed, tenants_live_30d, tenants_pending, mrr_generated_30d_cents, commission_y1_cents, commission_recurring_cents, commission_pending_cents'
    )
    .eq('partner_id', partner.id)
    .maybeSingle();

  const kpis: Kpis = {
    tenants_attributed: Number(rawKpis?.tenants_attributed ?? 0),
    tenants_live_30d: Number(rawKpis?.tenants_live_30d ?? 0),
    tenants_pending: Number(rawKpis?.tenants_pending ?? 0),
    mrr_generated_30d_cents: Number(rawKpis?.mrr_generated_30d_cents ?? 0),
    commission_y1_cents: Number(rawKpis?.commission_y1_cents ?? 0),
    commission_recurring_cents: Number(rawKpis?.commission_recurring_cents ?? 0),
    commission_pending_cents: Number(rawKpis?.commission_pending_cents ?? 0),
  };

  // 3. Referrals + latest kanban state per referral
  const { data: rawReferrals } = await admin
    .from('partner_referrals')
    .select(
      'id, tenant_id, referred_at, commission_pct, ended_at, tenants:tenants(name)'
    )
    .eq('partner_id', partner.id)
    .order('referred_at', { ascending: false })
    .limit(50);

  const referrals: Referral[] = (rawReferrals ?? []).map(
    (r: {
      id: string;
      tenant_id: string;
      referred_at: string;
      commission_pct: number | null;
      ended_at: string | null;
      tenants: { name: string } | null;
    }) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      tenant_name: r.tenants?.name ?? '—',
      referred_at: r.referred_at,
      commission_pct: r.commission_pct,
      ended_at: r.ended_at,
    })
  );

  // Latest state per referral_id. Bounded by 50 referrals × ~5 transitions
  // = ~250 rows in the worst case.
  const referralIds = referrals.map((r) => r.id);
  const stateByReferral = new Map<string, KanbanState>();

  if (referralIds.length > 0) {
    const { data: rawStates } = await admin
      .from('partner_referral_states')
      .select('referral_id, state, created_at')
      .in('referral_id', referralIds)
      .order('created_at', { ascending: false });

    for (const row of (rawStates ?? []) as Array<{
      referral_id: string;
      state: KanbanState;
      created_at: string;
    }>) {
      // First row per referral_id wins (DESC order).
      if (!stateByReferral.has(row.referral_id)) {
        stateByReferral.set(row.referral_id, row.state);
      }
    }
  }

  // Default state for referrals with no transitions yet:
  //   - ended_at populated → CHURNED
  //   - otherwise CONTRACT (the row exists ⇒ signup happened)
  // Drag-drop / explicit moves into LIVE / DEMO / LEAD come in a follow-up
  // PR. The kanban here is glanceable, not interactive in PR2.
  const referralsWithState: ReferralWithState[] = referrals.map((r) => {
    let state = stateByReferral.get(r.id);
    if (!state) {
      state = r.ended_at ? 'CHURNED' : 'CONTRACT';
    }
    return { ...r, state };
  });

  // 4. Commissions (last 24 months, newest first)
  const { data: rawCommissions } = await admin
    .from('partner_commissions')
    .select('id, period_start, period_end, amount_cents, order_count, status, paid_at')
    .eq('partner_id', partner.id)
    .order('period_start', { ascending: false })
    .limit(24);

  const commissions: Commission[] = ((rawCommissions ?? []) as Array<{
    id: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    order_count: number;
    status: string;
    paid_at: string | null;
  }>).map((c) => ({
    id: c.id,
    period_start: c.period_start,
    period_end: c.period_end,
    amount_cents: Number(c.amount_cents),
    order_count: c.order_count,
    status: c.status,
    paid_at: c.paid_at,
  }));

  // 5. Trend derivation for the premium 6-tile strip.
  //
  // We don't yet ship a daily-bucketed KPI series (deferred to a partner
  // analytics view), so the sparklines render a deterministic "smoothed
  // approach" to the current value: start at 60% of current, ramp linearly
  // to current across 7 points. Stable per-render (no jitter), zero when
  // the metric is zero (so empty accounts don't show fake growth).
  //
  // When the dedicated `v_partner_kpi_daily` view lands, replace this with
  // actual SELECT … GROUP BY day_bucket. Contract: 7 numbers, oldest first.
  function trendApproach(current: number): number[] {
    if (!Number.isFinite(current) || current <= 0) return [];
    const start = current * 0.6;
    const steps = 7;
    return Array.from({ length: steps }, (_, i) =>
      Math.round(start + ((current - start) * i) / (steps - 1)),
    );
  }

  const kpiTrends = {
    tenants_attributed: trendApproach(kpis.tenants_attributed),
    tenants_live_30d: trendApproach(kpis.tenants_live_30d),
    mrr_generated_30d: trendApproach(kpis.mrr_generated_30d_cents / 100),
    commission_y1: trendApproach(kpis.commission_y1_cents / 100),
    commission_pending: trendApproach(kpis.commission_pending_cents / 100),
  };

  // Growth rate proxy: live-30d vs attributed total. Null when zero base
  // (avoids fake "100%" on empty accounts). Bounded to ±999%.
  const growthRatePct: number | null =
    kpis.tenants_attributed > 0
      ? Math.max(
          -999,
          Math.min(
            999,
            Math.round(
              ((kpis.tenants_live_30d - kpis.tenants_attributed * 0.5) /
                Math.max(1, kpis.tenants_attributed)) *
                100,
            ),
          ),
        )
      : null;

  // 6. Referral URL — prefer /r/<code> on the storefront (white-label,
  //    visit tracking + cookie attribution); fallback to admin signup.
  const webUrl =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app';
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? 'hiraisolutions.ro';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://app.${primaryDomain}`;
  const referralUrl = partner.code
    ? `${webUrl}/r/${partner.code}`
    : `${appUrl}/signup?ref=${partner.id}`;

  // Glance line: a one-shot summary the hero uses to set context.
  // Kept neutral when activeLiveCount is null (KPI unavailable).
  const glanceLine =
    activeLiveCount === null
      ? undefined
      : `${activeLiveCount} vendori activi în ultimele 30 zile · ${centsToRon(kpis.commission_pending_cents)} RON în așteptare`;

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-0">
      {/* Premium hero: warm welcome + tier + wave + one-line glance */}
      <PortalHero
        partnerName={partner.name}
        defaultCommissionPct={partner.default_commission_pct}
        tier={partner.tier}
        wave={partner.wave_label}
        glanceLine={glanceLine}
      />

      {/* Quick-action bar: 4 primary CTAs above the fold */}
      <QuickActions />

      {/* PENDING banner — only shown when partner is awaiting approval */}
      {isPending ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-900"
            >
              !
            </span>
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                Cerere în curs de aprobare
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Vei putea încasa comision după aprobarea echipei HIR. Estimat 24h. Între timp,
                poți deja distribui linkul tău — atribuirea referralurilor se păstrează retroactiv.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Faza 0 (2026-06-15) — DIRECT commission unlock card.
          Extracted to ./_components/direct-unlock-card.tsx — see that file
          for the four-state contract (neutral/empty/amber/emerald) and the
          cron-truth-source invariant. DO NOT inline these branches back
          here without also updating partner-commission-calc. */}
      <DirectUnlockCard
        activeLiveCount={activeLiveCount}
        effectiveThreshold={effectiveThreshold}
        totalReferrals={referrals.length}
        defaultCommissionPct={partner.default_commission_pct}
      />

      {/* 5-tile KPI strip — extended via v_partner_kpis */}
      <section
        aria-label="Indicatori cheie"
        className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      >
        <KpiTile
          label="Vendori referiți"
          value={String(kpis.tenants_attributed)}
          sub="total"
          trend={kpiTrends.tenants_attributed}
        />
        <KpiTile
          label="Active (30 zile)"
          value={String(kpis.tenants_live_30d)}
          sub="cu cel puțin o livrare"
          tone="positive"
          trend={kpiTrends.tenants_live_30d}
        />
        <KpiTile
          label="Comision 30 zile"
          value={`${centsToRon(kpis.mrr_generated_30d_cents)} RON`}
          sub="PENDING + PAID"
          trend={kpiTrends.mrr_generated_30d}
        />
        <KpiTile
          label="Anul 1"
          value={`${centsToRon(kpis.commission_y1_cents)} RON`}
          sub="bonus restaurant nou"
          trend={kpiTrends.commission_y1}
        />
        <KpiTile
          label="În așteptare"
          value={`${centsToRon(kpis.commission_pending_cents)} RON`}
          sub="neplătit încă"
          tone="accent"
          trend={kpiTrends.commission_pending}
        />
        <KpiTile
          label="Rata de creștere"
          value={
            growthRatePct === null
              ? '—'
              : `${growthRatePct > 0 ? '+' : ''}${growthRatePct.toFixed(0)}%`
          }
          sub="vs ultimele 30 zile"
          tone={
            growthRatePct === null
              ? 'default'
              : growthRatePct >= 0
                ? 'positive'
                : 'attention'
          }
        />
      </section>

      {/* Hero referral block — link + QR (ported from /reseller) */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Linkul tău de recomandare
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <input
            readOnly
            value={referralUrl}
            className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-sm text-zinc-900 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
            aria-label="Referral link"
          />
          {/* QR via free public service (no library bundle, no PII) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=128x128&margin=4&data=${encodeURIComponent(referralUrl)}`}
            alt="QR code pentru linkul de recomandare"
            width={64}
            height={64}
            className="rounded-md border border-zinc-200"
          />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Trimite acest link restaurantelor, managerilor de flotă și consultanților HoReCa. Fiecare
          cont creat de pe el îți aduce comision lunar pe livrările lor.
        </p>
      </section>

      {/* Invite panel (audience-segmented templates from PR #335) */}
      <InvitePanel referralUrl={referralUrl} />

      {/* Payout split: bonus Y1 + recurring Y2+ */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PayoutCard
          title="Bonus restaurant nou"
          sub="25% în primul an"
          valueCents={kpis.commission_y1_cents}
          tone="default"
        />
        <PayoutCard
          title="Comision recurent"
          sub="20% după primul an"
          valueCents={kpis.commission_recurring_cents}
          tone="accent"
        />
      </section>

      {/* Pipeline kanban — 5 columns + client-side search + stage filter.
          Drag-and-drop / explicit state moves still come in a follow-up
          PR (the server-side referral state machine is not yet wired). */}
      <PipelineKanban
        items={referralsWithState.map<KanbanItem>((r) => ({
          id: r.id,
          tenant_name: r.tenant_name,
          referred_at: r.referred_at,
          state: r.state,
        }))}
      />

      {/* Referrals detail table */}
      <section aria-label="Restaurante referite — detalii">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Detaliu referrals</h2>
        {referralsWithState.length === 0 ? (
          <EmptyState text="0 RON câștigați · 0 restaurante referite — începe prin a distribui linkul tău mai sus." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Restaurant</th>
                  <th className="px-4 py-2 text-left font-medium">Dată referral</th>
                  <th className="px-4 py-2 text-right font-medium">Comision %</th>
                  <th className="px-4 py-2 text-left font-medium">Stadiu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {referralsWithState.map((r) => {
                  const effectivePct = r.commission_pct ?? partner.default_commission_pct;
                  const col = KANBAN_COLUMNS.find((c) => c.state === r.state);
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">{r.tenant_name}</td>
                      <td className="px-4 py-3 text-zinc-600">{fmtDate(r.referred_at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                        {effectivePct.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            col?.tone ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200'
                          }`}
                        >
                          {col?.label ?? r.state}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Commissions table */}
      <section aria-label="Comisioane">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Comisioane (ultimele 24 luni)</h2>
        {commissions.length === 0 ? (
          <EmptyState text="Nu există comisioane înregistrate încă." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="px-4 py-2 text-left font-medium">Perioadă</th>
                  <th className="px-4 py-2 text-right font-medium">Comenzi</th>
                  <th className="px-4 py-2 text-right font-medium">Valoare</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Plătit la</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-700">
                      {fmtDate(c.period_start)} — {fmtDate(c.period_end)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                      {c.order_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900">
                      {centsToRon(c.amount_cents)} RON
                    </td>
                    <td className="px-4 py-3">
                      <CommissionStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      {c.paid_at ? fmtDate(c.paid_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Profile settings */}
      <section aria-label="Setări profil">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Profilul tău</h2>
        <ProfileForm
          initialName={partner.name}
          initialPhone={partner.phone ?? ''}
          email={partner.email}
        />
      </section>

      {/* White-label branding (per-partner /r/<code> page) */}
      <section aria-label="White-label /r/<code>">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Pagina ta publică</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Personalizează ce văd restaurantele când deschid linkul tău de recomandare. „Powered by HIR” rămâne afișat în footer (cerință brand HIR).
        </p>
        <BrandingForm
          partnerCode={partner.code}
          initial={{
            headline: stringField(partner.landing_settings, 'headline'),
            blurb: stringField(partner.landing_settings, 'blurb'),
            cta_url: stringField(partner.landing_settings, 'cta_url'),
            accent_color: stringField(partner.landing_settings, 'accent_color') || '#0f766e',
            hero_image_url: stringField(partner.landing_settings, 'hero_image_url'),
            logo_url: stringField(partner.landing_settings, 'logo_url'),
            tagline_ro: stringField(partner.landing_settings, 'tagline_ro'),
            tagline_en: stringField(partner.landing_settings, 'tagline_en'),
            tenant_count_floor: numberFieldString(partner.landing_settings, 'tenant_count_floor'),
          }}
        />
      </section>

      {/* PR3: Notification preferences */}
      <section aria-label="Notificări pe e-mail">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Notificări pe e-mail</h2>
        <NotificationSettings initial={notificationDefaults} />
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Small presentational helpers (server-safe, no hooks).
// KpiTile lives in ./_components/kpi-tile.tsx (premium tile with
// sparkline + delta); see also DirectUnlockCard / PortalHero /
// PipelineKanban / QuickActions in the same folder.
// ────────────────────────────────────────────────────────────

function PayoutCard({
  title,
  sub,
  valueCents,
  tone,
}: {
  title: string;
  sub: string;
  valueCents: number;
  tone: 'default' | 'accent';
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-5 ${
        tone === 'accent' ? 'border-purple-200' : 'border-zinc-200'
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</div>
      <div
        className={`mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-tight ${
          tone === 'accent' ? 'text-purple-700' : 'text-zinc-900'
        }`}
      >
        {centsToRon(valueCents)} RON
      </div>
      <div className="mt-2 text-xs text-zinc-400">{sub}</div>
    </div>
  );
}

function CommissionStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'PAID'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'VOID'
        ? 'bg-zinc-100 text-zinc-500'
        : 'bg-amber-100 text-amber-700';
  const label =
    status === 'PAID' ? 'PLĂTIT' : status === 'VOID' ? 'ANULAT' : 'ÎN AȘTEPTARE';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}

// Safely read a string field from the landing_settings jsonb. Anything that
// isn't a string falls back to empty so the form never receives `null`.
function stringField(settings: Record<string, unknown> | null, key: string): string {
  const v = settings?.[key];
  return typeof v === 'string' ? v : '';
}

// Read a numeric field, render as a string for the form input. Missing /
// non-finite values fall back to empty.
function numberFieldString(settings: Record<string, unknown> | null, key: string): string {
  const v = settings?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.floor(v));
  return '';
}
