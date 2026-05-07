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
import { createAdminClient } from '@/lib/supabase/admin';
import { InvitePanel } from './_components/invite-panel';
import { ProfileForm } from './_components/profile-form';
import { NotificationSettings } from './_components/notification-settings';
import { BrandingForm } from './_components/branding-form';

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

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default async function PartnerPortalPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Service-role bypasses RLS on partners + views.
  // Cast loosely because partner tables aren't in generated DB types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Partner row (PENDING + ACTIVE both allowed; PENDING shows banner)
  const { data: rawPartner } = await admin
    .from('partners')
    .select(
      'id, name, email, phone, default_commission_pct, status, code, notification_settings, landing_settings',
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
  };

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

  // Group by kanban column
  const kanbanGrouped = new Map<KanbanState, ReferralWithState[]>();
  for (const col of KANBAN_COLUMNS) kanbanGrouped.set(col.state, []);
  for (const r of referralsWithState) {
    kanbanGrouped.get(r.state)?.push(r);
  }

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

  // 5. Referral URL — prefer /r/<code> on the storefront (white-label,
  //    visit tracking + cookie attribution); fallback to admin signup.
  const webUrl =
    process.env.NEXT_PUBLIC_RESTAURANT_WEB_URL ?? 'https://hir-restaurant-web.vercel.app';
  const primaryDomain = process.env.NEXT_PUBLIC_PRIMARY_DOMAIN ?? 'hiraisolutions.ro';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://app.${primaryDomain}`;
  const referralUrl = partner.code
    ? `${webUrl}/r/${partner.code}`
    : `${appUrl}/signup?ref=${partner.id}`;

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Bună, {partner.name}
        </h1>
        <p className="text-sm text-zinc-500">
          Comisionul tău implicit:{' '}
          <span className="font-medium text-zinc-700">
            {partner.default_commission_pct.toFixed(0)}%
          </span>
        </p>
      </header>

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

      {/* 5-tile KPI strip — extended via v_partner_kpis */}
      <section
        aria-label="Indicatori cheie"
        className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      >
        <KpiTile
          label="Restaurante referite"
          value={String(kpis.tenants_attributed)}
          sub="total"
        />
        <KpiTile
          label="Active (30 zile)"
          value={String(kpis.tenants_live_30d)}
          sub="cu cel puțin o livrare"
        />
        <KpiTile
          label="În onboarding"
          value={String(kpis.tenants_pending)}
          sub="signup, încă nu live"
        />
        <KpiTile
          label="Comision 30 zile"
          value={`${centsToRon(kpis.mrr_generated_30d_cents)} RON`}
          sub="PENDING + PAID"
        />
        <KpiTile
          label="În așteptare"
          value={`${centsToRon(kpis.commission_pending_cents)} RON`}
          sub="neplătit încă"
          accent
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

      {/* Pipeline kanban — 5 columns, server-rendered (drag-drop in follow-up) */}
      <section aria-label="Pipeline referrals">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Pipeline referrals</h2>
          <span className="text-xs text-zinc-400">{referralsWithState.length} total</span>
        </div>
        {referralsWithState.length === 0 ? (
          <EmptyState text="Pipeline-ul tău se populează automat când distribui linkul de mai sus." />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {KANBAN_COLUMNS.map((col) => {
              const items = kanbanGrouped.get(col.state) ?? [];
              return (
                <div
                  key={col.state}
                  className="flex min-h-[140px] flex-col rounded-lg border border-zinc-200 bg-white p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${col.tone}`}
                    >
                      {col.label}
                    </span>
                    <span className="text-xs tabular-nums text-zinc-400">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.length === 0 ? (
                      <p className="text-[11px] text-zinc-400">—</p>
                    ) : (
                      items.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2"
                          title={`Referit la ${fmtDate(r.referred_at)}`}
                        >
                          <p className="truncate text-xs font-medium text-zinc-900">
                            {r.tenant_name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-zinc-500">
                            {fmtDate(r.referred_at)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
// Small presentational helpers (server-safe, no hooks)
// ────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          accent ? 'text-purple-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
    </div>
  );
}

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
